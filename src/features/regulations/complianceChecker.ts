import { RegulationResult } from './engine';

export type ComplianceLevel = 'OK' | 'WARNING' | 'VIOLATION';

export interface ComplianceStatus {
  overall: ComplianceLevel;
  coverageRatio: { current: number; max: number; level: ComplianceLevel };
  floorAreaRatio: { current: number; max: number; level: ComplianceLevel };
  height: { current: number; max: number; level: ComplianceLevel };
  floors: { current: number; max: number; level: ComplianceLevel };
  boundary: { allWithin: boolean; level: ComplianceLevel };
  messages: string[];
}

export interface PlacementSummary {
  totalFootprintArea: number;
  totalFloorArea: number;
  maxHeight: number;
  maxFloor: number;
  allWithinBoundary: boolean;
  parcelArea: number;
}

const WARNING_THRESHOLD = 0.9;

function checkRatio(
  current: number,
  max: number,
  label: string,
  messages: string[],
): ComplianceLevel {
  if (max <= 0) return 'OK';

  const ratio = current / max;
  if (ratio > 1) {
    messages.push(`${label} 초과: 현재 ${current.toFixed(1)}% / 허용 ${max}%`);
    return 'VIOLATION';
  }
  if (ratio >= WARNING_THRESHOLD) {
    messages.push(`${label} 주의: 현재 ${current.toFixed(1)}% / 허용 ${max}% (${(ratio * 100).toFixed(0)}% 사용)`);
    return 'WARNING';
  }
  return 'OK';
}

function checkValue(
  current: number,
  max: number,
  label: string,
  unit: string,
  messages: string[],
): ComplianceLevel {
  if (max <= 0) return 'OK';

  if (current > max) {
    messages.push(`${label} 초과: 현재 ${current}${unit} / 허용 ${max}${unit}`);
    return 'VIOLATION';
  }
  if (current >= max * WARNING_THRESHOLD) {
    messages.push(`${label} 주의: 현재 ${current}${unit} / 허용 ${max}${unit}`);
    return 'WARNING';
  }
  return 'OK';
}

function worstLevel(levels: ComplianceLevel[]): ComplianceLevel {
  if (levels.includes('VIOLATION')) return 'VIOLATION';
  if (levels.includes('WARNING')) return 'WARNING';
  return 'OK';
}

export function checkCompliance(
  summary: PlacementSummary,
  regulation: RegulationResult,
): ComplianceStatus {
  const reg = regulation.zoneRegulation;
  const messages: string[] = [];

  // Coverage ratio check
  const currentCoverage =
    summary.parcelArea > 0
      ? (summary.totalFootprintArea / summary.parcelArea) * 100
      : 0;
  const coverageLevel = checkRatio(
    currentCoverage,
    reg.maxCoverageRatio,
    '건폐율',
    messages,
  );

  // Floor area ratio check
  const currentFAR =
    summary.parcelArea > 0
      ? (summary.totalFloorArea / summary.parcelArea) * 100
      : 0;
  const farLevel = checkRatio(
    currentFAR,
    reg.maxFloorAreaRatio,
    '용적률',
    messages,
  );

  // Height check
  const heightLevel = checkValue(
    summary.maxHeight,
    reg.maxHeight,
    '높이',
    'm',
    messages,
  );

  // Floor count check
  const floorLevel = checkValue(
    summary.maxFloor,
    regulation.effectiveMaxFloors,
    '층수',
    '층',
    messages,
  );

  // Boundary check
  let boundaryLevel: ComplianceLevel = 'OK';
  if (!summary.allWithinBoundary) {
    boundaryLevel = 'VIOLATION';
    messages.push('건축한계선 위반: 일부 모듈이 건축 가능 영역을 벗어났습니다');
  }

  const overall = worstLevel([
    coverageLevel,
    farLevel,
    heightLevel,
    floorLevel,
    boundaryLevel,
  ]);

  return {
    overall,
    coverageRatio: { current: currentCoverage, max: reg.maxCoverageRatio, level: coverageLevel },
    floorAreaRatio: { current: currentFAR, max: reg.maxFloorAreaRatio, level: farLevel },
    height: { current: summary.maxHeight, max: reg.maxHeight, level: heightLevel },
    floors: { current: summary.maxFloor, max: regulation.effectiveMaxFloors, level: floorLevel },
    boundary: { allWithin: summary.allWithinBoundary, level: boundaryLevel },
    messages,
  };
}
