import { NextRequest, NextResponse } from 'next/server';

/**
 * V-World 위성 타일 프록시 (CORS 우회)
 * GET /api/satellite-tile?z=18&x=123&y=456
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const z = searchParams.get('z');
  const x = searchParams.get('x');
  const y = searchParams.get('y');

  if (!z || !x || !y) {
    return NextResponse.json({ error: 'z, x, y required' }, { status: 400 });
  }

  const url = `https://xdworld.vworld.kr/2d/Satellite/service/${z}/${x}/${y}.jpeg`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return new NextResponse(null, { status: res.status });
    }

    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch tile' }, { status: 502 });
  }
}
