import { NextRequest, NextResponse } from 'next/server';
import { SEED_PARCELS } from '@/features/land/seedData';
import { calculateRegulations } from '@/features/regulations/engine';
import { ZONE_TYPE_LABELS } from '@/types/land';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ pnu: string }> }
) {
  const { pnu } = await params;

  const parcel = SEED_PARCELS.find((p) => p.pnu === pnu);

  if (!parcel) {
    return NextResponse.json(
      { error: '필지를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  const effectiveZoneType = parcel.zoneType ?? 'ZONE_R2_GENERAL';
  const result = calculateRegulations({
    area: parcel.area,
    zoneType: effectiveZoneType,
  });

  return NextResponse.json({
    pnu: parcel.pnu,
    address: parcel.address,
    area: parcel.area,
    zoneType: effectiveZoneType,
    zoneNameKo: ZONE_TYPE_LABELS[effectiveZoneType],
    maxCoverageRatio: result.zoneRegulation.maxCoverageRatio,
    maxFloorAreaRatio: result.zoneRegulation.maxFloorAreaRatio,
    maxHeight: result.zoneRegulation.maxHeight,
    maxFloors: result.zoneRegulation.maxFloors,
    setbackFront: result.zoneRegulation.setbackFront,
    setbackRear: result.zoneRegulation.setbackRear,
    setbackLeft: result.zoneRegulation.setbackLeft,
    setbackRight: result.zoneRegulation.setbackRight,
    buildableArea: result.buildableArea,
    maxBuildingFootprint: result.maxBuildingFootprint,
    maxTotalFloorArea: result.maxTotalFloorArea,
    effectiveMaxFloors: result.effectiveMaxFloors,
  });
}
