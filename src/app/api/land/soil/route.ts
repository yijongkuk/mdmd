import { NextRequest, NextResponse } from 'next/server';
import { getSoilInfo } from '@/lib/api/soil';

export async function GET(request: NextRequest) {
  const pnu = request.nextUrl.searchParams.get('pnu');

  if (!pnu || pnu.length < 19) {
    return NextResponse.json({ error: 'Valid 19-digit PNU required' }, { status: 400 });
  }

  try {
    const soilInfo = await getSoilInfo(pnu);
    return NextResponse.json(soilInfo);
  } catch (e) {
    console.error('Soil API error:', e);
    return NextResponse.json({
      characteristics: null,
      profile: null,
      chemistry: null,
      difficultyLevel: null,
      difficultyLabel: null,
    });
  }
}
