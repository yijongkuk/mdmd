'use client';

import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { X, RotateCcw, Search } from 'lucide-react';
import type { AuctionProperty, AuctionFilters } from '@/types/auction';
import { formatWon } from '@/lib/utils/format';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

interface AuctionFilterPanelProps {
  open: boolean;
  onClose: () => void;
  filters: AuctionFilters;
  onFiltersChange: (filters: AuctionFilters) => void;
  allProperties: AuctionProperty[];
  filteredCount: number;
}

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

function formatArea(m2: number): string {
  const pyeong = Math.round(m2 / 3.3058);
  return `${m2.toLocaleString()}㎡ (${pyeong.toLocaleString()}평)`;
}

function buildAreaPresets(max: number): { label: string; range: [number, number] }[] {
  if (max <= 0) return [];
  if (max <= 500) {
    return [
      { label: '100㎡ 이하', range: [0, 100] },
      { label: '100~330㎡', range: [100, 330] },
      { label: '330㎡+', range: [330, max] },
    ];
  }
  if (max <= 3_000) {
    return [
      { label: '100㎡ 이하', range: [0, 100] },
      { label: '100~330㎡', range: [100, 330] },
      { label: '330~1000㎡', range: [330, 1_000] },
      { label: '1000㎡+', range: [1_000, max] },
    ];
  }
  return [
    { label: '330㎡ 이하', range: [0, 330] },
    { label: '330~1000㎡', range: [330, 1_000] },
    { label: '1000~3000㎡', range: [1_000, 3_000] },
    { label: '3000㎡+', range: [3_000, max] },
  ];
}

function buildPricePresets(max: number): { label: string; range: [number, number] }[] {
  if (max <= 0) return [];
  if (max <= 100_000_000) {
    return [
      { label: '1천만 이하', range: [0, 10_000_000] },
      { label: '1~5천만', range: [10_000_000, 50_000_000] },
      { label: '5천만~1억', range: [50_000_000, 100_000_000] },
    ];
  }
  if (max <= 1_000_000_000) {
    return [
      { label: '1억 이하', range: [0, 100_000_000] },
      { label: '1~3억', range: [100_000_000, 300_000_000] },
      { label: '3~5억', range: [300_000_000, 500_000_000] },
      { label: '5억+', range: [500_000_000, max] },
    ];
  }
  return [
    { label: '1억 이하', range: [0, 100_000_000] },
    { label: '1~5억', range: [100_000_000, 500_000_000] },
    { label: '5~10억', range: [500_000_000, 1_000_000_000] },
    { label: '10억+', range: [1_000_000_000, max] },
  ];
}

