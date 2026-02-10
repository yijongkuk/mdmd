/**
 * Shared regulation constants re-exported from the regulations feature module.
 * Import from here when you need zone data outside of the regulations feature.
 */
export {
  ZONE_REGULATIONS,
  type ZoneType,
  type ZoneRegulation,
} from '@/features/regulations/lookupTable';

/** Default assumed floor-to-floor height in meters */
export const DEFAULT_FLOOR_HEIGHT_M = 3.0;

/** Compliance warning threshold (fraction of limit) */
export const COMPLIANCE_WARNING_THRESHOLD = 0.9;
