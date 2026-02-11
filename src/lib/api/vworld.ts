import { getCached, setCache, TTL, boundsKey } from './cache';
import type { LandParcel, ZoneType, MapBounds, GeoJsonPolygon, SurroundingBuilding, SurroundingRoad } from '@/types/land';
import { ZONE_TYPE_LABELS } from '@/types/land';

const VWORLD_API_KEY = process.env.VWORLD_API_KEY ?? '';
const DATA_URL = 'http://api.vworld.kr/req/data';
const ADDRESS_URL = 'http://api.vworld.kr/req/address';

/** V-World validates Referer header against registered domain */
const VWORLD_HEADERS = { Referer: 'http://localhost:3000' };

/**
 * 건축 가능 지목 코드 (jibun 필드 마지막 글자)
 * 대(대지), 잡(잡종지), 전(전), 답(답), 과(과수원), 목(목장용지), 광(광천지), 공(공장용지)
 */
/**
 * 대지 지목만 필터 — 서울 내 건축 가능 토지
 */
const BUILDABLE_JIMOK = new Set(['대']);

/** 모듈러 건축 적합 면적 범위 (m²) */
const MIN_AREA_M2 = 300;
const MAX_AREA_M2 = 1500;

/** 공시지가 상한 (원/m²) — 이 이하만 유휴 가능성 있는 토지로 표시 */
const MAX_OFFICIAL_PRICE = 5_000_000;

function extractJimok(jibun: string): string {
  if (!jibun) return '';
  return jibun.trim().slice(-1);
}

function koreanToZoneType(name: string): ZoneType | null {
  for (const [zoneType, label] of Object.entries(ZONE_TYPE_LABELS)) {
    if (name.includes(label) || label.includes(name)) {
      return zoneType as ZoneType;
    }
  }
  return null;
}

function computeCentroid(coordinates: number[][][]): { lat: number; lng: number } {
  const ring = coordinates[0];
  let sumLat = 0;
  let sumLng = 0;
  for (const [lng, lat] of ring) {
    sumLat += lat;
    sumLng += lng;
  }
  return {
    lat: sumLat / ring.length,
    lng: sumLng / ring.length,
  };
}

/** Ray-casting point-in-polygon test (GeoJSON [lng,lat] 좌표 기준) */
function pointInPolygon(testLng: number, testLat: number, coordinates: number[][][]): boolean {
  const ring = coordinates[0];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > testLat) !== (yj > testLat) &&
        testLng < (xj - xi) * (testLat - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}


/** Approximate polygon area in m² using Shoelace formula with lat/lng → meter conversion */
function computeAreaM2(coordinates: number[][][]): number {
  const ring = coordinates[0];
  if (ring.length < 4) return 0;
  const centLat = ring.reduce((s, [, lat]) => s + lat, 0) / ring.length;
  const mPerDegLat = 110574;
  const mPerDegLng = 111320 * Math.cos((centLat * Math.PI) / 180);
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const x1 = ring[i][0] * mPerDegLng;
    const y1 = ring[i][1] * mPerDegLat;
    const x2 = ring[i + 1][0] * mPerDegLng;
    const y2 = ring[i + 1][1] * mPerDegLat;
    area += x1 * y2 - x2 * y1;
  }
  return Math.round(Math.abs(area) / 2);
}

function normalizeGeometry(geometry: {
  type: string;
  coordinates: number[][][] | number[][][][];
}): GeoJsonPolygon {
  if (geometry.type === 'MultiPolygon') {
    const coords = geometry.coordinates as number[][][][];
    return { type: 'Polygon', coordinates: coords[0] };
  }
  return { type: 'Polygon', coordinates: geometry.coordinates as number[][][] };
}

