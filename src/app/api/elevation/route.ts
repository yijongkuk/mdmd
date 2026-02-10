import { NextResponse } from 'next/server';
import { getElevations } from '@/lib/api/elevation';

const MAX_POINTS = 500;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const locations: { latitude: number; longitude: number }[] = body?.locations;

    if (!Array.isArray(locations) || locations.length === 0) {
      return NextResponse.json(
        { error: 'locations array required (each with latitude, longitude)' },
        { status: 400 },
      );
    }

    if (locations.length > MAX_POINTS) {
      return NextResponse.json(
        { error: `Max ${MAX_POINTS} points per request` },
        { status: 400 },
      );
    }

    const results = await getElevations(locations);
    return NextResponse.json({ results });
  } catch (err) {
    console.error('elevation API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
