'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
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
import type { ParcelInput } from '@/features/regulations/engine';
import type { ParcelInfo } from '@/types/land';
import type { ModulePlacement } from '@/types/builder';
import { fetchParcelByPnu } from '@/features/land/services';
import { useSpeckleSync } from '@/lib/speckle/useSpeckleSync';

const BuilderCanvas = dynamic(
  () => import('@/components/builder/BuilderCanvas').then((m) => m.BuilderCanvas),
  { ssr: false },
);

const AUTOSAVE_INTERVAL = 10_000;

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

  const setProjectId = useBuilderStore((s) => s.setProjectId);
  const setProjectName = useBuilderStore((s) => s.setProjectName);
  const setMaxFloors = useBuilderStore((s) => s.setMaxFloors);
  const loadPlacements = useBuilderStore((s) => s.loadPlacements);
  const placements = useBuilderStore((s) => s.placements);

  const [parcelInfo, setParcelInfo] = useState<ParcelInfo | null>(null);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  // effectivePnu: URL 쿼리 우선, 없으면 DB에서 로드한 값 사용
  const [dbParcelPnu, setDbParcelPnu] = useState<string | null>(null);
  const effectivePnu = parcelPnu ?? dbParcelPnu;

  // DB에서 프로젝트 로드가 완료되기 전까지 autosave 차단
  const loadedRef = useRef(false);
  // unmount/cleanup save 시 정확한 projectId를 참조하기 위한 ref
  const projectIdRef = useRef(projectId);

  // Load parcel data from effective PNU
  useEffect(() => {
    if (!effectivePnu) return;
    fetchParcelByPnu(effectivePnu).then((info) => {
      if (info) setParcelInfo(info);
    });
  }, [effectivePnu]);

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

  // Save function
  const saveToServer = useCallback(async (pl: ModulePlacement[]) => {
    setSaveStatus('saving');
    try {
      const stats = computeStats(pl);
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parcelPnu: effectivePnu ?? undefined,
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
        setSaveStatus('saved');
        setLastSavedAt(new Date().toLocaleTimeString('ko-KR'));
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    }
  }, [projectId, effectivePnu]);

  // Load project from DB
  useEffect(() => {
    // 프로젝트 전환: 이전 데이터 즉시 클리어, autosave 차단
    loadedRef.current = false;
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

        if (data.name) setProjectName(data.name);
        if (data.parcelPnu) setDbParcelPnu(data.parcelPnu);

        const placements = Array.isArray(data.placements) ? data.placements : [];
        loadPlacements(
          placements.map((p: Record<string, unknown>) => ({
            id: (p.id as string) ?? `p_${Math.random().toString(36).slice(2, 8)}`,
            moduleId: p.moduleId as string,
            gridX: p.gridX as number,
            gridY: p.gridY as number,
            gridZ: p.gridZ as number,
            rotation: (p.rotation ?? 0) as 0 | 90 | 180 | 270,
            floor: (p.floor ?? 1) as number,
            materialId: (p.materialId as string) ?? undefined,
            customColor: (p.customColor as string) ?? undefined,
          }))
        );
        loadedRef.current = true;
      })
      .catch(() => { loadedRef.current = true; });
  }, [projectId, setProjectId, loadPlacements, setProjectName]);

  // Auto-save
  const placementsRef = useRef(placements);
  placementsRef.current = placements;
  const effectivePnuRef = useRef(effectivePnu);
  effectivePnuRef.current = effectivePnu;

  useEffect(() => {
    const interval = setInterval(() => {
      // DB 로드 완료 전에는 저장하지 않음
      if (!loadedRef.current) return;
      saveToServer(placementsRef.current);
    }, AUTOSAVE_INTERVAL);
    return () => clearInterval(interval);
  }, [saveToServer]);

  // Save on unmount only — projectId 변경 시에는 저장하지 않음 (이미 autosave가 처리)
  useEffect(() => {
    return () => {
      // 로드 완료 전이면 저장하지 않음
      if (!loadedRef.current) return;
      const pid = projectIdRef.current;
      const pl = placementsRef.current;
      const pnu = effectivePnuRef.current;
      const stats = computeStats(pl);
      const body = JSON.stringify({
        parcelPnu: pnu ?? undefined,
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
      });
      fetch(`/api/projects/${pid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => { /* ignore */ });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manual save (exposed to PropertyPanel via store)
  const manualSave = useCallback(() => {
    saveToServer(placementsRef.current);
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
      {parcelInfo && (
        <div className="flex items-center gap-3 border-b border-slate-200 bg-blue-50 px-4 py-2 text-sm">
          <span className="font-medium text-blue-900">{parcelInfo.address}</span>
          <span className="text-blue-700">|</span>
          <span className="text-blue-700">{parcelInfo.area.toFixed(1)}m²</span>
          <span className="text-blue-700">|</span>
          <span className="text-blue-700">
            건폐율 {parcelInfo.regulation?.maxCoverageRatio}% / 용적률 {parcelInfo.regulation?.maxFloorAreaRatio}%
          </span>
        </div>
      )}

      <div className="relative flex-1 overflow-hidden bg-slate-100">
        {/* Center: 3D Canvas */}
        <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
          <BuilderToolbar />
        </div>

        {/* Toast message overlay */}
        <BuilderToast />

        {/* Box select rectangle overlay */}
        <BoxSelectOverlay />
        <div
          className="absolute bottom-3 z-30 transition-[right] duration-300"
          style={{ right: rightSidebarOpen ? 'calc(18rem + 0.75rem)' : '0.75rem' }}
        >
          <FloorNavigator />
        </div>
        <BuilderCanvas
          boundaryWidth={boundaryWidth}
          boundaryDepth={boundaryDepth}
          boundaryHeight={boundaryHeight}
          parcelInfo={parcelInfo}
          showSurrounding={showSurrounding}
          rightSidebarOpen={rightSidebarOpen}
        />

        {/* Left sidebar: Module library (overlay) */}
        <Sidebar side="left" defaultOpen width="w-72">
          <ModuleLibrary />
        </Sidebar>

        {/* Right sidebar: Property panel (overlay) */}
        <Sidebar side="right" defaultOpen width="w-72" onOpenChange={setRightSidebarOpen}>
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