export async function getCadastralParcels(
  bounds: MapBounds,
  page = 1,
  size = 50,
): Promise<Partial<LandParcel>[]> {
  const cacheKey = `parcels:${boundsKey(bounds.sw.lat, bounds.sw.lng, bounds.ne.lat, bounds.ne.lng)}:${page}:${size}`;
  const cached = getCached<Partial<LandParcel>[]>(cacheKey);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({
      service: 'data',
      request: 'GetFeature',
      data: 'LP_PA_CBND_BUBUN',
      key: VWORLD_API_KEY,
      geomFilter: `BOX(${bounds.sw.lng},${bounds.sw.lat},${bounds.ne.lng},${bounds.ne.lat})`,
      crs: 'EPSG:4326',
      page: String(page),
      size: String(size),
      format: 'json',
      geometry: 'true',
      attribute: 'true',
    });

    const res = await fetch(`${DATA_URL}?${params.toString()}`, { headers: VWORLD_HEADERS });
    if (!res.ok) return [];

    const json = await res.json();
    if (json?.response?.status !== 'OK') return [];
    const features = json?.response?.result?.featureCollection?.features;
    if (!Array.isArray(features)) return [];

    const parcels: Partial<LandParcel>[] = features
      .filter(
        (f: { properties: Record<string, string> }) =>
          BUILDABLE_JIMOK.has(extractJimok(f.properties.jibun ?? '')),
      )
      .map(
        (f: { properties: Record<string, string>; geometry: { type: string; coordinates: number[][][] | number[][][][] } }) => {
          const props = f.properties;
          const polygon = normalizeGeometry(f.geometry);
          const centroid = computeCentroid(polygon.coordinates);

          return {
            id: props.pnu,
            pnu: props.pnu,
            address: props.addr,
            area: computeAreaM2(polygon.coordinates),
            officialPrice: parseInt(props.jiga, 10) || undefined,
            geometryJson: polygon,
            centroidLat: centroid.lat,
            centroidLng: centroid.lng,
            dataSource: 'vworld' as const,
          };
        },
      )
      .filter((p) => {
        const area = p.area ?? 0;
        const price = p.officialPrice ?? 0;
        return (
          area >= MIN_AREA_M2 &&
          area <= MAX_AREA_M2 &&
          (price === 0 || price <= MAX_OFFICIAL_PRICE)
        );
      });

    setCache(cacheKey, parcels, TTL.PARCEL_LIST);
    return parcels;
  } catch (err) {
    console.error('V-World getCadastralParcels error:', err);
    return [];
  }
}

/** V-World PNU 조회 (단일 PNU) */
async function fetchParcelByPnu(pnu: string): Promise<Partial<LandParcel> | null> {
  const params = new URLSearchParams({
    service: 'data',
    request: 'GetFeature',
    data: 'LP_PA_CBND_BUBUN',
    key: VWORLD_API_KEY,
    attrFilter: `pnu:=:${pnu}`,
    crs: 'EPSG:4326',
    format: 'json',
    geometry: 'true',
    attribute: 'true',
  });

  const res = await fetch(`${DATA_URL}?${params.toString()}`, { headers: VWORLD_HEADERS });
  if (!res.ok) return null;

  const json = await res.json();
  if (json?.response?.status !== 'OK') return null;
  const features = json?.response?.result?.featureCollection?.features;
  if (!Array.isArray(features) || features.length === 0) return null;

  const f = features[0];
  const props = f.properties;
  const polygon = normalizeGeometry(f.geometry);
  const centroid = computeCentroid(polygon.coordinates);

  return {
    id: props.pnu,
    pnu: props.pnu,
    address: props.addr,
    area: computeAreaM2(polygon.coordinates),
    officialPrice: parseInt(props.jiga, 10) || undefined,
    geometryJson: polygon,
    centroidLat: centroid.lat,
    centroidLng: centroid.lng,
    dataSource: 'vworld' as const,
  };
}

export async function getParcelByPnu(pnu: string): Promise<Partial<LandParcel> | null> {
  const cacheKey = `parcel:pnu:${pnu}`;
  const cached = getCached<Partial<LandParcel>>(cacheKey);
  if (cached) return cached;

  try {
    // 1차: 그대로 조회
    let parcel = await fetchParcelByPnu(pnu);

    // 2차: 산구분 변환 fallback (OnBid 0/1 → V-World 1/2 변환이 안 된 경우 대비)
    if (!parcel && pnu.length === 19) {
      const mountain = pnu[10];
      if (mountain === '0') {
        parcel = await fetchParcelByPnu(pnu.slice(0, 10) + '1' + pnu.slice(11));
      } else if (mountain === '1') {
        parcel = await fetchParcelByPnu(pnu.slice(0, 10) + '2' + pnu.slice(11));
      }
    }

    if (parcel) {
      setCache(cacheKey, parcel, TTL.PNU_QUERY);
    }
    return parcel;
  } catch (err) {
    console.error('V-World getParcelByPnu error:', err);
    return null;
  }
}

/**
 * 좌표 기반 필지 조회 — 주어진 lat/lng 주변의 필지 정보 반환
 * getCadastralParcels와 달리 지목/면적/공시지가 필터 없이 raw 데이터 반환
 */
