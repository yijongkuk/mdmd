'use client';

import { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/cn';
import type { MapBounds } from '@/types/land';
import type { AuctionProperty, AuctionFilters } from '@/types/auction';
import { useAuctionProperties } from '@/features/auction';
import { KakaoMap, getKakaoMapInstance } from '@/components/map/KakaoMap';
import { AuctionOverlay } from '@/components/map/AuctionOverlay';
import { AuctionInfoPanel } from '@/components/map/AuctionInfoPanel';
import { AuctionBottomList } from '@/components/map/AuctionBottomList';
import { AuctionFilterPanel } from '@/components/map/AuctionFilterPanel';
import { MapControls } from '@/components/map/MapControls';

const METRO_PREFIXES = ['서울', '경기', '인천'];

const DEFAULT_FILTERS: AuctionFilters = {
  priceRange: [0, Number.MAX_SAFE_INTEGER],
  areaRange: [0, Number.MAX_SAFE_INTEGER],
  disposalMethods: [],
  landTypes: [],
  region: 'all',
  searchQuery: '',
  dataSources: [],
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
    filters.dataSources.length > 0
  );
}

export default function MapPage() {
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [zoomLevel, setZoomLevel] = useState(11);
  const [showAuctions, setShowAuctions] = useState(true);
  const [selectedAuctionId, setSelectedAuctionId] = useState<string | null>(null);
  const [filters, setFilters] = useState<AuctionFilters>(DEFAULT_FILTERS);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [listCollapsed, setListCollapsed] = useState(false);

  // OnBid 매각/임대 물건 — 실제 공매·매각·임대 유휴지만 표시
  const { properties: auctionProperties, isLoading: auctionsLoading, loadingRegion, progress } =
    useAuctionProperties(bounds, showAuctions, zoomLevel);

  // Client-side filtering (공통 필터 로직)
  const applyFilters = useCallback((p: AuctionProperty) => {
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

  const handleToggleAuctions = useCallback((show: boolean) => {
    setShowAuctions(show);
    if (!show) setSelectedAuctionId(null);
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
      <KakaoMap onBoundsChange={handleBoundsChange} onZoomChange={handleZoomChange}>
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
        <div className="flex flex-col items-center gap-5 w-72">
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
        </div>
      </div>

      {/* Map controls */}
      <MapControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onReset={handleReset}
        showAuctions={showAuctions}
        onToggleAuctions={handleToggleAuctions}
        filterOpen={filterPanelOpen}
        onToggleFilter={handleToggleFilter}
        hasActiveFilters={activeFilters}
      />

      {/* Filter panel */}
      <AuctionFilterPanel
        open={filterPanelOpen}
        onClose={() => setFilterPanelOpen(false)}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        allProperties={auctionProperties}
        filteredCount={filteredProperties.length}
      />

      {/* Loading / count indicator (초기 로딩 후 상태 표시) */}
      {!showInitialOverlay && (
        <div className="absolute left-1/2 top-16 z-20 -translate-x-1/2">
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
      {showAuctions && (
        <AuctionOverlay
          properties={overlayProperties}
          selectedId={selectedAuctionId}
          onSelect={handleSelectAuction}
          zoomLevel={zoomLevel}
        />
      )}

      {/* Bottom list */}
      {showAuctions && (
        <AuctionBottomList
          properties={filteredProperties}
          selectedId={selectedAuctionId}
          onSelect={handleSelectAuction}
          collapsed={listCollapsed}
          onToggleCollapse={() => setListCollapsed((v) => !v)}
        />
      )}

      {/* Detail panel - auction */}
      <AuctionInfoPanel
        property={selectedAuction}
        onClose={handleCloseAuctionPanel}
      />
    </div>
  );
}
