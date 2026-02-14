'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/cn';
import { useBuilderStore } from '@/features/builder/store';
import { useRegulations } from '@/features/regulations/hooks';
import { Sidebar } from '@/components/layout/Sidebar';
import { ModuleLibrary } from '@/components/builder/ModuleLibrary';
import { BuilderToolbar } from '@/components/builder/BuilderToolbar';
import { FloorNavigator } from '@/components/builder/FloorNavigator';
import { PropertyPanel } from '@/components/builder/PropertyPanel';
import { CostStatusBar } from '@/components/builder/CostStatusBar';
import { BuilderToast } from '@/components/builder/BuilderToast';
import { BoxSelectOverlay } from '@/components/builder/BoxSelectOverlay';
import { FLOOR_HEIGHT } from '@/lib/constants/grid';
import { getModuleById } from '@/lib/constants/modules';
import { getMaterialById } from '@/lib/constants/materials';
import { formatWon, formatDate } from '@/lib/utils/format';
import type { ParcelInput } from '@/features/regulations/engine';
import type { ParcelInfo } from '@/types/land';
import type { ModulePlacement } from '@/types/builder';
import { fetchParcelByPnu } from '@/features/land/services';
import { useSpeckleSync } from '@/lib/speckle/useSpeckleSync';
import { useIsMobile } from '@/hooks/useIsMobile';

const BuilderCanvas = dynamic(
  () => import('@/components/builder/BuilderCanvas').then((m) => m.BuilderCanvas),
  { ssr: false },
);


function computeStats(placements: ModulePlacement[]) {
  let totalArea = 0;
  let totalCost = 0;
  for (const p of placements) {
    const mod = getModuleById(p.moduleId);
    if (!mod) continue;
    totalArea += mod.width * mod.depth;
    const mat = p.materialId ? getMaterialById(p.materialId) : undefined;
    totalCost += mod.basePrice * (mat?.priceMultiplier ?? 1);
  }
  return { totalModules: placements.length, totalArea, totalCost };
}

