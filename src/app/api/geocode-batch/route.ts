import { NextResponse } from 'next/server';
import { getParcelByPnu } from '@/lib/api/vworld';

const MAX_BATCH_SIZE = 100;
const CONCURRENCY = 20;

async function runConcurrent<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = [];
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

interface GeoItem {
  address: string;
  pnu?: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 새 형식: { items: [{address, pnu?}] } 또는 기존 형식: { addresses: string[] }
    let items: GeoItem[];
    if (Array.isArray(body?.items)) {
      items = body.items;
    } else if (Array.isArray(body?.addresses)) {
      items = body.addresses.map((a: string) => ({ address: a }));
    } else {
      return NextResponse.json({ error: 'items or addresses array required' }, { status: 400 });
    }

    if (items.length === 0) {
      return NextResponse.json({ results: {} });
    }

    if (items.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Max ${MAX_BATCH_SIZE} items per request` },
        { status: 400 },
      );
    }

    const coords = await runConcurrent(
      items,
      async (item) => {
        // PNU → V-World 필지 경계 조회 → 폴리곤 중심점 (가장 정확)
        // 주소 fallback은 클라이언트 Kakao 지오코딩이 담당
        if (item.pnu) {
          const parcel = await getParcelByPnu(item.pnu);
          if (parcel?.centroidLat && parcel?.centroidLng) {
            return { address: item.address, coords: { lat: parcel.centroidLat, lng: parcel.centroidLng } };
          }
        }
        return { address: item.address, coords: null };
      },
      CONCURRENCY,
    );

    const results: Record<string, { lat: number; lng: number }> = {};
    for (const { address, coords: c } of coords) {
      if (c) {
        results[address] = c;
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error('geocode-batch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
