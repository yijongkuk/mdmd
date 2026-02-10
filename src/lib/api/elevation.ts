import { getCached, setCache, TTL } from './cache';

const OPEN_ELEVATION_URL = 'https://api.open-elevation.com/api/v1/lookup';

interface ElevationPoint {
  latitude: number;
  longitude: number;
  elevation: number;
}

/**
 * Query elevations for a grid of lat/lng points.
 * Uses Open-Elevation API (SRTM ~30m resolution).
 * Results are cached for 7 days.
 */
export async function getElevations(
  locations: { latitude: number; longitude: number }[],
): Promise<ElevationPoint[]> {
  if (locations.length === 0) return [];

  // Build a stable cache key from the locations
  const keyParts = locations.map(
    (l) => `${l.latitude.toFixed(6)},${l.longitude.toFixed(6)}`,
  );
  const cacheKey = `elevation:${keyParts.join('|')}`;
  const cached = getCached<ElevationPoint[]>(cacheKey);
  if (cached) return cached;

  const res = await fetch(OPEN_ELEVATION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locations }),
  });

  if (!res.ok) {
    console.error('Open-Elevation API error:', res.status, await res.text().catch(() => ''));
    return [];
  }

  const json = await res.json();
  const results: ElevationPoint[] = json?.results ?? [];

  if (results.length > 0) {
    setCache(cacheKey, results, TTL.ELEVATION);
  }
  return results;
}