export default function BuilderPage() {
  const params = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const projectId = params.projectId;
  const parcelPnu = searchParams.get('parcelPnu');
  const queryAppraisal = Number(searchParams.get('appraisalValue')) || 0;
  const queryMinBid = Number(searchParams.get('minBidPrice')) || 0;
  const queryBidStart = searchParams.get('bidStartDate') ?? '';
  const queryBidEnd = searchParams.get('bidEndDate') ?? '';

  const setProjectId = useBuilderStore((s) => s.setProjectId);
  const setProjectName = useBuilderStore((s) => s.setProjectName);
  const setMaxFloors = useBuilderStore((s) => s.setMaxFloors);
  const loadPlacements = useBuilderStore((s) => s.loadPlacements);
  const placements = useBuilderStore((s) => s.placements);
  const setParcelCenter = useBuilderStore((s) => s.setParcelCenter);

  const isMobile = useIsMobile();

  const [parcelInfo, setParcelInfo] = useState<ParcelInfo | null>(null);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [appraisalValue, setAppraisalValue] = useState(queryAppraisal);
  const [minBidPrice, setMinBidPrice] = useState(queryMinBid);
  const [bidStartDate, setBidStartDate] = useState(queryBidStart);
  const [bidEndDate, setBidEndDate] = useState(queryBidEnd);
  // 모바일에서 사이드바 자동 닫기
  useEffect(() => {
    if (isMobile) {
      setLeftSidebarOpen(false);
      setRightSidebarOpen(false);
    }
  }, [isMobile]);

  // 모바일: 사이드바 하나만 열리게 (상호 배타)
  const handleLeftSidebarChange = useCallback((open: boolean) => {
    setLeftSidebarOpen(open);
    if (isMobile && open) setRightSidebarOpen(false);
  }, [isMobile]);
  const handleRightSidebarChange = useCallback((open: boolean) => {
    setRightSidebarOpen(open);
    if (isMobile && open) setLeftSidebarOpen(false);
  }, [isMobile]);

  // effectivePnu: URL 쿼리 우선, 없으면 DB에서 로드한 값 사용
  const [dbParcelPnu, setDbParcelPnu] = useState<string | null>(null);
  const effectivePnu = parcelPnu ?? dbParcelPnu;

  // DB에서 프로젝트 로드가 완료되기 전까지 autosave 차단
  const loadedRef = useRef(false);
  // DB에 이미 존재하는 프로젝트인지 (한 번이라도 저장된 적 있는지)
  const existsInDbRef = useRef(false);
  // unmount/cleanup save 시 정확한 projectId를 참조하기 위한 ref
  const projectIdRef = useRef(projectId);

  // Load parcel data from effective PNU
  useEffect(() => {
    if (!effectivePnu) { setParcelCenter(null); return; }
    fetchParcelByPnu(effectivePnu).then((info) => {
      if (info) {
        setParcelInfo(info);
        if (info.centroidLat && info.centroidLng) {
          setParcelCenter({ lat: info.centroidLat, lng: info.centroidLng });
        }
      }
    });
  }, [effectivePnu, setParcelCenter]);

  // Build regulation input from parcel info or use defaults
  const parcel: ParcelInput = useMemo(() => {
    if (parcelInfo?.regulation) {
      const side = Math.sqrt(parcelInfo.area);
      return {
        area: parcelInfo.area,
        zoneType: parcelInfo.zoneType ?? 'ZONE_R2_GENERAL',
        width: side,
        depth: side,
      };
    }
    return { area: 200, zoneType: 'ZONE_R1_GENERAL' as const, width: 14, depth: 14.3 };
  }, [parcelInfo]);

  const regulation = useRegulations(parcel);

  // 규제 기반 최대 층수를 스토어에 반영
  useEffect(() => {
    if (regulation) {
      const floors = regulation.effectiveMaxFloors;
      setMaxFloors(Math.max(2, Math.min(floors, 50)));
    }
  }, [regulation, setMaxFloors]);

  // Save function (수동 저장 전용)
  const saveToServer = useCallback(async (pl: ModulePlacement[]) => {
    setSaveStatus('saving');
    try {
      const stats = computeStats(pl);
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parcelPnu: effectivePnu ?? undefined,
          appraisalValue,
          minBidPrice,
          bidStartDate: bidStartDate || undefined,
          bidEndDate: bidEndDate || undefined,
          ...stats,
          placements: pl.map((p) => ({
            moduleId: p.moduleId,
            gridX: p.gridX,
            gridY: p.gridY,
            gridZ: p.gridZ,
            rotation: p.rotation,
            floor: p.floor,
            materialId: p.materialId ?? null,
            customColor: p.customColor ?? null,
          })),
        }),
      });
      if (res.ok) {
        existsInDbRef.current = true;
        setSaveStatus('saved');
        setLastSavedAt(new Date().toLocaleTimeString('ko-KR'));
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    }
  }, [projectId, effectivePnu, appraisalValue, minBidPrice, bidStartDate, bidEndDate]);

  // Load project from DB
  useEffect(() => {
    // 프로젝트 전환: 이전 데이터 즉시 클리어, autosave 차단
    loadedRef.current = false;
    existsInDbRef.current = false;
    projectIdRef.current = projectId;
    setProjectId(projectId);
    loadPlacements([]);
    setProjectName('새 프로젝트');
    setDbParcelPnu(null);
    setParcelInfo(null);

    fetch(`/api/projects/${projectId}`)
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        // 로드 완료 전에 다른 프로젝트로 전환됐으면 무시
        if (projectIdRef.current !== projectId) return;
        if (!data) { loadedRef.current = true; return; }
        existsInDbRef.current = true;

        if (data.name) setProjectName(data.name);
        if (data.parcelPnu) setDbParcelPnu(data.parcelPnu);

        // 감정가/입찰기간: URL 쿼리 우선, 없으면 DB 값 사용
        const av = queryAppraisal || data.appraisalValue || 0;
        const mb = queryMinBid || data.minBidPrice || 0;
        setAppraisalValue(av);
        setMinBidPrice(mb);
        setBidStartDate(queryBidStart || data.bidStartDate || '');
        setBidEndDate(queryBidEnd || data.bidEndDate || '');

        const placements = Array.isArray(data.placements) ? data.placements : [];
        loadPlacements(
          placements.map((p: Record<string, unknown>) => ({
            id: (p.id as string) ?? `p_${Math.random().toString(36).slice(2, 8)}`,
            moduleId: p.moduleId as string,
            gridX: p.gridX as number,
            gridY: p.gridY as number,
            gridZ: p.gridZ as number,
            rotation: (p.rotation ?? 0) as number,
            floor: (p.floor ?? 1) as number,
            materialId: (p.materialId as string) ?? undefined,
            customColor: (p.customColor as string) ?? undefined,
          }))
        );
        loadedRef.current = true;
      })
      .catch(() => { loadedRef.current = true; });
  }, [projectId, setProjectId, loadPlacements, setProjectName]);

  // Refs for manual save
  const placementsRef = useRef(placements);
  placementsRef.current = placements;

  // Manual save (exposed to PropertyPanel via store)
  const manualSave = useCallback(() => {
    saveToServer(placementsRef.current);
  }, [saveToServer]);

  // 기존 프로젝트 5분 자동저장
  useEffect(() => {
    const interval = setInterval(() => {
      if (!loadedRef.current || !existsInDbRef.current) return;
      saveToServer(placementsRef.current);
    }, 300_000);
    return () => clearInterval(interval);
  }, [saveToServer]);

  // Rename project
  const handleRename = useCallback(async (name: string) => {
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
    } catch { /* ignore */ }
  }, [projectId]);

  // Speckle 모듈 자동 동기화 (백그라운드)
  useSpeckleSync();

  const showSurrounding = useBuilderStore((s) => s.showSurrounding);
  const showSatellite = useBuilderStore((s) => s.showSatellite);

  // Boundary dimensions from regulation
  const boundaryWidth = regulation
    ? Math.sqrt(regulation.buildableArea) * 1.2
    : 12;
  const boundaryDepth = regulation
    ? Math.sqrt(regulation.buildableArea) * 1.2
    : 12;
  const boundaryHeight = regulation
    ? regulation.zoneRegulation.maxHeight > 0
      ? regulation.zoneRegulation.maxHeight
      : regulation.effectiveMaxFloors * FLOOR_HEIGHT
    : 15;

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 3.5rem)' }}>
      {/* Parcel info banner */}
      {(parcelInfo || appraisalValue > 0) && (
        <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200 bg-blue-50 px-4 py-2', isMobile ? 'text-xs' : 'text-sm')}>
          {parcelInfo && (
            <>
              <span className="font-medium text-blue-900">{parcelInfo.address}</span>
              <span className="text-blue-700">|</span>
              <span className="text-blue-700">{parcelInfo.area.toFixed(1)}m²</span>
              <span className="text-blue-700">|</span>
              <span className="text-blue-700">
                건폐율 {parcelInfo.regulation?.maxCoverageRatio}% / 용적률 {parcelInfo.regulation?.maxFloorAreaRatio}%
              </span>
              {(parcelInfo.officialPrice != null && parcelInfo.officialPrice > 0) && (
                <>
                  <span className="text-blue-700">|</span>
                  <span className="text-blue-700">
                    공시지가 {formatWon(parcelInfo.officialPrice)}/m²
                  </span>
                </>
              )}
            </>
          )}
          {appraisalValue > 0 && (
            <>
              {parcelInfo && <span className="text-blue-700">|</span>}
              <span className="font-medium text-red-600">
                감정가 {formatWon(appraisalValue)}
                {minBidPrice > 0 && (
                  <span className="text-red-400"> (최저 {formatWon(minBidPrice)})</span>
                )}
              </span>
            </>
          )}
          {bidEndDate && (
            <>
              <div className="flex-1" />
              <span className="text-blue-700">
                입찰 {bidStartDate ? `${formatDate(bidStartDate)} ~ ` : ''}{formatDate(bidEndDate)}
              </span>
            </>
          )}
        </div>
      )}

      <div className="relative flex-1 overflow-hidden bg-slate-100">
        {/* Center: 3D Canvas */}
        <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 max-w-[calc(100vw-2rem)]">
          <BuilderToolbar />
        </div>

        {/* Toast message overlay */}
        <BuilderToast />

        {/* Box select rectangle overlay */}
        <BoxSelectOverlay />
        {/* 층 네비게이터 — 모바일에서 사이드바 열릴 때 숨김 */}
        {!(isMobile && (leftSidebarOpen || rightSidebarOpen)) && (
          <div
            className="absolute bottom-3 z-30 transition-[right] duration-300"
            style={{ right: rightSidebarOpen ? 'calc(18rem + 0.75rem)' : '0.75rem' }}
          >
            <FloorNavigator />
          </div>
        )}
        <BuilderCanvas
          boundaryWidth={boundaryWidth}
          boundaryDepth={boundaryDepth}
          boundaryHeight={boundaryHeight}
          parcelInfo={parcelInfo}
          showSurrounding={showSurrounding}
          showSatellite={showSatellite}
          rightSidebarOpen={rightSidebarOpen}
        />

        {/* Left sidebar: Module library (overlay) */}
        <Sidebar
          side="left"
          defaultOpen={!isMobile}
          open={leftSidebarOpen}
          width={isMobile ? 'w-[calc(100vw-3rem)]' : 'w-72'}
          onOpenChange={handleLeftSidebarChange}
        >
          <ModuleLibrary />
        </Sidebar>

        {/* Right sidebar: Property panel (overlay) */}
        <Sidebar
          side="right"
          defaultOpen={!isMobile}
          open={rightSidebarOpen}
          width={isMobile ? 'w-[calc(100vw-3rem)]' : 'w-72'}
          onOpenChange={handleRightSidebarChange}
        >
          <PropertyPanel
            onSave={manualSave}
            saveStatus={saveStatus}
            lastSavedAt={lastSavedAt}
            onRename={handleRename}
          />
        </Sidebar>
      </div>

      {/* Bottom status bar */}
      <CostStatusBar
        parcelArea={parcel.area}
        maxCoverageRatio={regulation?.zoneRegulation.maxCoverageRatio}
        maxFloorAreaRatio={regulation?.zoneRegulation.maxFloorAreaRatio}
        maxHeight={
          regulation?.zoneRegulation.maxHeight && regulation.zoneRegulation.maxHeight > 0
            ? regulation.zoneRegulation.maxHeight
            : undefined
        }
      />
    </div>
  );
}
