import { GRID_SIZE, FLOOR_HEIGHT } from '@/lib/constants/grid';

/** Convert world position (meters) to grid position */
export function worldToGrid(worldX: number, worldZ: number, offsetX = 0, offsetZ = 0): { gridX: number; gridZ: number } {
  return {
    gridX: Math.round((worldX - offsetX) / GRID_SIZE),
    gridZ: Math.round((worldZ - offsetZ) / GRID_SIZE),
  };
}

/** Convert grid position to world position (center of cell) */
export function gridToWorld(gridX: number, gridZ: number, offsetX = 0, offsetZ = 0): { x: number; z: number } {
  return {
    x: gridX * GRID_SIZE + offsetX,
    z: gridZ * GRID_SIZE + offsetZ,
  };
}

/** Snap a world position to the nearest grid point */
export function snapToGrid(x: number, z: number, offsetX = 0, offsetZ = 0): { x: number; z: number } {
  return {
    x: Math.round((x - offsetX) / GRID_SIZE) * GRID_SIZE + offsetX,
    z: Math.round((z - offsetZ) / GRID_SIZE) * GRID_SIZE + offsetZ,
  };
}

/** Get the world-space Y position for a given floor number (floor 1 = y:0, floor 2 = y:3.0, etc.) */
export function floorToWorldY(floor: number): number {
  return (floor - 1) * FLOOR_HEIGHT;
}

/** Get all grid cells occupied by a module at a given position and rotation */
export function getOccupiedCells(
  gridX: number,
  gridZ: number,
  gridWidth: number,
  gridDepth: number,
  rotation: 0 | 90 | 180 | 270,
): Array<{ x: number; z: number }> {
  const cells: Array<{ x: number; z: number }> = [];

  // Determine effective width/depth after rotation
  const effectiveWidth = rotation === 90 || rotation === 270 ? gridDepth : gridWidth;
  const effectiveDepth = rotation === 90 || rotation === 270 ? gridWidth : gridDepth;

  for (let dx = 0; dx < effectiveWidth; dx++) {
    for (let dz = 0; dz < effectiveDepth; dz++) {
      cells.push({ x: gridX + dx, z: gridZ + dz });
    }
  }

  return cells;
}

/** Get effective dimensions after rotation */
export function getRotatedDimensions(
  gridWidth: number,
  gridDepth: number,
  rotation: 0 | 90 | 180 | 270,
): { width: number; depth: number } {
  if (rotation === 90 || rotation === 270) {
    return { width: gridDepth, depth: gridWidth };
  }
  return { width: gridWidth, depth: gridDepth };
}
