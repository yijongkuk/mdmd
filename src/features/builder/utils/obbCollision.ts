import { GRID_SIZE } from '@/lib/constants/grid';
import type { ModulePlacement, ModuleDefinition } from '@/types/builder';

/** 2D Oriented Bounding Box (XZ plane) */
export interface OBB2D {
  cx: number;  // center X (world)
  cz: number;  // center Z (world)
  hw: number;  // half-width (local X axis)
  hd: number;  // half-depth (local Z axis)
  cos: number; // cos(rotation)
  sin: number; // sin(rotation)
}

export interface LocalPoint {
  x: number;
  z: number;
}

/** Create OBB from placement parameters */
export function placementToOBB(
  gridX: number, gridZ: number,
  gridWidth: number, gridDepth: number,
  rotationDeg: number,
  offsetX: number, offsetZ: number,
): OBB2D {
  const w = gridWidth * GRID_SIZE;
  const d = gridDepth * GRID_SIZE;
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Unrotated local center (relative to grid origin corner)
  const localCx = w / 2;
  const localCz = d / 2;

  // Rotate local center around the grid origin (0,0)
  const rotCx = localCx * cos - localCz * sin;
  const rotCz = localCx * sin + localCz * cos;

  // World center
  const worldOriginX = gridX * GRID_SIZE + offsetX;
  const worldOriginZ = gridZ * GRID_SIZE + offsetZ;

  return {
    cx: worldOriginX + rotCx,
    cz: worldOriginZ + rotCz,
    hw: w / 2,
    hd: d / 2,
    cos,
    sin,
  };
}

/** SAT overlap test between two OBBs (2D, 4 axes) */
export function obbOverlap(a: OBB2D, b: OBB2D): boolean {
  // Axes from A: (a.cos, a.sin) and (-a.sin, a.cos)
  // Axes from B: (b.cos, b.sin) and (-b.sin, b.cos)
  const axes = [
    { x: a.cos, z: a.sin },
    { x: -a.sin, z: a.cos },
    { x: b.cos, z: b.sin },
    { x: -b.sin, z: b.cos },
  ];

  const dx = b.cx - a.cx;
  const dz = b.cz - a.cz;

  for (const axis of axes) {
    const projDist = Math.abs(dx * axis.x + dz * axis.z);

    // Project half-extents of A onto axis
    const projA =
      a.hw * Math.abs(a.cos * axis.x + a.sin * axis.z) +
      a.hd * Math.abs(-a.sin * axis.x + a.cos * axis.z);

    // Project half-extents of B onto axis
    const projB =
      b.hw * Math.abs(b.cos * axis.x + b.sin * axis.z) +
      b.hd * Math.abs(-b.sin * axis.x + b.cos * axis.z);

    if (projDist > projA + projB) return false; // separating axis found
  }

  return true; // no separating axis → overlap
}

/** Get 4 corners of an OBB in world coordinates */
export function obbCorners(obb: OBB2D): LocalPoint[] {
  const { cx, cz, hw, hd, cos, sin } = obb;
  // Local corners: (±hw, ±hd)
  const localCorners = [
    { x: -hw, z: -hd },
    { x: hw, z: -hd },
    { x: hw, z: hd },
    { x: -hw, z: hd },
  ];
  return localCorners.map(({ x, z }) => ({
    x: cx + x * cos - z * sin,
    z: cz + x * sin + z * cos,
  }));
}

/** Point-in-polygon (ray casting) */
function pointInPolygon(px: number, pz: number, poly: LocalPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, zi = poly[i].z;
    const xj = poly[j].x, zj = poly[j].z;
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Check if all 4 corners of OBB are inside the polygon */
export function checkOBBInBounds(obb: OBB2D, polygon: LocalPoint[]): boolean {
  const corners = obbCorners(obb);
  return corners.every((c) => pointInPolygon(c.x, c.z, polygon));
}

export interface CollisionResult {
  hasCollision: boolean;
  conflictingIds: string[];
}

/** Check OBB collision against all placements on the same floor */
export function checkOBBCollision(
  newOBB: OBB2D,
  floor: number,
  placements: ModulePlacement[],
  getModule: (id: string) => ModuleDefinition | undefined,
  offsetX: number,
  offsetZ: number,
  excludeIds?: Set<string>,
): CollisionResult {
  const conflictingIds: string[] = [];

  for (const p of placements) {
    if (p.floor !== floor) continue;
    if (excludeIds?.has(p.id)) continue;

    const mod = getModule(p.moduleId);
    if (!mod) continue;

    const pOBB = placementToOBB(p.gridX, p.gridZ, mod.gridWidth, mod.gridDepth, p.rotation, offsetX, offsetZ);
    if (obbOverlap(newOBB, pOBB)) {
      conflictingIds.push(p.id);
    }
  }

  return {
    hasCollision: conflictingIds.length > 0,
    conflictingIds,
  };
}
