interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiry: Date.now() + ttlMs });
}

export const TTL = {
  PARCEL_LIST: 60 * 60 * 1000,
  PNU_QUERY: 24 * 60 * 60 * 1000,
  GEOCODE: 24 * 60 * 60 * 1000,
  AUCTION: 4 * 60 * 60 * 1000, // 4시간 (OnBid API 응답 18~25초 소요)
  ELEVATION: 7 * 24 * 60 * 60 * 1000, // 7일 (지형 변경 없음)
  SURROUNDING: 24 * 60 * 60 * 1000, // 24시간 (건물/도로 변경 없음)
  SOIL: 7 * 24 * 60 * 60 * 1000, // 7일 (토양 정보 변경 없음)
};

/** Clear all cached auction data (forces re-fetch from OnBid) */
export function clearAuctionCache(): number {
  let count = 0;
  for (const key of cache.keys()) {
    if (key.startsWith('auction:')) {
      cache.delete(key);
      count++;
    }
  }
  return count;
}

export function boundsKey(swLat: number, swLng: number, neLat: number, neLng: number): string {
  return `${swLat.toFixed(4)},${swLng.toFixed(4)},${neLat.toFixed(4)},${neLng.toFixed(4)}`;
}
