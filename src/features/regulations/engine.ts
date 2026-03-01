import { ZoneType, ZONE_REGULATIONS, ZoneRegulation } from './lookupTable';
import { getMunicipalOverride } from './municipalityTable';

export interface ParcelInput {
  area: number;
  zoneType: ZoneType;
  width?: number;
  depth?: number;
  pnu?: string;
}

export interface RegulationResult {
  zoneRegulation: ZoneRegulation;
  buildableArea: number;
  maxTotalFloorArea: number;
  maxBuildingFootprint: number;
  effectiveMaxFloors: number;
  regulationSource: 'statutory' | 'municipal';
  municipalityName?: string;
}

const FLOOR_HEIGHT_M = 3.0;

export function calculateRegulations(parcel: ParcelInput): RegulationResult {
  const baseReg = ZONE_REGULATIONS[parcel.zoneType];

  // 지자체 조례 오버라이드 조회 (건폐율/용적률만)
  let reg = baseReg;
  let regulationSource: 'statutory' | 'municipal' = 'statutory';
  let municipalityName: string | undefined;

  if (parcel.pnu) {
    const municipal = getMunicipalOverride(parcel.pnu, parcel.zoneType);
    if (municipal) {
      reg = {
        ...baseReg,
        maxCoverageRatio: municipal.override.maxCoverageRatio,
        maxFloorAreaRatio: municipal.override.maxFloorAreaRatio,
      };
      regulationSource = 'municipal';
      municipalityName = municipal.municipalityName;
    }
  }

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
    regulationSource,
    municipalityName,
  };
}
