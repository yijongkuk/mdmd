import { ModulePlacement, ModuleDefinition } from '@/types/builder';
import { Material } from '@/types/material';
import { getModuleById } from '@/lib/constants/modules';
import { getMaterialById } from '@/lib/constants/materials';
import { GRID_SIZE } from '@/lib/constants/grid';

export interface ModuleCost {
  placementId: string;
  moduleName: string;
  moduleNameKo: string;
  category: string;
  floor: number;
  basePrice: number;
  materialMultiplier: number;
  finalPrice: number;
}

export interface CostBreakdown {
  items: ModuleCost[];
  byCategory: {
    category: string;
    categoryKo: string;
    count: number;
    totalCost: number;
  }[];
  byFloor: {
    floor: number;
    count: number;
    totalCost: number;
  }[];
  totalModules: number;
  totalArea: number;
  totalCost: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  STRUCTURAL: '구조 모듈',
  FUNCTIONAL: '기능 모듈',
  DESIGN: '디자인 모듈',
};

/** Calculate cost for a single module placement */
export function calculateModuleCost(
  placement: ModulePlacement,
  moduleDef: ModuleDefinition,
  material?: Material
): number {
  const multiplier = material?.priceMultiplier ?? 1.0;
  return Math.round(moduleDef.basePrice * multiplier);
}

/** Calculate total cost breakdown for all placements */
export function calculateCostBreakdown(placements: ModulePlacement[]): CostBreakdown {
  const items: ModuleCost[] = [];
  const categoryMap = new Map<string, { count: number; totalCost: number }>();
  const floorMap = new Map<number, { count: number; totalCost: number }>();
  let totalArea = 0;

  for (const placement of placements) {
    const moduleDef = getModuleById(placement.moduleId);
    if (!moduleDef) continue;

    const material = placement.materialId
      ? getMaterialById(placement.materialId)
      : undefined;

    const finalPrice = calculateModuleCost(placement, moduleDef, material);

    items.push({
      placementId: placement.id,
      moduleName: moduleDef.name,
      moduleNameKo: moduleDef.nameKo,
      category: moduleDef.category,
      floor: placement.floor,
      basePrice: moduleDef.basePrice,
      materialMultiplier: material?.priceMultiplier ?? 1.0,
      finalPrice,
    });

    // Accumulate by category
    const catEntry = categoryMap.get(moduleDef.category) ?? { count: 0, totalCost: 0 };
    catEntry.count += 1;
    catEntry.totalCost += finalPrice;
    categoryMap.set(moduleDef.category, catEntry);

    // Accumulate by floor
    const floorEntry = floorMap.get(placement.floor) ?? { count: 0, totalCost: 0 };
    floorEntry.count += 1;
    floorEntry.totalCost += finalPrice;
    floorMap.set(placement.floor, floorEntry);

    // Calculate module footprint area
    totalArea += moduleDef.width * moduleDef.depth;
  }

  const byCategory = Array.from(categoryMap.entries()).map(([category, data]) => ({
    category,
    categoryKo: CATEGORY_LABELS[category] ?? category,
    ...data,
  }));

  const byFloor = Array.from(floorMap.entries())
    .map(([floor, data]) => ({ floor, ...data }))
    .sort((a, b) => a.floor - b.floor);

  const totalCost = items.reduce((sum, item) => sum + item.finalPrice, 0);

  return {
    items,
    byCategory,
    byFloor,
    totalModules: items.length,
    totalArea,
    totalCost,
  };
}

/** Calculate ground floor coverage area (for 건폐율 check) */
export function calculateGroundCoverage(placements: ModulePlacement[]): number {
  const groundPlacements = placements.filter((p) => p.floor === 1);
  const coveredCells = new Set<string>();

  for (const placement of groundPlacements) {
    const moduleDef = getModuleById(placement.moduleId);
    if (!moduleDef) continue;

    const { gridWidth, gridDepth } = moduleDef;
    const rotation = placement.rotation;

    const effectiveWidth = rotation === 90 || rotation === 270 ? gridDepth : gridWidth;
    const effectiveDepth = rotation === 90 || rotation === 270 ? gridWidth : gridDepth;

    for (let dx = 0; dx < effectiveWidth; dx++) {
      for (let dz = 0; dz < effectiveDepth; dz++) {
        coveredCells.add(`${placement.gridX + dx}:${placement.gridZ + dz}`);
      }
    }
  }

  return coveredCells.size * GRID_SIZE * GRID_SIZE;
}

/** Calculate total floor area across all floors */
export function calculateTotalFloorArea(placements: ModulePlacement[]): number {
  let totalArea = 0;
  for (const placement of placements) {
    const moduleDef = getModuleById(placement.moduleId);
    if (!moduleDef) continue;
    totalArea += moduleDef.width * moduleDef.depth;
  }
  return totalArea;
}

/** Get the maximum building height from placements */
export function calculateMaxHeight(placements: ModulePlacement[]): number {
  if (placements.length === 0) return 0;

  let maxHeight = 0;
  for (const placement of placements) {
    const moduleDef = getModuleById(placement.moduleId);
    if (!moduleDef) continue;
    const topOfModule = (placement.floor - 1) * 3.0 + moduleDef.height;
    maxHeight = Math.max(maxHeight, topOfModule);
  }
  return maxHeight;
}

/** Get the highest floor number used */
export function getMaxFloor(placements: ModulePlacement[]): number {
  if (placements.length === 0) return 0;
  return Math.max(...placements.map((p) => p.floor));
}
