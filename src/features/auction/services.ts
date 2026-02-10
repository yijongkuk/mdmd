import type { AuctionListResponse } from '@/types/auction';
import type { MapBounds } from '@/types/land';

interface FetchOptions {
  page?: number;
  size?: number;
  disposalMethodCode?: string;
  region?: string;      // 'metro' for 수도권
  source?: string;      // 'kamco', 'inst', 'all'
  category?: string;    // 'land' for 토지 only
  skipGeocode?: boolean; // true → 지오코딩 건너뛰기 (빠른 응답)
  regionKeyword?: string; // CLTR_NM 서버 측 지역 필터
}

export async function fetchAuctionProperties(
  bounds: MapBounds | null,
  options?: FetchOptions
): Promise<AuctionListResponse> {
  const params = new URLSearchParams();
  if (options?.page) params.set('page', String(options.page));
  if (options?.size) params.set('size', String(options.size));
  if (options?.disposalMethodCode) params.set('method', options.disposalMethodCode);
  if (options?.region) params.set('region', options.region);
  if (options?.source) params.set('source', options.source);
  if (options?.category) params.set('category', options.category);
  if (options?.skipGeocode) params.set('skipGeocode', 'true');
  if (options?.regionKeyword) params.set('regionKeyword', options.regionKeyword);
  if (bounds) {
    params.set('swLat', String(bounds.sw.lat));
    params.set('swLng', String(bounds.sw.lng));
    params.set('neLat', String(bounds.ne.lat));
    params.set('neLng', String(bounds.ne.lng));
  }

  const res = await fetch(`/api/auction?${params.toString()}`);
  if (!res.ok) {
    throw new Error('공매 데이터를 불러오지 못했습니다.');
  }
  return res.json();
}
