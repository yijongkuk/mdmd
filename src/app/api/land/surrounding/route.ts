import { NextResponse } from 'next/server';
import { getSurroundingBuildings, getSurroundingRoads } from '@/lib/api/vworld';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { centroidLat, centroidLng, radiusMeters = 200 } = body;

    if (!centroidLat || !centroidLng) {
      return NextResponse.json(
        { error: 'centroidLat and centroidLng are required' },
        { status: 400 },
      );
    }

    const [buildings, roads] = await Promise.all([
      getSurroundingBuildings(centroidLat, centroidLng, radiusMeters),
      getSurroundingRoads(centroidLat, centroidLng, radiusMeters),
    ]);

    return NextResponse.json({ buildings, roads });
  } catch (err) {
    console.error('Surrounding context API error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch surrounding context' },
      { status: 500 },
    );
  }
}
