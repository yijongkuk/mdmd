import { NextRequest, NextResponse } from 'next/server';
import { SEED_PARCELS } from '@/features/land/seedData';
import { calculateRegulations } from '@/features/regulations/engine';
import { getParcelByPnu, getLandUseZone } from '@/lib/api/vworld';
import type { ParcelInfo } from '@/types/land';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ pnu: string }> }
) {
  const { pnu } = await params;

  // Try V-World first
  try {
    const vworldParcel = await getParcelByPnu(pnu);
    if (vworldParcel) {
      // Try to get actual zone type using centroid coordinates
      const zoneType = vworldParcel.centroidLat && vworldParcel.centroidLng
        ? await getLandUseZone(vworldParcel.centroidLat, vworldParcel.centroidLng)
        : null;
      const parcelWithZone = zoneType
        ? { ...vworldParcel, zoneType }
        : vworldParcel;

      const regResult = calculateRegulations({
        area: parcelWithZone.area ?? 0,
        zoneType: parcelWithZone.zoneType ?? 'ZONE_R2_GENERAL',
      });

      const parcelInfo: ParcelInfo = {
        id: parcelWithZone.id ?? '',
        pnu: parcelWithZone.pnu ?? '',
        address: parcelWithZone.address ?? '',
        area: parcelWithZone.area ?? 0,
        zoneType: parcelWithZone.zoneType ?? 'ZONE_R2_GENERAL',
        officialPrice: parcelWithZone.officialPrice ?? 0,
        geometryJson: parcelWithZone.geometryJson ?? { type: 'Polygon', coordinates: [] },
        centroidLat: parcelWithZone.centroidLat ?? 0,
        centroidLng: parcelWithZone.centroidLng ?? 0,
        dataSource: parcelWithZone.dataSource,
        regulation: {
          maxCoverageRatio: regResult.zoneRegulation.maxCoverageRatio,
          maxFloorAreaRatio: regResult.zoneRegulation.maxFloorAreaRatio,
          maxHeight: regResult.zoneRegulation.maxHeight,
          maxFloors: regResult.zoneRegulation.maxFloors,
          setbackFront: regResult.zoneRegulation.setbackFront,
          setbackRear: regResult.zoneRegulation.setbackRear,
          setbackLeft: regResult.zoneRegulation.setbackLeft,
          setbackRight: regResult.zoneRegulation.setbackRight,
          buildableArea: regResult.buildableArea,
          maxTotalFloorArea: regResult.maxTotalFloorArea,
        },
      };
      return NextResponse.json(parcelInfo);
    }
  } catch (e) {
    console.error('V-World API error, falling back to seed data:', e);
  }

  // Fallback to seed data
  const parcel = SEED_PARCELS.find((p) => p.pnu === pnu);
  if (!parcel) {
    return NextResponse.json({ error: '필지를 찾을 수 없습니다.' }, { status: 404 });
  }

  const regResult = calculateRegulations({
    area: parcel.area,
    zoneType: parcel.zoneType ?? 'ZONE_R2_GENERAL',
  });

  const parcelInfo: ParcelInfo = {
    ...parcel,
    regulation: {
      maxCoverageRatio: regResult.zoneRegulation.maxCoverageRatio,
      maxFloorAreaRatio: regResult.zoneRegulation.maxFloorAreaRatio,
      maxHeight: regResult.zoneRegulation.maxHeight,
      maxFloors: regResult.zoneRegulation.maxFloors,
      setbackFront: regResult.zoneRegulation.setbackFront,
      setbackRear: regResult.zoneRegulation.setbackRear,
      setbackLeft: regResult.zoneRegulation.setbackLeft,
      setbackRight: regResult.zoneRegulation.setbackRight,
      buildableArea: regResult.buildableArea,
      maxTotalFloorArea: regResult.maxTotalFloorArea,
    },
  };
  return NextResponse.json(parcelInfo);
}
