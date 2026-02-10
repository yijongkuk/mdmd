import { ZoneType, ZONE_REGULATIONS, ZoneRegulation } from './lookupTable';

export interface ParcelInput {
  area: number;
  zoneType: ZoneType;
  width?: number;
  depth?: number;
}

export interface RegulationResult {
  zoneRegulation: ZoneRegulation;
  buildableArea: number;
  maxTotalFloorArea: number;
  maxBuildingFootprint: number;
  effectiveMaxFloors: number;
}

const FLOOR_HEIGHT_M = 3.0;

export function calculateRegulations(parcel: ParcelInput): RegulationResult {
  const reg = ZONE_REGULATIONS[parcel.zoneType];

  // Estimate parcel dimensions if not provided
  const side = Math.sqrt(parcel.area);
  const width = parcel.width ?? side;
  const depth = parcel.depth ?? side;

  // Calculate buildable area after setback deductions
  const innerWidth = Math.max(0, width - reg.setbackLeft - reg.setbackRight);
  const innerDepth = Math.max(0, depth - reg.setbackFront - reg.setbackRear);
  const buildableArea = innerWidth * innerDepth;

  // Coverage-based footprint limit
  const maxBuildingFootprint = (parcel.area * reg.maxCoverageRatio) / 100;

  // Total floor area limit
  const maxTotalFloorArea = (parcel.area * reg.maxFloorAreaRatio) / 100;

  // Effective max floors: consider both floor limit and height limit
  let effectiveMaxFloors: number;
  const floorsByHeight =
    reg.maxHeight > 0 ? Math.floor(reg.maxHeight / FLOOR_HEIGHT_M) : Infinity;
  const floorsByLimit = reg.maxFloors > 0 ? reg.maxFloors : Infinity;

  if (floorsByHeight === Infinity && floorsByLimit === Infinity) {
    // No limit on either
    effectiveMaxFloors = 0;
  } else {
    effectiveMaxFloors = Math.min(floorsByHeight, floorsByLimit);
  }

  return {
    zoneRegulation: reg,
    buildableArea,
    maxTotalFloorArea,
    maxBuildingFootprint,
    effectiveMaxFloors,
  };
}
