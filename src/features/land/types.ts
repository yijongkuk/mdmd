export type {
  ZoneType,
  GeoJsonPolygon,
  LandParcel,
  ParcelInfo,
  MapBounds,
} from '@/types/land';

export {
  ZONE_TYPES,
  ZONE_TYPE_LABELS,
  ZONE_TYPE_COLORS,
} from '@/types/land';

/** Parcel with hover/select UI state */
export interface ParcelUIState {
  hoveredPnu: string | null;
  selectedPnu: string | null;
}
