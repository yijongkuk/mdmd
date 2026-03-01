export const ZONE_TYPES = [
  'ZONE_R1_EXCLUSIVE',
  'ZONE_R2_EXCLUSIVE',
  'ZONE_R1_GENERAL',
  'ZONE_R2_GENERAL',
  'ZONE_R3_GENERAL',
  'ZONE_R_SEMI',
  'ZONE_C_CENTRAL',
  'ZONE_C_GENERAL',
  'ZONE_C_NEIGHBORHOOD',
  'ZONE_C_DISTRIBUTION',
  'ZONE_I_EXCLUSIVE',
  'ZONE_I_GENERAL',
  'ZONE_I_SEMI',
  'ZONE_G_CONSERVATION',
  'ZONE_G_PRODUCTION',
  'ZONE_G_NATURAL',
  'ZONE_M_CONSERVATION',
  'ZONE_M_PRODUCTION',
  'ZONE_M_PLANNED',
  'ZONE_AGRICULTURE',
] as const;

export type ZoneType = (typeof ZONE_TYPES)[number];

export const ZONE_TYPE_LABELS: Record<ZoneType, string> = {
  ZONE_R1_EXCLUSIVE: '제1종전용주거지역',
  ZONE_R2_EXCLUSIVE: '제2종전용주거지역',
  ZONE_R1_GENERAL: '제1종일반주거지역',
  ZONE_R2_GENERAL: '제2종일반주거지역',
  ZONE_R3_GENERAL: '제3종일반주거지역',
  ZONE_R_SEMI: '준주거지역',
  ZONE_C_CENTRAL: '중심상업지역',
  ZONE_C_GENERAL: '일반상업지역',
  ZONE_C_NEIGHBORHOOD: '근린상업지역',
  ZONE_C_DISTRIBUTION: '유통상업지역',
  ZONE_I_EXCLUSIVE: '전용공업지역',
  ZONE_I_GENERAL: '일반공업지역',
  ZONE_I_SEMI: '준공업지역',
  ZONE_G_CONSERVATION: '보전녹지지역',
  ZONE_G_PRODUCTION: '생산녹지지역',
  ZONE_G_NATURAL: '자연녹지지역',
  ZONE_M_CONSERVATION: '보전관리지역',
  ZONE_M_PRODUCTION: '생산관리지역',
  ZONE_M_PLANNED: '계획관리지역',
  ZONE_AGRICULTURE: '농림지역',
};

export const ZONE_TYPE_COLORS: Record<ZoneType, string> = {
  ZONE_R1_EXCLUSIVE: '#FFE0B2',
  ZONE_R2_EXCLUSIVE: '#FFCC80',
  ZONE_R1_GENERAL: '#FFB74D',
  ZONE_R2_GENERAL: '#FFA726',
  ZONE_R3_GENERAL: '#FF9800',
  ZONE_R_SEMI: '#FB8C00',
  ZONE_C_CENTRAL: '#EF5350',
  ZONE_C_GENERAL: '#E53935',
  ZONE_C_NEIGHBORHOOD: '#F06292',
  ZONE_C_DISTRIBUTION: '#EC407A',
  ZONE_I_EXCLUSIVE: '#7E57C2',
  ZONE_I_GENERAL: '#5C6BC0',
  ZONE_I_SEMI: '#42A5F5',
  ZONE_G_CONSERVATION: '#2E7D32',
  ZONE_G_PRODUCTION: '#43A047',
  ZONE_G_NATURAL: '#66BB6A',
  ZONE_M_CONSERVATION: '#00695C',
  ZONE_M_PRODUCTION: '#00897B',
  ZONE_M_PLANNED: '#26A69A',
  ZONE_AGRICULTURE: '#8D6E63',
};

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface LandParcel {
  id: string;
  pnu: string;
  address: string;
  addressDetail?: string;
  area: number;
  zoneType?: ZoneType;
  officialPrice?: number;
  geometryJson: GeoJsonPolygon;
  centroidLat: number;
  centroidLng: number;
  dataSource?: 'seed' | 'vworld';
}

export interface ParcelInfo extends LandParcel {
  regulation?: {
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
  };
}

export interface MapBounds {
  sw: { lat: number; lng: number };
  ne: { lat: number; lng: number };
}

export interface SurroundingBuilding {
  id: string;
  geometry: GeoJsonPolygon;
  floors?: number;
  height?: number;
  address?: string;
}

export interface SurroundingRoad {
  id: string;
  geometry: {
    type: 'LineString' | 'MultiLineString';
    coordinates: number[][] | number[][][];
  };
  width?: number;
  name?: string;
}

export interface SurroundingContext {
  buildings: SurroundingBuilding[];
  roads: SurroundingRoad[];
}
