/** Local 2D point in meters relative to centroid */
export interface LocalPoint {
  x: number;
  z: number;
}

/**
 * Convert a WGS84 coordinate to local meters relative to a centroid.
 * Uses equirectangular approximation (accurate for small areas <10km).
 */
export function wgs84ToLocal(
  lng: number,
  lat: number,
  centroidLng: number,
  centroidLat: number,
): LocalPoint {
  const x = (lng - centroidLng) * Math.cos(centroidLat * Math.PI / 180) * 111320;
  const z = (lat - centroidLat) * 110540;
  return { x, z };
}

/**
 * Convert local meter coordinates back to WGS84 (inverse of wgs84ToLocal).
 */
export function localToWgs84(
  x: number,
  z: number,
  centroidLng: number,
  centroidLat: number,
): { lng: number; lat: number } {
  const lng = x / (Math.cos(centroidLat * Math.PI / 180) * 111320) + centroidLng;
  const lat = z / 110540 + centroidLat;
  return { lng, lat };
}

/**
 * Convert a GeoJSON polygon ring (array of [lng, lat]) to local meter coordinates.
 * Removes the closing duplicate vertex (GeoJSON rings are closed).
 */
export function geoJsonRingToLocal(
  ring: number[][],
  centroidLng: number,
  centroidLat: number,
): LocalPoint[] {
  // Remove closing vertex if it duplicates the first
  const points = ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring;

  return points.map(([lng, lat]) => wgs84ToLocal(lng, lat, centroidLng, centroidLat));
}