export async function getParcelByCoords(
  lat: number,
  lng: number,
): Promise<Partial<LandParcel> | null> {
  const cacheKey = `parcel:coords:${lat.toFixed(6)},${lng.toFixed(6)}`;
  const cached = getCached<Partial<LandParcel>>(cacheKey);
  if (cached) return cached;

  try {
    const d = 0.0003; // ~33m buffer
    const params = new URLSearchParams({
      service: 'data',
      request: 'GetFeature',
      data: 'LP_PA_CBND_BUBUN',
      key: VWORLD_API_KEY,
      geomFilter: `BOX(${lng - d},${lat - d},${lng + d},${lat + d})`,
      crs: 'EPSG:4326',
      page: '1',
      size: '5',
      format: 'json',
      geometry: 'true',
      attribute: 'true',
    });

    const res = await fetch(`${DATA_URL}?${params.toString()}`, { headers: VWORLD_HEADERS });
    if (!res.ok) return null;

    const json = await res.json();
    if (json?.response?.status !== 'OK') return null;
    const features = json?.response?.result?.featureCollection?.features;
    if (!Array.isArray(features) || features.length === 0) return null;

    // 1차: 좌표가 실제로 포함된 폴리곤 선택 (point-in-polygon)
    let bestFeature = null;
    for (const f of features) {
      const poly = normalizeGeometry(f.geometry);
      if (pointInPolygon(lng, lat, poly.coordinates)) {
        bestFeature = f;
        break;
      }
    }
    // 2차 fallback: centroid 거리 기준 최근접 필지
    if (!bestFeature) {
      let bestDist = Infinity;
      for (const f of features) {
        const poly = normalizeGeometry(f.geometry);
        const c = computeCentroid(poly.coordinates);
        const dist = (c.lat - lat) ** 2 + (c.lng - lng) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          bestFeature = f;
        }
      }
    }
    if (!bestFeature) bestFeature = features[0];

    const props = bestFeature.properties;
    const polygon = normalizeGeometry(bestFeature.geometry);
    const centroid = computeCentroid(polygon.coordinates);

    const parcel: Partial<LandParcel> = {
      id: props.pnu,
      pnu: props.pnu,
      address: props.addr,
      area: computeAreaM2(polygon.coordinates),
      officialPrice: parseInt(props.jiga, 10) || undefined,
      geometryJson: polygon,
      centroidLat: centroid.lat,
      centroidLng: centroid.lng,
      dataSource: 'vworld' as const,
    };

    setCache(cacheKey, parcel, TTL.PNU_QUERY);
    return parcel;
  } catch (err) {
    console.error('V-World getParcelByCoords error:', err);
    return null;
  }
}

export async function getLandUseZone(lat: number, lng: number): Promise<ZoneType | null> {
  const cacheKey = `zone:${lat.toFixed(6)},${lng.toFixed(6)}`;
  const cached = getCached<ZoneType>(cacheKey);
  if (cached) return cached;

  try {
    const d = 0.0005; // ~50m buffer around point
    const params = new URLSearchParams({
      service: 'data',
      request: 'GetFeature',
      data: 'LT_C_UQ111',
      key: VWORLD_API_KEY,
      geomFilter: `BOX(${lng - d},${lat - d},${lng + d},${lat + d})`,
      crs: 'EPSG:4326',
      page: '1',
      size: '5',
      format: 'json',
      attribute: 'true',
    });

    const res = await fetch(`${DATA_URL}?${params.toString()}`, { headers: VWORLD_HEADERS });
    if (!res.ok) return null;

    const json = await res.json();
    if (json?.response?.status !== 'OK') return null;
    const features = json?.response?.result?.featureCollection?.features;
    if (!Array.isArray(features) || features.length === 0) return null;

    // Find the first non-"미분류" zone
    const zoneName: string =
      features.find((f: { properties: Record<string, string> }) => f.properties.uname !== '미분류')?.properties.uname
      ?? features[0].properties.uname ?? '';
    const zoneType = koreanToZoneType(zoneName);

    if (zoneType) {
      setCache(cacheKey, zoneType, TTL.PNU_QUERY);
    }
    return zoneType;
  } catch (err) {
    console.error('V-World getLandUseZone error:', err);
    return null;
  }
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const cacheKey = `geocode:${address}`;
  const cached = getCached<{ lat: number; lng: number }>(cacheKey);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({
      service: 'address',
      request: 'getcoord',
      key: VWORLD_API_KEY,
      type: 'PARCEL',
      address,
      format: 'json',
    });

    const res = await fetch(`${ADDRESS_URL}?${params.toString()}`, { headers: VWORLD_HEADERS });
    if (!res.ok) return null;

    const json = await res.json();
    const result = json?.response?.result;
    if (!result?.point) return null;

    const coords = {
      lat: parseFloat(result.point.y),
      lng: parseFloat(result.point.x),
    };

    if (Number.isNaN(coords.lat) || Number.isNaN(coords.lng)) return null;

    setCache(cacheKey, coords, TTL.GEOCODE);
    return coords;
  } catch (err) {
    console.error('V-World geocodeAddress error:', err);
    return null;
  }
}

