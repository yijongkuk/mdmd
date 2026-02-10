import { NextRequest, NextResponse } from 'next/server';
import { getCadastralParcels } from '@/lib/api/vworld';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const swLat = parseFloat(searchParams.get('swLat') ?? '');
  const swLng = parseFloat(searchParams.get('swLng') ?? '');
  const neLat = parseFloat(searchParams.get('neLat') ?? '');
  const neLng = parseFloat(searchParams.get('neLng') ?? '');

  if ([swLat, swLng, neLat, neLng].some(Number.isNaN)) {
    return NextResponse.json({ parcels: [], source: 'none' });
  }

  try {
    const vworldParcels = await getCadastralParcels(
      { sw: { lat: swLat, lng: swLng }, ne: { lat: neLat, lng: neLng } }
    );
    return NextResponse.json({ parcels: vworldParcels, source: 'vworld' });
  } catch (e) {
    console.error('V-World API error:', e);
    return NextResponse.json({ parcels: [], source: 'error' });
  }
}
