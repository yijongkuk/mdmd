'use client';

import { memo, useState, useCallback } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import type { AuctionProperty } from '@/types/auction';
import { formatWon } from '@/lib/utils/format';
import { Badge } from '@/components/ui/badge';
import { getKakaoMapInstance } from './KakaoMap';
import { cn } from '@/lib/cn';

const INITIAL_RENDER_COUNT = 50;
const LOAD_MORE_COUNT = 50;

interface AuctionBottomListProps {
  properties: AuctionProperty[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const AuctionBottomList = memo(function AuctionBottomList({
  properties,
  selectedId,
  onSelect,
  collapsed,
  onToggleCollapse,
}: AuctionBottomListProps) {
  const [renderCount, setRenderCount] = useState(INITIAL_RENDER_COUNT);

  const handleCardClick = useCallback((property: AuctionProperty) => {
    onSelect(property.id);
    if (property.lat != null && property.lng != null) {
      const map = getKakaoMapInstance();
      if (map && window.kakao?.maps) {
        map.setCenter(new window.kakao.maps.LatLng(property.lat, property.lng));
        if (map.getLevel() > 6) map.setLevel(6);
      }
    }
  }, [onSelect]);

  const handleLoadMore = useCallback(() => {
    setRenderCount((prev) => prev + LOAD_MORE_COUNT);
  }, []);

  if (properties.length === 0) return null;

  const visibleProperties = properties.slice(0, renderCount);
  const hasMore = properties.length > renderCount;

  return (
    <div
      className={cn(
        'absolute inset-x-0 bottom-0 z-10 bg-white/95 backdrop-blur-sm border-t border-slate-200 shadow-lg transition-all duration-300',
        collapsed ? 'max-h-11' : 'max-h-[40%]'
      )}
    >
      {/* Sticky header */}
      <button
        type="button"
        onClick={onToggleCollapse}
        className="sticky top-0 z-10 flex w-full items-center justify-between bg-white/95 backdrop-blur-sm px-4 py-2.5 border-b border-slate-100"
      >
        <span className="text-sm font-semibold text-slate-700">
          매물{' '}
          <span className="text-red-600">{properties.length}</span>건
        </span>
        {collapsed ? (
          <ChevronUp className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {/* Card grid */}
      {!collapsed && (
        <div className="overflow-y-auto p-3" style={{ maxHeight: 'calc(40vh - 44px)' }}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleProperties.map((property) => (
              <AuctionCard
                key={property.id}
                property={property}
                isSelected={property.id === selectedId}
                onClick={() => handleCardClick(property)}
              />
            ))}
          </div>
          {hasMore && (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={handleLoadMore}
                className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                더 보기 ({properties.length - renderCount}건 남음)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

const AuctionCard = memo(function AuctionCard({
  property,
  isSelected,
  onClick,
}: {
  property: AuctionProperty;
  isSelected: boolean;
  onClick: () => void;
}) {
  const truncatedName =
    property.name.length > 20
      ? property.name.slice(0, 20) + '...'
      : property.name;

  const isActive = property.status === '진행중';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col gap-1 rounded-lg border p-3 text-left transition-all hover:shadow-md',
        isSelected
          ? 'border-red-400 ring-2 ring-red-400 bg-red-50/50'
          : 'border-slate-200 bg-white hover:border-slate-300'
      )}
    >
      <p className="text-sm font-medium text-slate-900 truncate" title={property.name}>
        {truncatedName}
      </p>
      <p className="text-xs text-slate-400 truncate">{property.address}</p>
      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
        {property.source === 'closed_school' && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
            폐교
          </Badge>
        )}
        <Badge variant="warning" className="text-[10px] px-1.5 py-0">
          {property.disposalMethod || '공매'}
        </Badge>
        <Badge variant={isActive ? 'success' : 'secondary'} className="text-[10px] px-1.5 py-0">
          {property.status}
        </Badge>
      </div>
      {property.appraisalValue > 0 && property.appraisalValue !== property.minBidPrice ? (
        <div className="mt-1">
          <div className="flex items-baseline gap-1.5">
            <p className="text-sm font-bold text-red-600">
              {formatWon(property.minBidPrice)}
            </p>
            <p className="text-[10px] text-slate-400 line-through">
              {formatWon(property.appraisalValue)}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-sm font-bold text-red-600">
          {formatWon(property.appraisalValue > 0 ? property.appraisalValue : property.minBidPrice)}
        </p>
      )}
    </button>
  );
});
