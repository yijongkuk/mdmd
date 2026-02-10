export interface Point2D {
  x: number;
  y: number;
}

export interface Polygon2D {
  points: Point2D[];
}

/**
 * Given a rectangular parcel boundary and setback values,
 * compute the inner buildable polygon.
 * For MVP: assumes rectangular parcels aligned to axes.
 * Points are expected in order: bottom-left, bottom-right, top-right, top-left.
 */
export function computeBuildablePolygon(
  parcelPolygon: Polygon2D,
  setbackFront: number,
  setbackRear: number,
  setbackLeft: number,
  setbackRight: number,
): Polygon2D {
  const pts = parcelPolygon.points;
  if (pts.length < 4) {
    return { points: [] };
  }

  // Compute axis-aligned bounding box
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  // Convention: front = minY (south), rear = maxY (north),
  // left = minX (west), right = maxX (east)
  const innerMinX = minX + setbackLeft;
  const innerMaxX = maxX - setbackRight;
  const innerMinY = minY + setbackFront;
  const innerMaxY = maxY - setbackRear;

  if (innerMinX >= innerMaxX || innerMinY >= innerMaxY) {
    return { points: [] };
  }

  return {
    points: [
      { x: innerMinX, y: innerMinY },
      { x: innerMaxX, y: innerMinY },
      { x: innerMaxX, y: innerMaxY },
      { x: innerMinX, y: innerMaxY },
    ],
  };
}

/**
 * Calculate the area of a 2D polygon using the Shoelace formula.
 * Points should be ordered (clockwise or counter-clockwise).
 */
export function calculatePolygonArea(polygon: Polygon2D): number {
  const pts = polygon.points;
  const n = pts.length;
  if (n < 3) return 0;

  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }

  return Math.abs(area) / 2;
}

/**
 * Check if a point is inside a polygon using the ray casting algorithm.
 * Works for convex and concave polygons.
 */
export function isPointInPolygon(point: Point2D, polygon: Polygon2D): boolean {
  const pts = polygon.points;
  const n = pts.length;
  if (n < 3) return false;

  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Check if a rectangle (module footprint) is fully within the buildable polygon.
 * The rect is defined by its bottom-left corner (x, z) and dimensions (width, depth).
 * All four corners must be inside the polygon.
 */
export function isRectInPolygon(
  rect: { x: number; z: number; width: number; depth: number },
  polygon: Polygon2D,
): boolean {
  const corners: Point2D[] = [
    { x: rect.x, y: rect.z },
    { x: rect.x + rect.width, y: rect.z },
    { x: rect.x + rect.width, y: rect.z + rect.depth },
    { x: rect.x, y: rect.z + rect.depth },
  ];

  return corners.every((corner) => isPointInPolygon(corner, polygon));
}
