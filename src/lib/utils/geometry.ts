export interface Point2D {
  x: number;
  y: number;
}

export interface Rect2D {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Calculate the area of a polygon using the Shoelace formula */
export function polygonArea(points: Point2D[]): number {
  const n = points.length;
  if (n < 3) return 0;

  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

/** Check if a point is inside a polygon using ray casting */
export function pointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

/** Check if a rectangle is fully within a polygon */
export function rectInPolygon(rect: Rect2D, polygon: Point2D[]): boolean {
  const corners: Point2D[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  return corners.every((corner) => pointInPolygon(corner, polygon));
}

/** Inset a rectangular polygon by setback values on each side */
export function insetRectangle(
  width: number,
  depth: number,
  setbackFront: number,
  setbackRear: number,
  setbackLeft: number,
  setbackRight: number
): { width: number; depth: number; offsetX: number; offsetZ: number } {
  const innerWidth = Math.max(0, width - setbackLeft - setbackRight);
  const innerDepth = Math.max(0, depth - setbackFront - setbackRear);
  return {
    width: innerWidth,
    depth: innerDepth,
    offsetX: setbackLeft,
    offsetZ: setbackFront,
  };
}

/** Calculate distance between two 2D points */
export function distance2D(a: Point2D, b: Point2D): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
