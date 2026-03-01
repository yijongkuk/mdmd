export type { ZoneType, ZoneRegulation } from './lookupTable';
export { ZONE_REGULATIONS } from './lookupTable';

export type { ParcelInput, RegulationResult } from './engine';
export { calculateRegulations } from './engine';

export type { Point2D, Polygon2D } from './buildableArea';
export {
  computeBuildablePolygon,
  calculatePolygonArea,
  isPointInPolygon,
  isRectInPolygon,
} from './buildableArea';

export type {
  ComplianceLevel,
  ComplianceStatus,
  PlacementSummary,
} from './complianceChecker';
export { checkCompliance } from './complianceChecker';

export { useRegulations, useComplianceCheck } from './hooks';
