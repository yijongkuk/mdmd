import { NextResponse } from 'next/server';
import { geocodeAddress } from '@/lib/api/vworld';

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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const addresses: string[] = body?.addresses;

    if (!Array.isArray(addresses) || addresses.length === 0) {
      return NextResponse.json({ error: 'addresses array required' }, { status: 400 });
    }

    if (addresses.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Max ${MAX_BATCH_SIZE} addresses per request` },
        { status: 400 },
      );
    }

    const coords = await runConcurrent(
      addresses,
      async (addr) => {
        const result = await geocodeAddress(addr);
        return { address: addr, coords: result };
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
