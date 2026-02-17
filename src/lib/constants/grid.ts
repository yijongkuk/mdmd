/** Grid cell size in meters (Korean modular standard 3M/6M system) */
export const GRID_SIZE = 0.6;

/** Maximum number of building floors */
export const MAX_FLOORS = 5;

/** Standard floor height in meters */
export const FLOOR_HEIGHT = 3.0;

/** Grid line color */
export const GRID_COLOR = '#e2e8f0';

/** Grid line color for major lines (every 6th = 3.6m) */
export const GRID_MAJOR_COLOR = '#94a3b8';

/** Default grid extent in cells (100 cells = 60m) */
export const DEFAULT_GRID_EXTENT = 100;

/** Snap threshold in world units (meters) */
export const SNAP_THRESHOLD = GRID_SIZE / 2;

/** Rotation step in degrees (45° → 8 steps per full rotation) */
export const ROTATION_STEP = 45;

/** Parcel boundary color (orange) */
export const PARCEL_BOUNDARY_COLOR = '#f97316';

/** Parcel fill opacity */
export const PARCEL_FILL_OPACITY = 0.06;

/** Parcel boundary dash size */
export const PARCEL_DASH_SIZE = 0.4;

/** Parcel boundary gap size */
export const PARCEL_GAP_SIZE = 0.2;

/** Floor label helper — works for any floor number */
export function getFloorLabel(floor: number): string {
  return `${floor}층`;
}

/** Floor labels (legacy, kept for existing references) */
export const FLOOR_LABELS: Record<number, string> = new Proxy(
  {} as Record<number, string>,
  { get: (_target, prop) => `${String(prop)}층` },
);