/**
 * 주변 건물 footprint 조회 — centroid 기준 반경 내 건물 경계
 * 데이터셋: LT_C_SPBD (건축물 통합 정보)
 * 속성: gro_flo_co(지상층수), buld_nm(건물명), bd_mgt_sn(건물관리번호)
 */
export async function getSurroundingBuildings(
  centroidLat: number,
  centroidLng: number,
  radiusM = 200,
): Promise<SurroundingBuilding[]> {
  const cacheKey = `surrounding:buildings:${centroidLat.toFixed(5)},${centroidLng.toFixed(5)},${radiusM}`;
  const cached = getCached<SurroundingBuilding[]>(cacheKey);
  if (cached) return cached;

  // Convert radius to approximate degree offset
  const dLat = radiusM / 110540;
  const dLng = radiusM / (111320 * Math.cos(centroidLat * Math.PI / 180));

  try {
    const params = new URLSearchParams({
      service: 'data',
      request: 'GetFeature',
      data: 'LT_C_SPBD',
      key: VWORLD_API_KEY,
      geomFilter: `BOX(${centroidLng - dLng},${centroidLat - dLat},${centroidLng + dLng},${centroidLat + dLat})`,
      crs: 'EPSG:4326',
      page: '1',
      size: '100',
      format: 'json',
      geometry: 'true',
      attribute: 'true',
    });

    const res = await fetch(`${DATA_URL}?${params.toString()}`, { headers: VWORLD_HEADERS });
    if (!res.ok) return [];

    const json = await res.json();
    if (json?.response?.status !== 'OK') return [];
    const features = json?.response?.result?.featureCollection?.features;
    if (!Array.isArray(features)) return [];

    const buildings: SurroundingBuilding[] = features.map(
      (f: { id?: string; properties: Record<string, string>; geometry: { type: string; coordinates: number[][][] | number[][][][] } }, i: number) => {
        const props = f.properties;
        const polygon = normalizeGeometry(f.geometry);
        const rawFloors = parseInt(props.gro_flo_co || '', 10);
        const floors = rawFloors > 0 ? rawFloors : undefined;
        return {
          id: f.id || props.bd_mgt_sn || `building-${i}`,
          geometry: polygon,
          floors,
          height: undefined,
          address: props.buld_nm || undefined,
        };
      },
    );

    setCache(cacheKey, buildings, TTL.SURROUNDING);
    return buildings;
  } catch (err) {
    console.error('V-World getSurroundingBuildings error:', err);
    return [];
  }
}

/**
 * 주변 도로 중심선 조회 — centroid 기준 반경 내 도로
 * 데이터셋: LT_L_SPRD (도로 중심선)
 * 속성: rn(도로명)
 */
export async function getSurroundingRoads(
  centroidLat: number,
  centroidLng: number,
  radiusM = 200,
): Promise<SurroundingRoad[]> {
  const cacheKey = `surrounding:roads:${centroidLat.toFixed(5)},${centroidLng.toFixed(5)},${radiusM}`;
  const cached = getCached<SurroundingRoad[]>(cacheKey);
  if (cached) return cached;

  const dLat = radiusM / 110540;
  const dLng = radiusM / (111320 * Math.cos(centroidLat * Math.PI / 180));

  try {
    const params = new URLSearchParams({
      service: 'data',
      request: 'GetFeature',
      data: 'LT_L_SPRD',
      key: VWORLD_API_KEY,
      geomFilter: `BOX(${centroidLng - dLng},${centroidLat - dLat},${centroidLng + dLng},${centroidLat + dLat})`,
      crs: 'EPSG:4326',
      page: '1',
      size: '100',
      format: 'json',
      geometry: 'true',
      attribute: 'true',
    });

    const res = await fetch(`${DATA_URL}?${params.toString()}`, { headers: VWORLD_HEADERS });
    if (!res.ok) return [];

    const json = await res.json();
    if (json?.response?.status !== 'OK') return [];
    const features = json?.response?.result?.featureCollection?.features;
    if (!Array.isArray(features)) return [];

    const roads: SurroundingRoad[] = features.map(
      (f: { id?: string; properties: Record<string, string>; geometry: { type: string; coordinates: number[][] | number[][][] } }, i: number) => {
        const props = f.properties;
        return {
          id: f.id || `road-${i}`,
          geometry: f.geometry as SurroundingRoad['geometry'],
          width: undefined,
          name: props.rn || undefined,
        };
      },
    );

    setCache(cacheKey, roads, TTL.SURROUNDING);
    return roads;
  } catch (err) {
    console.error('V-World getSurroundingRoads error:', err);
    return [];
  }
}