export const AuctionFilterPanel = memo(function AuctionFilterPanel({
  open,
  onClose,
  filters,
  onFiltersChange,
  allProperties,
  filteredCount,
}: AuctionFilterPanelProps) {
  const [searchInput, setSearchInput] = useState(filters.searchQuery);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const priceDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const areaDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // Local state for slider visual feedback (updates immediately, debounces the filter change)
  const [localPriceRange, setLocalPriceRange] = useState(filters.priceRange);
  const [localAreaRange, setLocalAreaRange] = useState(filters.areaRange);

  // Sync local slider state when filters change from outside (e.g., preset click or reset)
  useEffect(() => {
    setLocalPriceRange(filters.priceRange);
  }, [filters.priceRange]);
  useEffect(() => {
    setLocalAreaRange(filters.areaRange);
  }, [filters.areaRange]);

  // Debounce search query — filtersRef로 stale closure 방지
  useEffect(() => {
    searchDebounceRef.current = setTimeout(() => {
      if (searchInput !== filtersRef.current.searchQuery) {
        onFiltersChange({ ...filtersRef.current, searchQuery: searchInput });
      }
    }, 300);
    return () => clearTimeout(searchDebounceRef.current);
  }, [searchInput, onFiltersChange]);

  // Extract unique disposal methods with counts
  const disposalMethodCounts = useMemo(() => {
    const counts = new Map<string, number>();
    allProperties.forEach((p) => {
      if (p.disposalMethod) {
        counts.set(p.disposalMethod, (counts.get(p.disposalMethod) ?? 0) + 1);
      }
    });
    return counts;
  }, [allProperties]);
  const disposalMethods = useMemo(() =>
    Array.from(disposalMethodCounts.keys()).sort(),
  [disposalMethodCounts]);

  // Extract unique land types with counts
  const landTypeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    allProperties.forEach((p) => {
      if (p.itemType) {
        counts.set(p.itemType, (counts.get(p.itemType) ?? 0) + 1);
      }
    });
    return counts;
  }, [allProperties]);
  const landTypes = useMemo(() =>
    Array.from(landTypeCounts.keys()).sort(),
  [landTypeCounts]);

  // 감정가액 기준 가격 통계 (동적 범위)
  const priceStats = useMemo(() => {
    const prices = allProperties
      .map((p) => p.appraisalValue)
      .filter((v) => v > 0);
    if (prices.length === 0) return null;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const step = max > 1_000_000_000 ? 10_000_000 : max > 100_000_000 ? 1_000_000 : 100_000;
    return { min, max, step, withPrice: prices.length };
  }, [allProperties]);

  // 면적 통계 (동적 범위)
  const areaStats = useMemo(() => {
    const areas = allProperties
      .map((p) => p.area)
      .filter((v): v is number => v != null && v > 0);
    if (areas.length === 0) return null;
    const min = Math.min(...areas);
    const max = Math.max(...areas);
    const step = max > 10_000 ? 100 : max > 1_000 ? 10 : 1;
    return { min, max, step, withArea: areas.length };
  }, [allProperties]);

  const handleReset = () => {
    setSearchInput('');
    setLocalPriceRange([0, Number.MAX_SAFE_INTEGER]);
    setLocalAreaRange([0, Number.MAX_SAFE_INTEGER]);
    onFiltersChange({ ...DEFAULT_FILTERS });
  };

  // Debounced price slider: update local state immediately, debounce filter change
  const handlePriceChange = useCallback((value: number[]) => {
    setLocalPriceRange([value[0], value[1]]);
    clearTimeout(priceDebounceRef.current);
    priceDebounceRef.current = setTimeout(() => {
      onFiltersChange({ ...filtersRef.current, priceRange: [value[0], value[1]] });
    }, 300);
  }, [onFiltersChange]);

  const handlePresetClick = (range: [number, number]) => {
    setLocalPriceRange(range);
    onFiltersChange({ ...filters, priceRange: range });
  };

  // Debounced area slider: update local state immediately, debounce filter change
  const handleAreaChange = useCallback((value: number[]) => {
    setLocalAreaRange([value[0], value[1]]);
    clearTimeout(areaDebounceRef.current);
    areaDebounceRef.current = setTimeout(() => {
      onFiltersChange({ ...filtersRef.current, areaRange: [value[0], value[1]] });
    }, 300);
  }, [onFiltersChange]);

  const handleAreaPresetClick = (range: [number, number]) => {
    setLocalAreaRange(range);
    onFiltersChange({ ...filters, areaRange: range });
  };

  const handleDisposalToggle = (method: string) => {
    const current = filters.disposalMethods;
    const next = current.includes(method)
      ? current.filter((m) => m !== method)
      : [...current, method];
    onFiltersChange({ ...filters, disposalMethods: next });
  };

  const handleLandTypeToggle = (type: string) => {
    const current = filters.landTypes;
    const next = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    onFiltersChange({ ...filters, landTypes: next });
  };

  const handleRegionChange = (region: 'all' | 'metro') => {
    onFiltersChange({ ...filters, region });
  };

  const handleDataSourceToggle = (source: string) => {
    const current = filters.dataSources;
    const next = current.includes(source)
      ? current.filter((s) => s !== source)
      : [...current, source];
    onFiltersChange({ ...filters, dataSources: next });
  };

  // Data source counts
  const dataSourceCounts = useMemo(() => {
    const counts = { onbid: 0, closed_school: 0 };
    allProperties.forEach((p) => {
      const src = p.source ?? 'onbid';
      if (src === 'onbid') counts.onbid++;
      else if (src === 'closed_school') counts.closed_school++;
    });
    return counts;
  }, [allProperties]);

  // 저단가/비정상 매물 수
  const lowUnitPriceCount = useMemo(() => {
    return allProperties.filter((p) => {
      if (p.appraisalValue <= 0) return false;
      if (p.area != null && p.area > 0 && p.appraisalValue / p.area < 10_000) return true;
      if (!p.officialLandPrice && p.appraisalValue < 1_000_000) return true;
      return false;
    }).length;
  }, [allProperties]);

  const isPresetActive = (range: [number, number]) =>
    filters.priceRange[0] === range[0] && filters.priceRange[1] === range[1];

  const isAreaPresetActive = (range: [number, number]) =>
    filters.areaRange[0] === range[0] && filters.areaRange[1] === range[1];

  return (
    <div
      className={cn(
        'absolute left-0 top-0 z-25 flex h-full w-72 flex-col bg-white shadow-xl transition-transform duration-300 border-r border-slate-200',
        open ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">필터</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {filteredCount}건 표시
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleReset}
            title="초기화"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Data Source */}
        <div>
          <label className="text-xs font-medium text-slate-500 mb-1.5 block">
            데이터 소스
          </label>
          <div className="space-y-1">
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={filters.dataSources.length === 0}
                onChange={() => onFiltersChange({ ...filters, dataSources: [] })}
                className="h-3.5 w-3.5 rounded border-slate-300 text-red-500 focus:ring-red-500"
              />
              <span className="text-xs font-medium text-slate-700">전체</span>
              <span className="ml-auto text-[10px] text-slate-400">
                {dataSourceCounts.onbid + dataSourceCounts.closed_school}
              </span>
            </label>
            {([
              { key: 'onbid', label: 'OnBid 공매', count: dataSourceCounts.onbid },
              { key: 'closed_school', label: '폐교 유휴부지', count: dataSourceCounts.closed_school },
            ] as const).map(({ key, label, count }) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 pl-5 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={filters.dataSources.includes(key)}
                  onChange={() => handleDataSourceToggle(key)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-red-500 focus:ring-red-500"
                />
                <span className="text-xs text-slate-700">{label}</span>
                <span className="ml-auto text-[10px] text-slate-400">
                  {count}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Low unit price filter */}
        {lowUnitPriceCount > 0 && (
          <div>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={filters.excludeLowUnitPrice}
                onChange={() => onFiltersChange({ ...filters, excludeLowUnitPrice: !filters.excludeLowUnitPrice })}
                className="h-3.5 w-3.5 rounded border-slate-300 text-red-500 focus:ring-red-500"
              />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-slate-700">저단가 매물 제외</span>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  단가 1만원/m² 미만 ({lowUnitPriceCount}건 제외)
                </p>
              </div>
            </label>
          </div>
        )}

        {/* Search */}
        <div>
          <label className="text-xs font-medium text-slate-500 mb-1.5 block">
            주소/물건명 검색
          </label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="검색어 입력..."
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        {/* Price range (감정가액 기준) */}
        <div>
          <label className="text-xs font-medium text-slate-500 mb-0.5 block">
            감정가액
          </label>
          {priceStats ? (
            <>
              <p className="text-[10px] text-slate-400 mb-1.5">
                {formatWon(priceStats.min)} ~ {formatWon(priceStats.max)} ({priceStats.withPrice}건)
              </p>
              <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
                <span>{formatWon(Math.max(localPriceRange[0], 0))}</span>
                <span>{formatWon(Math.min(localPriceRange[1], priceStats.max))}</span>
              </div>
              <Slider
                value={[
                  Math.max(localPriceRange[0], 0),
                  Math.min(localPriceRange[1], priceStats.max),
                ]}
                min={0}
                max={priceStats.max}
                step={priceStats.step}
                onValueChange={handlePriceChange}
              />
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {buildPricePresets(priceStats.max).map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handlePresetClick(preset.range)}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors border',
                      isPresetActive(preset.range)
                        ? 'border-red-400 bg-red-50 text-red-600'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-[10px] text-slate-400 mb-1.5">
              감정가 정보 없음
            </p>
          )}
        </div>

        {/* Area range */}
        <div>
          <label className="text-xs font-medium text-slate-500 mb-0.5 block">
            면적
          </label>
          {areaStats ? (
            <>
              <p className="text-[10px] text-slate-400 mb-1.5">
                {formatArea(areaStats.min)} ~ {formatArea(areaStats.max)} ({areaStats.withArea}건)
              </p>
              <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
                <span>{formatArea(Math.max(localAreaRange[0], 0))}</span>
                <span>{formatArea(Math.min(localAreaRange[1], areaStats.max))}</span>
              </div>
              <Slider
                value={[
                  Math.max(localAreaRange[0], 0),
                  Math.min(localAreaRange[1], areaStats.max),
                ]}
                min={0}
                max={areaStats.max}
                step={areaStats.step}
                onValueChange={handleAreaChange}
              />
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {buildAreaPresets(areaStats.max).map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleAreaPresetClick(preset.range)}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors border',
                      isAreaPresetActive(preset.range)
                        ? 'border-red-400 bg-red-50 text-red-600'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-[10px] text-slate-400 mb-1.5">
              면적 정보 없음
            </p>
          )}
        </div>

        {/* Disposal methods */}
        {disposalMethods.length > 0 && (
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">
              처분 방식
            </label>
            <div className="space-y-1">
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={filters.disposalMethods.length === 0}
                  onChange={() => onFiltersChange({ ...filters, disposalMethods: [] })}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-red-500 focus:ring-red-500"
                />
                <span className="text-xs font-medium text-slate-700">전체</span>
                <span className="ml-auto text-[10px] text-slate-400">
                  {allProperties.length}
                </span>
              </label>
              {disposalMethods.map((method) => (
                <label
                  key={method}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 pl-5 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={filters.disposalMethods.includes(method)}
                    onChange={() => handleDisposalToggle(method)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-red-500 focus:ring-red-500"
                  />
                  <span className="text-xs text-slate-700">{method}</span>
                  <span className="ml-auto text-[10px] text-slate-400">
                    {disposalMethodCounts.get(method) ?? 0}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Land types */}
        {landTypes.length > 0 && (
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">
              토지 유형
            </label>
            <div className="space-y-1">
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={filters.landTypes.length === 0}
                  onChange={() => onFiltersChange({ ...filters, landTypes: [] })}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-red-500 focus:ring-red-500"
                />
                <span className="text-xs font-medium text-slate-700">전체</span>
                <span className="ml-auto text-[10px] text-slate-400">
                  {allProperties.length}
                </span>
              </label>
              {landTypes.map((type) => {
                const shortLabel = type.includes(' / ') ? type.split(' / ')[1] : type;
                return (
                  <label
                    key={type}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 pl-5 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={filters.landTypes.includes(type)}
                      onChange={() => handleLandTypeToggle(type)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-red-500 focus:ring-red-500"
                    />
                    <span className="text-xs text-slate-700">{shortLabel}</span>
                    <span className="ml-auto text-[10px] text-slate-400">
                      {landTypeCounts.get(type) ?? 0}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Region */}
        <div>
          <label className="text-xs font-medium text-slate-500 mb-1.5 block">
            지역
          </label>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            <button
              type="button"
              onClick={() => handleRegionChange('all')}
              className={cn(
                'flex-1 px-3 py-1.5 text-xs font-medium transition-colors',
                filters.region === 'all'
                  ? 'bg-red-500 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              )}
            >
              전국
            </button>
            <button
              type="button"
              onClick={() => handleRegionChange('metro')}
              className={cn(
                'flex-1 px-3 py-1.5 text-xs font-medium transition-colors border-l border-slate-200',
                filters.region === 'metro'
                  ? 'bg-red-500 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              )}
            >
              수도권
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
