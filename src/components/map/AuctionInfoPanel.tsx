'use client';

import { useState, useEffect, memo } from 'react';
import { useRouter } from 'next/navigation';
import { X, ExternalLink, MapPin, Calendar, Tag, Gavel, ArrowRight, Ruler, Banknote, Map, School } from 'lucide-react';
import type { AuctionProperty } from '@/types/auction';
import { formatWon, formatDate, formatArea, formatPyeong } from '@/lib/utils/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/cn';

interface LandDetail {
  pnu: string | null;
  area: number | null;
  officialPrice: number | null;
  zoneType: string | null;
  zoneName: string | null;
}

interface AuctionInfoPanelProps {
  property: AuctionProperty | null;
  onClose: () => void;
}

export const AuctionInfoPanel = memo(function AuctionInfoPanel({ property, onClose }: AuctionInfoPanelProps) {
  const router = useRouter();
  const [landDetail, setLandDetail] = useState<LandDetail | null>(null);
  const [landLoading, setLandLoading] = useState(false);

  // Fetch V-World land detail when property changes
  useEffect(() => {
    setLandDetail(null);
    if (!property?.lat || !property?.lng) return;

    let cancelled = false;
    setLandLoading(true);
    const params = new URLSearchParams();
    params.set('lat', String(property.lat));
    params.set('lng', String(property.lng));
    if (property.pnu) params.set('pnu', property.pnu);
    if (property.address) params.set('address', property.address);
    fetch(`/api/land/parcel-info?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setLandDetail(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLandLoading(false);
      });
    return () => { cancelled = true; };
  }, [property?.id, property?.lat, property?.lng]);

  if (!property) return null;

  const discountRate =
    property.appraisalValue > 0
      ? ((1 - property.minBidPrice / property.appraisalValue) * 100).toFixed(1)
      : null;

  const isActive = property.status === '진행중';

  const handleStartDesign = () => {
    if (property.lat == null || property.lng == null) return;
    const newProjectId = crypto.randomUUID();
    const pnu = landDetail?.pnu ?? property.pnu;
    const params = new URLSearchParams();
    if (pnu) params.set('parcelPnu', pnu);
    params.set('auctionId', property.id);
    if (property.appraisalValue > 0) params.set('appraisalValue', String(property.appraisalValue));
    if (property.minBidPrice > 0) params.set('minBidPrice', String(property.minBidPrice));
    router.push(`/builder/${newProjectId}?${params.toString()}`);
  };

  return (
    <div
      className={cn(
        'absolute right-0 top-0 z-30 flex h-full w-full flex-col border-l border-slate-200 bg-white shadow-xl transition-transform duration-300 sm:w-[400px]',
        property ? 'translate-x-0' : 'translate-x-full'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-900">
          {property.source === 'closed_school' ? '폐교 유휴부지 정보' : '공매 물건 정보'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="space-y-5 p-4">
          {/* Name & Address */}
          <div>
            <div className="flex items-start gap-2 mb-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div>
                <p className="text-sm font-medium text-slate-900">{property.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{property.address}</p>
              </div>
            </div>
            <Badge variant={isActive ? 'success' : 'secondary'}>
              {property.status}
            </Badge>
          </div>

          {/* Price Comparison */}
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">감정가</span>
                <span className="text-sm font-semibold text-slate-700">
                  {formatWon(property.appraisalValue)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">최저입찰가</span>
                <span className="text-sm font-bold text-red-600">
                  {formatWon(property.minBidPrice)}
                </span>
              </div>
              {discountRate && (
                <div className="flex items-center justify-between border-t border-slate-200 pt-2">
                  <span className="text-xs text-slate-500">할인율</span>
                  <Badge variant="destructive" className="text-xs">
                    -{discountRate}%
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* Closed school specific info */}
          {property.source === 'closed_school' ? (
            <>
              <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3">
                <div className="flex items-center gap-2 mb-2.5">
                  <School className="h-4 w-4 text-amber-600" />
                  <p className="text-xs font-semibold text-slate-700">폐교 정보</p>
                </div>
                <div className="space-y-2">
                  {property.closedYear && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">폐교 연도</span>
                      <span className="text-sm font-medium text-slate-700">{property.closedYear}년</span>
                    </div>
                  )}
                  {property.schoolLevel && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">학교 유형</span>
                      <span className="text-sm font-medium text-slate-700">{property.schoolLevel}등학교</span>
                    </div>
                  )}
                  {property.buildingArea != null && property.buildingArea > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">건물 면적</span>
                      <span className="text-sm font-medium text-slate-700">
                        {property.buildingArea.toLocaleString()}㎡
                      </span>
                    </div>
                  )}
                  {property.area != null && property.area > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">토지 면적</span>
                      <span className="text-sm font-medium text-slate-700">
                        {property.area.toLocaleString()}㎡ ({Math.round(property.area / 3.3058).toLocaleString()}평)
                      </span>
                    </div>
                  )}
                  {property.sido && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">지역</span>
                      <span className="text-sm font-medium text-slate-700">{property.sido}</span>
                    </div>
                  )}
                </div>
              </div>
              {property.unusedReason && (
                <div className="flex items-start gap-2">
                  <Tag className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">미활용 사유</p>
                    <p className="text-xs text-slate-700 leading-relaxed">{property.unusedReason}</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Bid Period */}
              <div className="flex items-start gap-2">
                <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1">입찰 기간</p>
                  <p className="text-sm text-slate-800">
                    {formatDate(property.bidStartDate)} ~ {formatDate(property.bidEndDate)}
                  </p>
                </div>
              </div>

              {/* Item Type */}
              <div className="flex items-start gap-2">
                <Tag className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1">물건 종류</p>
                  <Badge variant="outline">{property.itemType}</Badge>
                </div>
              </div>

              {/* Disposal Method */}
              <div className="flex items-start gap-2">
                <Gavel className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1">처분 방식</p>
                  <Badge variant="warning">{property.disposalMethod}</Badge>
                </div>
              </div>
            </>
          )}

          {/* Land Detail from V-World */}
          <div className="rounded-lg border border-slate-100 bg-blue-50/50 p-3">
            <p className="text-xs font-semibold text-slate-700 mb-2.5">토지 상세정보</p>
            {landLoading ? (
              <div className="flex items-center gap-2 py-2">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
                <span className="text-xs text-slate-500">토지 정보 조회 중...</span>
              </div>
            ) : landDetail ? (
              <div className="space-y-2.5">
                {/* Area */}
                <div className="flex items-start gap-2">
                  <Ruler className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" />
                  <div className="flex-1">
                    <p className="text-[11px] text-slate-500">면적</p>
                    {landDetail.area != null ? (
                      <p className="text-sm font-medium text-slate-800">
                        {formatArea(landDetail.area)}{' '}
                        <span className="text-slate-400">({formatPyeong(landDetail.area)})</span>
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400">정보 없음</p>
                    )}
                  </div>
                </div>
                {/* Official Price */}
                <div className="flex items-start gap-2">
                  <Banknote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" />
                  <div className="flex-1">
                    <p className="text-[11px] text-slate-500">공시지가</p>
                    {landDetail.officialPrice != null ? (
                      <p className="text-sm font-medium text-slate-800">
                        {landDetail.officialPrice.toLocaleString()}원/㎡
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400">정보 없음</p>
                    )}
                  </div>
                </div>
                {/* Zone Type */}
                <div className="flex items-start gap-2">
                  <Map className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" />
                  <div className="flex-1">
                    <p className="text-[11px] text-slate-500">용도지역</p>
                    {landDetail.zoneName ? (
                      <Badge variant="outline" className="text-[11px]">
                        {landDetail.zoneName}
                      </Badge>
                    ) : (
                      <p className="text-xs text-slate-400">정보 없음</p>
                    )}
                  </div>
                </div>
                {/* PNU */}
                {landDetail.pnu && (
                  <div className="pt-1 border-t border-slate-100">
                    <p className="text-[10px] text-slate-400">
                      PNU: {landDetail.pnu}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-1">
                토지 정보를 조회할 수 없습니다
              </p>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* CTA Buttons */}
      <div className="space-y-2 border-t border-slate-100 p-4">
        {property.onbidUrl && (
          <Button
            variant="outline"
            className="w-full gap-2"
            asChild
          >
            <a href={property.onbidUrl} target="_blank" rel="noopener noreferrer">
              온비드에서 보기
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        )}
        {property.lat != null && property.lng != null && (
          <Button className="w-full gap-2" onClick={handleStartDesign}>
            이 땅에 설계 시작
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
});
