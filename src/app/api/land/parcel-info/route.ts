import { NextRequest, NextResponse } from 'next/server';
import { getParcelByCoords, getLandUseZone } from '@/lib/api/vworld';
import { ZONE_TYPE_LABELS } from '@/types/land';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lng = parseFloat(searchParams.get('lng') ?? '');

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json({ error: 'lat, lng required' }, { status: 400 });
  }

  try {
    const [parcel, zoneType] = await Promise.all([
      getParcelByCoords(lat, lng),
      getLandUseZone(lat, lng),
    ]);

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
