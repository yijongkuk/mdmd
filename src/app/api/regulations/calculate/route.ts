import { NextRequest, NextResponse } from 'next/server';
import { calculateRegulations } from '@/features/regulations/engine';
import { ZONE_REGULATIONS } from '@/features/regulations/lookupTable';
import type { ZoneType } from '@/features/regulations/lookupTable';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { area, zoneType, width, depth } = body as {
    area?: number;
    zoneType?: string;
    width?: number;
    depth?: number;
  };

  if (!area || area <= 0) {
    return NextResponse.json(
      { error: '면적(area)은 0보다 큰 숫자여야 합니다.' },
      { status: 400 }
    );
  }

  if (!zoneType || !(zoneType in ZONE_REGULATIONS)) {
    return NextResponse.json(
      { error: '유효하지 않은 용도지역(zoneType)입니다.' },
      { status: 400 }
    );
  }

  const result = calculateRegulations({
    area,
    zoneType: zoneType as ZoneType,
    width,
    depth,
  });

  return NextResponse.json({
    zoneType,
    zoneNameKo: result.zoneRegulation.nameKo,
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
