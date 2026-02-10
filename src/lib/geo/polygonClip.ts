import type { LocalPoint } from './coordTransform';

/** Compute the signed area of a polygon (positive = CCW, negative = CW) */
export function polygonSignedArea(polygon: LocalPoint[]): number {
  let area = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i].x * polygon[j].z - polygon[j].x * polygon[i].z;
  }
  return area / 2;
}

/**
 * Shrink a polygon inward by a uniform distance (setback).
 * Each edge is offset inward, then consecutive offset edges are intersected.
 */
export function polygonInset(polygon: LocalPoint[], distance: number): LocalPoint[] {
  const n = polygon.length;
  if (n < 3 || distance <= 0) return polygon;

  // Determine winding: positive signed area = CCW
  const sign = polygonSignedArea(polygon) > 0 ? 1 : -1;

  // For each edge, compute the offset line (point + direction)
  const offsetEdges: Array<{ px: number; pz: number; dx: number; dz: number }> = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ex = polygon[j].x - polygon[i].x;
    const ez = polygon[j].z - polygon[i].z;
    const len = Math.sqrt(ex * ex + ez * ez);
    if (len === 0) continue;

    // Inward normal (left of direction for CCW)
    const nx = sign * (-ez / len);
    const nz = sign * (ex / len);

    offsetEdges.push({
      px: polygon[i].x + nx * distance,
      pz: polygon[i].z + nz * distance,
      dx: ex,
      dz: ez,
    });
  }

  // Find intersections of consecutive offset edges
  const result: LocalPoint[] = [];
  const m = offsetEdges.length;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    const e1 = offsetEdges[i];
    const e2 = offsetEdges[j];

    const denom = e1.dx * e2.dz - e1.dz * e2.dx;
    if (Math.abs(denom) < 1e-10) {
      // Parallel edges — use midpoint
      result.push({ x: (e1.px + e2.px) / 2, z: (e1.pz + e2.pz) / 2 });
    } else {
      const t = ((e2.px - e1.px) * e2.dz - (e2.pz - e1.pz) * e2.dx) / denom;
      result.push({ x: e1.px + t * e1.dx, z: e1.pz + t * e1.dz });
    }
  }

  return result;
}

/** Bounding box of a polygon */
export interface PolygonBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Compute the axis-aligned bounding box of a polygon */
export function polygonBounds(polygon: LocalPoint[]): PolygonBounds {
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const p of polygon) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minZ, maxZ };
}

/** Ray casting point-in-polygon test */
export function pointInPolygon(point: LocalPoint, polygon: LocalPoint[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    if (
      (pi.z > point.z) !== (pj.z > point.z) &&
      point.x < ((pj.x - pi.x) * (point.z - pi.z)) / (pj.z - pi.z) + pi.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Clip a horizontal line segment (constant z, varying x) to the polygon interior.
 * Returns an array of [startX, endX] pairs that are inside.
 */
export function clipHorizontalLine(
  z: number,
  xMin: number,
  xMax: number,
  polygon: LocalPoint[],
): Array<[number, number]> {
  // Find all x-intersections of the polygon edges with this z
  const intersections: number[] = [];
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    if ((pi.z <= z && pj.z > z) || (pj.z <= z && pi.z > z)) {
      const x = pi.x + ((z - pi.z) / (pj.z - pi.z)) * (pj.x - pi.x);
      intersections.push(x);
    }
  }
  intersections.sort((a, b) => a - b);

  // Pair intersections to get inside segments
  const segments: Array<[number, number]> = [];
  for (let i = 0; i + 1 < intersections.length; i += 2) {
    const start = Math.max(intersections[i], xMin);
    const end = Math.min(intersections[i + 1], xMax);
    if (start < end) {
      segments.push([start, end]);
    }
  }
  return segments;
}

/**
 * Find the largest axis-aligned rectangle fully inscribed within a polygon.
 * Uses a sweep-line approach: sample horizontal slices, find x-range at each,
 * then maximize area over all pairs of slices.
 */
export function maxInscribedRect(
  polygon: LocalPoint[],
  steps = 60,
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const bounds = polygonBounds(polygon);
  const dz = (bounds.maxZ - bounds.minZ) / steps;

  // For each z-row, find the x-range inside the polygon
  const ranges: { z: number; left: number; right: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const z = bounds.minZ + i * dz;
    // Find intersections of horizontal line with polygon edges
    const intersections: number[] = [];
    const n = polygon.length;
    for (let j = 0, k = n - 1; j < n; k = j++) {
      const pj = polygon[j];
      const pk = polygon[k];
      if ((pj.z <= z && pk.z > z) || (pk.z <= z && pj.z > z)) {
        const t = (z - pj.z) / (pk.z - pj.z);
        intersections.push(pj.x + t * (pk.x - pj.x));
      }
    }
    if (intersections.length >= 2) {
      intersections.sort((a, b) => a - b);
      ranges.push({ z, left: intersections[0], right: intersections[intersections.length - 1] });
    }
  }

  // Find the largest rectangle from the ranges
  let bestArea = 0;
  let bestRect = { minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ };

  for (let i = 0; i < ranges.length; i++) {
    let minRight = ranges[i].right;
    let maxLeft = ranges[i].left;
    for (let j = i + 1; j < ranges.length; j++) {
      minRight = Math.min(minRight, ranges[j].right);
      maxLeft = Math.max(maxLeft, ranges[j].left);
      const width = minRight - maxLeft;
      const depth = ranges[j].z - ranges[i].z;
      if (width > 0 && depth > 0) {
        const area = width * depth;
        if (area > bestArea) {
          bestArea = area;
          bestRect = { minX: maxLeft, maxX: minRight, minZ: ranges[i].z, maxZ: ranges[j].z };
        }
      }
    }
  }

  return bestRect;
}

/**
 * Clip a vertical line segment (constant x, varying z) to the polygon interior.
 * Returns an array of [startZ, endZ] pairs that are inside.
 */
export function clipVerticalLine(
  x: number,
  zMin: number,
  zMax: number,
  polygon: LocalPoint[],
): Array<[number, number]> {
  // Find all z-intersections of the polygon edges with this x
  const intersections: number[] = [];
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    if ((pi.x <= x && pj.x > x) || (pj.x <= x && pi.x > x)) {
      const z = pi.z + ((x - pi.x) / (pj.x - pi.x)) * (pj.z - pi.z);
      intersections.push(z);
    }
  }
  intersections.sort((a, b) => a - b);

  // Pair intersections to get inside segments
  const segments: Array<[number, number]> = [];
  for (let i = 0; i + 1 < intersections.length; i += 2) {
    const start = Math.max(intersections[i], zMin);
    const end = Math.min(intersections[i + 1], zMax);
    if (start < end) {
      segments.push([start, end]);
    }
  }
  return segments;
}
