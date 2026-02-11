import { ModulePlacement, ModuleDefinition } from '@/types/builder';
import { getOccupiedCells } from './gridUtils';

/** Key format: "floor:gridX:gridZ" */
type OccupancyMap = Map<string, string>; // cell key -> placementId

function cellKey(floor: number, x: number, z: number): string {
  return `${floor}:${x}:${z}`;
}

/** Build an occupancy map from all placements */
export function createOccupancyMap(
  placements: ModulePlacement[],
  getModule: (id: string) => ModuleDefinition | undefined,
): OccupancyMap {
  const map: OccupancyMap = new Map();

  for (const p of placements) {
    const mod = getModule(p.moduleId);
    if (!mod) continue;

    const cells = getOccupiedCells(p.gridX, p.gridZ, mod.gridWidth, mod.gridDepth, p.rotation);
    for (const cell of cells) {
      map.set(cellKey(p.floor, cell.x, cell.z), p.id);
    }
  }

  return map;
}

/** Check if any cell of the module falls outside the buildable grid bounds (rectangle) */
export function checkOutOfBounds(
  gridX: number,
  gridZ: number,
  gridWidth: number,
  gridDepth: number,
  rotation: number,
  bounds: { minGridX: number; maxGridX: number; minGridZ: number; maxGridZ: number },
): boolean {
  const cells = getOccupiedCells(gridX, gridZ, gridWidth, gridDepth, rotation);
  for (const cell of cells) {
    if (
      cell.x < bounds.minGridX ||
      cell.x > bounds.maxGridX ||
      cell.z < bounds.minGridZ ||
      cell.z > bounds.maxGridZ
    ) {
      return true;
    }
  }
  return false;
}

/** Check if any cell of the module falls outside the allowed cell set (arbitrary shape) */
export function checkOutOfBoundsCells(
  gridX: number,
  gridZ: number,
  gridWidth: number,
  gridDepth: number,
  rotation: number,
  allowedCells: Set<string>,
): boolean {
  const cells = getOccupiedCells(gridX, gridZ, gridWidth, gridDepth, rotation);
  return cells.some(c => !allowedCells.has(`${c.x}:${c.z}`));
}

/** Check if placing a module at the given position causes any collision */
export function checkCollision(
  occupancyMap: OccupancyMap,
  gridX: number,
  gridZ: number,
  floor: number,
  gridWidth: number,
  gridDepth: number,
  rotation: number,
  excludePlacementId?: string,
): { hasCollision: boolean; conflictingIds: string[] } {
  const cells = getOccupiedCells(gridX, gridZ, gridWidth, gridDepth, rotation);
  const conflictingIds = new Set<string>();

  for (const cell of cells) {
    const key = cellKey(floor, cell.x, cell.z);
    const occupant = occupancyMap.get(key);
    if (occupant && occupant !== excludePlacementId) {
      conflictingIds.add(occupant);
    }
  }

  return {
    hasCollision: conflictingIds.size > 0,
    conflictingIds: Array.from(conflictingIds),
  };
}
