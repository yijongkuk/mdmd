import type { LandParcel, ParcelInfo, MapBounds } from '@/types/land';

/**
 * Fetch parcels within the given map bounds via the API route.
 * The API route handles V-World priority with seed data fallback.
 */
export async function fetchParcelsInBounds(
  bounds: MapBounds
): Promise<LandParcel[]> {
  const params = new URLSearchParams({
    swLat: String(bounds.sw.lat),
    swLng: String(bounds.sw.lng),
    neLat: String(bounds.ne.lat),
    neLng: String(bounds.ne.lng),
  });

  const res = await fetch(`/api/land?${params.toString()}`);
  if (!res.ok) {
    throw new Error('필지 데이터를 불러오지 못했습니다.');
  }

  const data = await res.json();
  return data.parcels as LandParcel[];
}

/**
 * Get a single parcel by PNU, enriched with regulation data.
 * The API route handles V-World lookup with seed data fallback.
 */
export async function fetchParcelByPnu(
  pnu: string
): Promise<ParcelInfo | null> {
  const res = await fetch(`/api/land/${encodeURIComponent(pnu)}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error('필지 정보를 불러오지 못했습니다.');
  }

  return res.json() as Promise<ParcelInfo>;
}
