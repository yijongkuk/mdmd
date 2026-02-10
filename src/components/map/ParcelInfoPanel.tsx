'use client';

import { useRouter } from 'next/navigation';
import { X, ArrowRight, MapPin, Ruler, Building2, Landmark, Layers } from 'lucide-react';
import type { ParcelInfo } from '@/types/land';
import { ZONE_TYPE_LABELS, ZONE_TYPE_COLORS } from '@/types/land';
import { formatWon, formatArea, formatPyeong, formatPercent, formatHeight } from '@/lib/utils/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/cn';

interface ParcelInfoPanelProps {
  parcel: ParcelInfo | null;
  isLoading: boolean;
  onClose: () => void;
}

export function ParcelInfoPanel({ parcel, isLoading, onClose }: ParcelInfoPanelProps) {
  const router = useRouter();

  if (!parcel && !isLoading) return null;

  const handleStartDesign = () => {
    if (!parcel) return;
    // Create a new project by navigating with the parcel PNU as a query param.
    // The builder page will create the project record.
    const newProjectId = crypto.randomUUID();
    router.push(`/builder/${newProjectId}?parcelPnu=${parcel.pnu}`);
  };

  const zoneColor = parcel?.zoneType ? ZONE_TYPE_COLORS[parcel.zoneType] : '#94a3b8';
  const zoneLabel = parcel?.zoneType ? ZONE_TYPE_LABELS[parcel.zoneType] : '미확인';
  const totalLandValue = parcel ? (parcel.officialPrice ?? 0) * parcel.area : 0;

  return (
    <div
      className={cn(
        'absolute right-0 top-0 z-30 flex h-full w-full flex-col border-l border-slate-200 bg-white shadow-xl transition-transform duration-300 sm:w-[400px]',
        parcel || isLoading ? 'translate-x-0' : 'translate-x-full'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-900">필지 정보</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
            <p className="text-sm text-slate-500">필지 정보를 불러오는 중...</p>
          </div>
        </div>
      )}

      {/* Content */}
      {parcel && !isLoading && (
        <ScrollArea className="flex-1">
          <div className="space-y-5 p-4">
            {/* Address & Zone */}
            <div>
              <div className="flex items-start gap-2 mb-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div>
                  <p className="text-sm font-medium text-slate-900">{parcel.address}</p>
                  <p className="text-xs text-slate-400 mt-0.5">PNU: {parcel.pnu}</p>
                </div>
              </div>
              <Badge
                className="mt-1 text-white"
                style={{ backgroundColor: zoneColor }}
              >
                {zoneLabel}
              </Badge>
            </div>

            {/* Area & Price */}
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="grid grid-cols-2 gap-3">
                <InfoItem
                  icon={<Ruler className="h-3.5 w-3.5" />}
                  label="대지면적"
                  value={`${formatArea(parcel.area)} (${formatPyeong(parcel.area)})`}
                />
                <InfoItem
                  icon={<Landmark className="h-3.5 w-3.5" />}
                  label="공시지가"
                  value={`${formatWon(parcel.officialPrice)}/m²`}
                />
                <InfoItem
                  icon={<Layers className="h-3.5 w-3.5" />}
                  label="토지 가치"
                  value={formatWon(totalLandValue)}
                  className="col-span-2"
                />
              </div>
            </div>

            {/* Regulation Summary */}
            {parcel.regulation && (
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                  <Building2 className="h-4 w-4" />
                  건축 규제 요약
                </h3>
                <div className="space-y-2">
                  <RegulationRow
                    label="건폐율"
                    value={formatPercent(parcel.regulation.maxCoverageRatio)}
                  />
                  <RegulationRow
                    label="용적률"
                    value={formatPercent(parcel.regulation.maxFloorAreaRatio)}
                  />
                  <RegulationRow
                    label="최고높이"
                    value={
                      parcel.regulation.maxHeight > 0
                        ? formatHeight(parcel.regulation.maxHeight)
                        : '제한 없음'
                    }
                  />
                  <RegulationRow
                    label="최고층수"
                    value={
                      parcel.regulation.maxFloors > 0
                        ? `${parcel.regulation.maxFloors}층`
                        : '제한 없음'
                    }
                  />
                </div>

                {/* Setbacks */}
                <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-semibold text-slate-600">이격거리 (m)</p>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <SetbackCell label="전면" value={parcel.regulation.setbackFront} />
                    <SetbackCell label="후면" value={parcel.regulation.setbackRear} />
                    <SetbackCell label="좌측" value={parcel.regulation.setbackLeft} />
                    <SetbackCell label="우측" value={parcel.regulation.setbackRight} />
                  </div>
                </div>

                {/* Buildable area */}
                <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-blue-700">건축 가능 면적</span>
                    <span className="text-sm font-bold text-blue-900">
                      {formatArea(parcel.regulation.buildableArea)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-blue-700">최대 연면적</span>
                    <span className="text-sm font-bold text-blue-900">
                      {formatArea(parcel.regulation.maxTotalFloorArea)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      )}

      {/* CTA */}
      {parcel && !isLoading && (
        <div className="border-t border-slate-100 p-4">
          <Button className="w-full gap-2" onClick={handleStartDesign}>
            이 땅에 설계 시작
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function InfoItem({
  icon,
  label,
  value,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-center gap-1 text-slate-400 mb-0.5">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function RegulationRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5">
      <span className="text-xs text-slate-600">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function SetbackCell({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-800">{value}m</p>
    </div>
  );
}
