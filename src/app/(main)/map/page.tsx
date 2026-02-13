'use client';

import { Suspense, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/cn';
import type { MapBounds } from '@/types/land';
import type { AuctionProperty, AuctionFilters } from '@/types/auction';
import { useAuctionProperties, useAuctionStore } from '@/features/auction';
import { useBuilderStore } from '@/features/builder/store';
import { KakaoMap, getKakaoMapInstance } from '@/components/map/KakaoMap';
import { AuctionOverlay } from '@/components/map/AuctionOverlay';
import { AuctionInfoPanel } from '@/components/map/AuctionInfoPanel';
import { AuctionBottomList } from '@/components/map/AuctionBottomList';
import { AuctionFilterPanel } from '@/components/map/AuctionFilterPanel';
import { MapControls, type MapType } from '@/components/map/MapControls';

const METRO_PREFIXES = ['서울', '경기', '인천'];

const LOW_UNIT_PRICE_THRESHOLD = 10_000; // 1만원/m²

const DEFAULT_FILTERS: AuctionFilters = {
  priceRange: [0, Number.MAX_SAFE_INTEGER],
  areaRange: [0, Number.MAX_SAFE_INTEGER],
  disposalMethods: [],
  landTypes: [],
  region: 'all',
  searchQuery: '',
  dataSources: [],
  excludeLowUnitPrice: true,
};

function hasActiveFilters(filters: AuctionFilters): boolean {
  return (
    filters.priceRange[0] !== 0 ||
    filters.priceRange[1] < Number.MAX_SAFE_INTEGER ||
    filters.areaRange[0] !== 0 ||
    filters.areaRange[1] < Number.MAX_SAFE_INTEGER ||
    filters.disposalMethods.length > 0 ||
    filters.landTypes.length > 0 ||
    filters.region !== 'all' ||
    filters.searchQuery !== '' ||
    filters.dataSources.length > 0 ||
    filters.excludeLowUnitPrice !== true
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={<div className="flex h-[calc(100vh-3.5rem)] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-blue-600" /></div>}>
      <MapPageInner />
    </Suspense>
  );
}

function MapPageInner() {
  const searchParams = useSearchParams();
  const parcelCenter = useBuilderStore((s) => s.parcelCenter);
  const paramLat = Number(searchParams.get('lat')) || 0;
  const paramLng = Number(searchParams.get('lng')) || 0;
  // 빌더 스토어 우선 (최신 필지), 없으면 URL 파라미터 fallback
  const mapInitialCenter = parcelCenter
    ?? ((paramLat && paramLng) ? { lat: paramLat, lng: paramLng } : undefined);
  // 좌표가 전달되면 가까이 줌인 (level 4 ≈ 동네 수준)
  const mapInitialLevel = mapInitialCenter ? 4 : undefined;

  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [zoomLevel, setZoomLevel] = useState(11);
  const [selectedAuctionId, setSelectedAuctionId] = useState<string | null>(null);
  const [filters, setFilters] = useState<AuctionFilters>(DEFAULT_FILTERS);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [mapType, setMapType] = useState<MapType>('roadmap');

  // OnBid 매각/임대 물건 — 실제 공매·매각·임대 유휴지만 표시
  const { properties: auctionProperties, isLoading: auctionsLoading, loadingRegion, progress, apiError, retry } =
    useAuctionProperties(bounds, true, zoomLevel);

  // Client-side filtering (공통 필터 로직)
  const applyFilters = useCallback((p: AuctionProperty) => {
    // 저단가 / 비정상 매물 필터
    if (filters.excludeLowUnitPrice && p.appraisalValue > 0) {
      // 면적 있으면 단가 계산: 1만원/m² 미만 제외
      if (p.area != null && p.area > 0) {
        if (p.appraisalValue / p.area < LOW_UNIT_PRICE_THRESHOLD) return false;
      }
      // 면적 없거나 공시지가 없는데 감정가 100만원 미만 → 비정상
      if (!p.officialLandPrice && p.appraisalValue < 1_000_000) return false;
    }
    // 데이터 소스 필터
    if (filters.dataSources.length > 0 && !filters.dataSources.includes(p.source ?? 'onbid')) return false;
    // 감정가액 기준 필터
    if (p.appraisalValue > 0) {
      if (p.appraisalValue < filters.priceRange[0] || p.appraisalValue > filters.priceRange[1]) return false;
    }
    if (p.area != null) {
      if (p.area < filters.areaRange[0] || p.area > filters.areaRange[1]) return false;
    }
    if (filters.disposalMethods.length > 0 && !filters.disposalMethods.includes(p.disposalMethod)) return false;
    if (filters.landTypes.length > 0 && !filters.landTypes.includes(p.itemType)) return false;
    if (filters.region === 'metro') {
      if (!METRO_PREFIXES.some((prefix) => p.address.startsWith(prefix))) return false;
    }
    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !p.address.toLowerCase().includes(q)) return false;
    }
    return true;
  }, [filters]);

  // 뷰포트 내 좌표 있는 물건 (필터 미적용) — 필터 패널 카운트용
  const viewportProperties = useMemo(() => {
    const withCoords = auctionProperties.filter((p) => p.lat != null && p.lng != null);
    if (!bounds) return withCoords;
    return withCoords.filter((p) =>
      p.lat! >= bounds.sw.lat && p.lat! <= bounds.ne.lat &&
      p.lng! >= bounds.sw.lng && p.lng! <= bounds.ne.lng
    );
  }, [auctionProperties, bounds]);

  // 지도 마커용 — 좌표 있는 물건만
  const overlayProperties = useMemo(() => {
    return auctionProperties.filter((p) => p.lat != null && p.lng != null && applyFilters(p));
  }, [auctionProperties, applyFilters]);

  // 하단 리스트용 — 뷰포트 내 좌표 있는 물건만 (지도 핀과 동일)
  const filteredProperties = useMemo(() => {
    const filtered = auctionProperties.filter(
      (p) => p.lat != null && p.lng != null && applyFilters(p),
    );
    if (!bounds) return filtered;
    return filtered.filter((p) => (
      p.lat! >= bounds.sw.lat && p.lat! <= bounds.ne.lat &&
      p.lng! >= bounds.sw.lng && p.lng! <= bounds.ne.lng
    ));
  }, [auctionProperties, applyFilters, bounds]);

  const selectedAuction = useMemo<AuctionProperty | null>(() => {
    if (!selectedAuctionId) return null;
    return auctionProperties.find((p) => p.id === selectedAuctionId) ?? null;
  }, [selectedAuctionId, auctionProperties]);

  const handleBoundsChange = useCallback((b: MapBounds) => {
    setBounds(b);
  }, []);

  const handleZoomChange = useCallback((level: number) => {
    setZoomLevel(level);
  }, []);

  const handleSelectAuction = useCallback((id: string) => {
    setSelectedAuctionId((prev) => (prev === id ? null : id));
  }, []);

  const handleCloseAuctionPanel = useCallback(() => {
    setSelectedAuctionId(null);
  }, []);

  const handleZoomIn = useCallback(() => {
    const map = getKakaoMapInstance();
    if (map) {
      map.setLevel(Math.max(1, map.getLevel() - 1));
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    const map = getKakaoMapInstance();
    if (map) {
      map.setLevel(Math.min(14, map.getLevel() + 1));
    }
  }, []);

  const handleReset = useCallback(() => {
    const map = getKakaoMapInstance();
    if (map && window.kakao?.maps) {
      map.setCenter(new window.kakao.maps.LatLng(37.5385, 127.0823));
      map.setLevel(8);
    }
  }, []);

  const handleToggleFilter = useCallback(() => {
    setFilterPanelOpen((v) => !v);
  }, []);

  const handleMapTypeChange = useCallback((type: MapType) => {
    setMapType(type);
    const map = getKakaoMapInstance();
    if (map && window.kakao?.maps) {
      const { MapTypeId } = window.kakao.maps;
      const typeMap = { roadmap: MapTypeId.ROADMAP, skyview: MapTypeId.SKYVIEW, hybrid: MapTypeId.HYBRID };
      map.setMapTypeId(typeMap[type]);
    }
  }, []);

  const handleFiltersChange = useCallback((next: AuctionFilters) => {
    setFilters(next);
  }, []);

  const activeFilters = hasActiveFilters(filters);

  // 전체 로딩 완료 시 오버레이 해제
  const showInitialOverlay = auctionsLoading;
  const progressPercent = progress
    ? Math.round((progress.completed / Math.max(progress.total, 1)) * 100)
    : 0;

  return (
    <div className="relative h-[calc(100vh-3.5rem)] w-full overflow-hidden">
      <KakaoMap onBoundsChange={handleBoundsChange} onZoomChange={handleZoomChange} initialCenter={mapInitialCenter} initialLevel={mapInitialLevel}>
        {/* Kakao overlays would render here if SDK is available */}
      </KakaoMap>

      {/* 초기 로딩 풀스크린 오버레이 */}
      <div
        className={cn(
          'absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-sm transition-all duration-700',
          showInitialOverlay
            ? 'opacity-100'
            : 'pointer-events-none opacity-0'
        )}
      >
        <div className="flex flex-col items-center gap-5 w-80">
          {apiError ? (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20">
                <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <p className="text-lg font-medium text-white">OnBid API 오류</p>
              <p className="text-sm text-white/70 text-center leading-relaxed">
                {apiError.includes('EXCEEDS') || apiError.includes('한도')
                  ? 'API 일일 호출 한도를 초과했습니다. 자정 이후 재시도하거나, 폐교 데이터만 먼저 확인하세요.'
                  : apiError.includes('NOT_REGISTERED') || apiError.includes('KEY')
                    ? 'API 키가 유효하지 않습니다. .env.local의 ONBID_API_KEY를 확인하세요.'
                    : `${apiError}`}
              </p>
              <div className="flex gap-3">
                <button
                  className="rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/30 transition-colors"
                  onClick={retry}
                >
                  재시도
                </button>
                <button
                  className="rounded-lg bg-blue-500/80 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
                  onClick={() => {
                    useAuctionStore.getState().setIsLoading(false);
                    useAuctionStore.getState().setProgress(null);
                  }}
                >
                  닫고 계속
                </button>
              </div>
              {progress && progress.propertyCount > 0 && (
                <p className="text-xs text-white/50">
                  (폐교 등 {progress.propertyCount.toLocaleString()}건은 이미 로드됨)
                </p>
              )}
            </>
          ) : (
            <>
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
              <p className="text-lg font-medium text-white">전국 매물 불러오는 중</p>

              {progress && (
                <>
                  {/* 프로그레스 바 */}
                  <div className="w-full rounded-full bg-white/20 h-2 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-white transition-all duration-300 ease-out"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  {/* 상세 진행 정보 */}
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-sm text-white/80">
                      {progress.phase} ({progressPercent}%)
                    </p>
                    <p className="text-xs text-white/50">
                      {progress.propertyCount.toLocaleString()}건 수집
                    </p>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Map controls */}
      <MapControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onReset={handleReset}
        filterOpen={filterPanelOpen}
        onToggleFilter={handleToggleFilter}
        mapType={mapType}
        onMapTypeChange={handleMapTypeChange}
        hasActiveFilters={activeFilters}
      />

      {/* Filter panel */}
      <AuctionFilterPanel
        open={filterPanelOpen}
        onClose={() => setFilterPanelOpen(false)}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        allProperties={auctionProperties}
        viewportProperties={viewportProperties}
        filteredCount={filteredProperties.length}
      />

      {/* Loading / count indicator (초기 로딩 후 상태 표시) */}
      {!showInitialOverlay && (
        <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2">
          {auctionProperties.length > 0 ? (
            <div className="flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 shadow-sm">
              {loadingRegion && (
                <div className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-500" />
              )}
              <span className="text-xs text-slate-600">
                화면 {filteredProperties.length}건 / 전체 {auctionProperties.length}건
                {loadingRegion && <span className="text-slate-400"> ({loadingRegion})</span>}
              </span>
            </div>
          ) : null}
        </div>
      )}

      {/* Auction overlay — 매각/임대 물건 (전체, Kakao 자체 클리핑) */}
      <AuctionOverlay
        properties={overlayProperties}
        selectedId={selectedAuctionId}
        onSelect={handleSelectAuction}
        zoomLevel={zoomLevel}
      />

      {/* Bottom list */}
      <AuctionBottomList
        properties={filteredProperties}
        selectedId={selectedAuctionId}
        onSelect={handleSelectAuction}
        collapsed={listCollapsed}
        onToggleCollapse={() => setListCollapsed((v) => !v)}
      />

      {/* Detail panel - auction */}
      <AuctionInfoPanel
        property={selectedAuction}
        onClose={handleCloseAuctionPanel}
      />
    </div>
  );
}
