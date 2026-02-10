import { ZoneType } from './land';

export interface BuildingRegulation {
  maxCoverageRatio: number;
  maxFloorAreaRatio: number;
  maxHeight: number;
  maxFloors: number;
  setbackFront: number;
  setbackRear: number;
  setbackLeft: number;
  setbackRight: number;
  buildableArea: number;
  maxTotalFloorArea: number;
}

export interface RegulationResult {
  zoneType: ZoneType;
  zoneNameKo: string;
  maxCoverageRatio: number;
  maxFloorAreaRatio: number;
  maxHeight: number;
  maxFloors: number;
  setbackFront: number;
  setbackRear: number;
  setbackLeft: number;
  setbackRight: number;
  buildableArea: number;
  maxBuildingFootprint: number;
  maxTotalFloorArea: number;
  effectiveMaxFloors: number;
}

export type ComplianceLevel = 'OK' | 'WARNING' | 'VIOLATION';

export interface ComplianceMetric {
  current: number;
  max: number;
  level: ComplianceLevel;
  percentage: number;
}

export interface ComplianceStatus {
  overall: ComplianceLevel;
  coverageRatio: ComplianceMetric;
  floorAreaRatio: ComplianceMetric;
  height: ComplianceMetric;
  floors: ComplianceMetric;
  boundary: { allWithin: boolean; level: ComplianceLevel };
  messages: string[];
}
