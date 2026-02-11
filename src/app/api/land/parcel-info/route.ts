import { NextRequest, NextResponse } from 'next/server';
import { getParcelByCoords, getParcelByPnu, getLandUseZone } from '@/lib/api/vworld';
import { ZONE_TYPE_LABELS } from '@/types/land';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const pnu = searchParams.get('pnu');
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lng = parseFloat(searchParams.get('lng') ?? '');

  if (!pnu && (Number.isNaN(lat) || Number.isNaN(lng))) {
    return NextResponse.json({ error: 'pnu or lat,lng required' }, { status: 400 });
  }

  try {
    // Fallback 체인: PNU (산구분 자동 변환 포함) → 좌표 (point-in-polygon)
    let parcel = pnu ? await getParcelByPnu(pnu) : null;

    // PNU 조회 실패 시 좌표 기반 fallback
    if ((!parcel || !parcel.geometryJson) && !Number.isNaN(lat) && !Number.isNaN(lng)) {
      parcel = await getParcelByCoords(lat, lng);
    }

    const zoneLat = parcel?.centroidLat ?? lat;
    const zoneLng = parcel?.centroidLng ?? lng;
    const zoneType = (!Number.isNaN(zoneLat) && !Number.isNaN(zoneLng))
      ? await getLandUseZone(zoneLat, zoneLng)
      : null;

    return NextResponse.json({
      pnu: parcel?.pnu ?? null,
      address: parcel?.address ?? null,
      area: parcel?.area ?? null,
      officialPrice: parcel?.officialPrice ?? null,
      geometry: parcel?.geometryJson ?? null,
      centroidLat: parcel?.centroidLat ?? null,
      centroidLng: parcel?.centroidLng ?? null,
      zoneType: zoneType ?? null,
      zoneName: zoneType ? ZONE_TYPE_LABELS[zoneType] ?? null : null,
    });
  } catch (e) {
    console.error('Parcel info API error:', e);
    return NextResponse.json({
      pnu: null, address: null, area: null,
      officialPrice: null, geometry: null,
      centroidLat: null, centroidLng: null,
      zoneType: null, zoneName: null,
    });
  }
}
