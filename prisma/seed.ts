import { PrismaClient, ZoneType, ModuleCategory } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()

// ---------------------------------------------------------------------------
// Zone regulation lookup
// ---------------------------------------------------------------------------
interface ZoneRegulation {
  maxCoverageRatio: number
  maxFloorAreaRatio: number
  maxHeight: number
  maxFloors: number
  setbackFront: number
  setbackRear: number
  setbackLeft: number
  setbackRight: number
}

const ZONE_REGULATIONS: Record<ZoneType, ZoneRegulation> = {
  ZONE_R1_EXCLUSIVE: { maxCoverageRatio: 50, maxFloorAreaRatio: 100, maxHeight: 10, maxFloors: 2, setbackFront: 3, setbackRear: 2, setbackLeft: 1, setbackRight: 1 },
  ZONE_R2_EXCLUSIVE: { maxCoverageRatio: 50, maxFloorAreaRatio: 150, maxHeight: 12, maxFloors: 3, setbackFront: 3, setbackRear: 2, setbackLeft: 1, setbackRight: 1 },
  ZONE_R1_GENERAL: { maxCoverageRatio: 60, maxFloorAreaRatio: 200, maxHeight: 15, maxFloors: 4, setbackFront: 2, setbackRear: 1.5, setbackLeft: 0.5, setbackRight: 0.5 },
  ZONE_R2_GENERAL: { maxCoverageRatio: 60, maxFloorAreaRatio: 250, maxHeight: 21, maxFloors: 7, setbackFront: 2, setbackRear: 1.5, setbackLeft: 0.5, setbackRight: 0.5 },
  ZONE_R3_GENERAL: { maxCoverageRatio: 50, maxFloorAreaRatio: 300, maxHeight: 30, maxFloors: 10, setbackFront: 2, setbackRear: 1.5, setbackLeft: 0.5, setbackRight: 0.5 },
  ZONE_R_SEMI: { maxCoverageRatio: 70, maxFloorAreaRatio: 500, maxHeight: 45, maxFloors: 15, setbackFront: 2, setbackRear: 1, setbackLeft: 0.5, setbackRight: 0.5 },
  ZONE_C_CENTRAL: { maxCoverageRatio: 90, maxFloorAreaRatio: 1500, maxHeight: 0, maxFloors: 50, setbackFront: 0, setbackRear: 0, setbackLeft: 0, setbackRight: 0 },
  ZONE_C_GENERAL: { maxCoverageRatio: 80, maxFloorAreaRatio: 1300, maxHeight: 0, maxFloors: 40, setbackFront: 1, setbackRear: 0, setbackLeft: 0, setbackRight: 0 },
  ZONE_C_NEIGHBORHOOD: { maxCoverageRatio: 70, maxFloorAreaRatio: 900, maxHeight: 0, maxFloors: 25, setbackFront: 1, setbackRear: 0, setbackLeft: 0, setbackRight: 0 },
  ZONE_C_DISTRIBUTION: { maxCoverageRatio: 80, maxFloorAreaRatio: 1100, maxHeight: 0, maxFloors: 30, setbackFront: 1, setbackRear: 0, setbackLeft: 0, setbackRight: 0 },
  ZONE_I_EXCLUSIVE: { maxCoverageRatio: 70, maxFloorAreaRatio: 300, maxHeight: 0, maxFloors: 0, setbackFront: 3, setbackRear: 2, setbackLeft: 1, setbackRight: 1 },
  ZONE_I_GENERAL: { maxCoverageRatio: 70, maxFloorAreaRatio: 350, maxHeight: 0, maxFloors: 0, setbackFront: 2, setbackRear: 1.5, setbackLeft: 1, setbackRight: 1 },
  ZONE_I_SEMI: { maxCoverageRatio: 70, maxFloorAreaRatio: 400, maxHeight: 0, maxFloors: 0, setbackFront: 2, setbackRear: 1, setbackLeft: 0.5, setbackRight: 0.5 },
  ZONE_G_CONSERVATION: { maxCoverageRatio: 20, maxFloorAreaRatio: 80, maxHeight: 10, maxFloors: 2, setbackFront: 5, setbackRear: 3, setbackLeft: 2, setbackRight: 2 },
  ZONE_G_PRODUCTION: { maxCoverageRatio: 20, maxFloorAreaRatio: 100, maxHeight: 10, maxFloors: 2, setbackFront: 5, setbackRear: 3, setbackLeft: 2, setbackRight: 2 },
  ZONE_G_NATURAL: { maxCoverageRatio: 20, maxFloorAreaRatio: 100, maxHeight: 10, maxFloors: 3, setbackFront: 5, setbackRear: 3, setbackLeft: 2, setbackRight: 2 },
  ZONE_M_CONSERVATION: { maxCoverageRatio: 20, maxFloorAreaRatio: 80, maxHeight: 10, maxFloors: 2, setbackFront: 5, setbackRear: 3, setbackLeft: 2, setbackRight: 2 },
  ZONE_M_PRODUCTION: { maxCoverageRatio: 20, maxFloorAreaRatio: 100, maxHeight: 10, maxFloors: 2, setbackFront: 5, setbackRear: 3, setbackLeft: 2, setbackRight: 2 },
  ZONE_M_PLANNED: { maxCoverageRatio: 40, maxFloorAreaRatio: 100, maxHeight: 15, maxFloors: 3, setbackFront: 3, setbackRear: 2, setbackLeft: 1, setbackRight: 1 },
  ZONE_AGRICULTURE: { maxCoverageRatio: 20, maxFloorAreaRatio: 80, maxHeight: 10, maxFloors: 2, setbackFront: 5, setbackRear: 3, setbackLeft: 2, setbackRight: 2 },
}

// ---------------------------------------------------------------------------
// Helper: create a rectangular GeoJSON polygon near a centroid
// ---------------------------------------------------------------------------
function makeRectPolygon(lat: number, lng: number, areaM2: number) {
  // Approximate a rectangle whose area ~= areaM2
  const side = Math.sqrt(areaM2)
  const halfW = (side / 2) / 111320 // degrees longitude (rough)
  const halfH = (side / 2) / 110540 // degrees latitude (rough)

  const coordinates = [[
    [lng - halfW, lat - halfH],
    [lng + halfW, lat - halfH],
    [lng + halfW, lat + halfH],
    [lng - halfW, lat + halfH],
    [lng - halfW, lat - halfH],
  ]]

  return { type: 'Polygon', coordinates }
}

// ---------------------------------------------------------------------------
// Helper: compute buildable area & max total floor area
// ---------------------------------------------------------------------------
function computeBuildableMetrics(area: number, reg: ZoneRegulation) {
  const deductionFactor = area < 300 ? 0.70 : area < 600 ? 0.78 : 0.85
  const buildableArea = Math.round(area * deductionFactor * 100) / 100
  const maxTotalFloorArea = Math.round(area * reg.maxFloorAreaRatio / 100 * 100) / 100
  return { buildableArea, maxTotalFloorArea }
}

// ---------------------------------------------------------------------------
// Seed: Materials
// ---------------------------------------------------------------------------
const MATERIALS = [
  { name: 'WOOD', nameKo: '목재', color: '#C4A882', roughness: 0.8, metalness: 0.0, priceMultiplier: 1.0 },
  { name: 'CONCRETE', nameKo: '콘크리트', color: '#B0B0B0', roughness: 0.9, metalness: 0.0, priceMultiplier: 0.8 },
  { name: 'WHITE_PLASTER', nameKo: '백색석고', color: '#F5F5F0', roughness: 0.7, metalness: 0.0, priceMultiplier: 0.7 },
  { name: 'BRICK', nameKo: '벽돌', color: '#C45A3C', roughness: 0.85, metalness: 0.0, priceMultiplier: 0.9 },
  { name: 'GLASS', nameKo: '유리', color: '#D4E8F0', roughness: 0.1, metalness: 0.3, priceMultiplier: 1.5 },
]

// ---------------------------------------------------------------------------
// Seed: Module definitions
// ---------------------------------------------------------------------------
const MODULES: {
  name: string; nameKo: string; category: ModuleCategory; description: string
  width: number; depth: number; height: number
  gridWidth: number; gridDepth: number; gridHeight: number
  basePrice: number
}[] = [
    // Structural (5)
    { name: 'exterior-wall', nameKo: '외벽', category: 'STRUCTURAL', description: '외부 구조벽체', width: 3.6, depth: 0.3, height: 3.0, gridWidth: 6, gridDepth: 1, gridHeight: 5, basePrice: 2400000 },
    { name: 'interior-wall', nameKo: '내벽', category: 'STRUCTURAL', description: '내부 구조벽체', width: 3.6, depth: 0.15, height: 3.0, gridWidth: 6, gridDepth: 1, gridHeight: 5, basePrice: 1200000 },
    { name: 'floor-slab', nameKo: '바닥슬래브', category: 'STRUCTURAL', description: '바닥 구조슬래브', width: 3.6, depth: 3.6, height: 0.3, gridWidth: 6, gridDepth: 6, gridHeight: 1, basePrice: 3600000 },
    { name: 'flat-roof', nameKo: '평지붕', category: 'STRUCTURAL', description: '평면 지붕 모듈', width: 3.6, depth: 3.6, height: 0.3, gridWidth: 6, gridDepth: 6, gridHeight: 1, basePrice: 4200000 },
    { name: 'column', nameKo: '기둥', category: 'STRUCTURAL', description: '기둥 구조재', width: 0.6, depth: 0.6, height: 3.0, gridWidth: 1, gridDepth: 1, gridHeight: 5, basePrice: 800000 },

    // Functional (6)
    { name: 'kitchen', nameKo: '주방', category: 'FUNCTIONAL', description: '주방 유닛 모듈', width: 3.6, depth: 3.6, height: 3.0, gridWidth: 6, gridDepth: 6, gridHeight: 5, basePrice: 18000000 },
    { name: 'bathroom', nameKo: '욕실', category: 'FUNCTIONAL', description: '욕실 유닛 모듈', width: 2.4, depth: 2.4, height: 3.0, gridWidth: 4, gridDepth: 4, gridHeight: 5, basePrice: 12000000 },
    { name: 'bedroom', nameKo: '침실', category: 'FUNCTIONAL', description: '침실 유닛 모듈', width: 3.6, depth: 4.2, height: 3.0, gridWidth: 6, gridDepth: 7, gridHeight: 5, basePrice: 15000000 },
    { name: 'living-room', nameKo: '거실', category: 'FUNCTIONAL', description: '거실 유닛 모듈', width: 4.8, depth: 4.2, height: 3.0, gridWidth: 8, gridDepth: 7, gridHeight: 5, basePrice: 20000000 },
    { name: 'entrance', nameKo: '현관', category: 'FUNCTIONAL', description: '현관 유닛 모듈', width: 1.8, depth: 1.8, height: 3.0, gridWidth: 3, gridDepth: 3, gridHeight: 5, basePrice: 5000000 },
    { name: 'staircase', nameKo: '계단', category: 'FUNCTIONAL', description: '계단 유닛 모듈', width: 1.8, depth: 3.6, height: 3.0, gridWidth: 3, gridDepth: 6, gridHeight: 5, basePrice: 8000000 },

    // Design (4)
    { name: 'large-window', nameKo: '대형창', category: 'DESIGN', description: '대형 유리창 모듈', width: 2.4, depth: 0.15, height: 2.1, gridWidth: 4, gridDepth: 1, gridHeight: 4, basePrice: 3000000 },
    { name: 'small-window', nameKo: '소형창', category: 'DESIGN', description: '소형 유리창 모듈', width: 1.2, depth: 0.15, height: 1.2, gridWidth: 2, gridDepth: 1, gridHeight: 2, basePrice: 1200000 },
    { name: 'balcony', nameKo: '발코니', category: 'DESIGN', description: '발코니 유닛 모듈', width: 3.6, depth: 1.8, height: 1.2, gridWidth: 6, gridDepth: 3, gridHeight: 2, basePrice: 6000000 },
    { name: 'entrance-door', nameKo: '현관도어', category: 'DESIGN', description: '현관 출입문 모듈', width: 1.2, depth: 0.15, height: 2.4, gridWidth: 2, gridDepth: 1, gridHeight: 4, basePrice: 2000000 },
  ]

// ---------------------------------------------------------------------------
// Seed: Land Parcels  (50 Seoul / Gyeonggi parcels)
// ---------------------------------------------------------------------------
interface ParcelSeed {
  pnu: string
  address: string
  area: number
  zoneType: ZoneType
  officialPrice: number
  centroidLat: number
  centroidLng: number
}

const PARCELS: ParcelSeed[] = [
  // ── Seoul 강남구 ──────────────────────────────────────────
  { pnu: '1168010100100010001', address: '서울특별시 강남구 역삼동 123-4', area: 330, zoneType: 'ZONE_C_GENERAL', officialPrice: 12500000, centroidLat: 37.5010, centroidLng: 127.0368 },
  { pnu: '1168010100100020002', address: '서울특별시 강남구 삼성동 45-12', area: 520, zoneType: 'ZONE_C_GENERAL', officialPrice: 14200000, centroidLat: 37.5088, centroidLng: 127.0638 },
  { pnu: '1168010100100030003', address: '서울특별시 강남구 대치동 890-1', area: 280, zoneType: 'ZONE_R3_GENERAL', officialPrice: 9800000, centroidLat: 37.4943, centroidLng: 127.0572 },
  { pnu: '1168010100100040004', address: '서울특별시 강남구 논현동 234-7', area: 185, zoneType: 'ZONE_R2_GENERAL', officialPrice: 8500000, centroidLat: 37.5152, centroidLng: 127.0283 },
  { pnu: '1168010100100050005', address: '서울특별시 강남구 청담동 56-3', area: 710, zoneType: 'ZONE_C_NEIGHBORHOOD', officialPrice: 13000000, centroidLat: 37.5245, centroidLng: 127.0508 },

  // ── Seoul 서초구 ──────────────────────────────────────────
  { pnu: '1165010100100060006', address: '서울특별시 서초구 서초동 1305-8', area: 420, zoneType: 'ZONE_C_GENERAL', officialPrice: 11000000, centroidLat: 37.4920, centroidLng: 127.0090 },
  { pnu: '1165010100100070007', address: '서울특별시 서초구 반포동 18-3', area: 350, zoneType: 'ZONE_R3_GENERAL', officialPrice: 10500000, centroidLat: 37.5055, centroidLng: 126.9920 },
  { pnu: '1165010100100080008', address: '서울특별시 서초구 방배동 455-2', area: 230, zoneType: 'ZONE_R2_GENERAL', officialPrice: 7200000, centroidLat: 37.4812, centroidLng: 126.9870 },
  { pnu: '1165010100100090009', address: '서울특별시 서초구 잠원동 12-7', area: 290, zoneType: 'ZONE_R2_GENERAL', officialPrice: 8800000, centroidLat: 37.5120, centroidLng: 126.9955 },
  { pnu: '1165010100100100010', address: '서울특별시 서초구 양재동 305-1', area: 1200, zoneType: 'ZONE_C_NEIGHBORHOOD', officialPrice: 6500000, centroidLat: 37.4700, centroidLng: 127.0350 },

  // ── Seoul 마포구 ──────────────────────────────────────────
  { pnu: '1144010100100110011', address: '서울특별시 마포구 합정동 367-5', area: 198, zoneType: 'ZONE_R2_GENERAL', officialPrice: 6800000, centroidLat: 37.5505, centroidLng: 126.9135 },
  { pnu: '1144010100100120012', address: '서울특별시 마포구 서교동 402-3', area: 165, zoneType: 'ZONE_C_NEIGHBORHOOD', officialPrice: 7500000, centroidLat: 37.5563, centroidLng: 126.9230 },
  { pnu: '1144010100100130013', address: '서울특별시 마포구 연남동 228-14', area: 145, zoneType: 'ZONE_R2_GENERAL', officialPrice: 6200000, centroidLat: 37.5663, centroidLng: 126.9245 },
  { pnu: '1144010100100140014', address: '서울특별시 마포구 망원동 412-8', area: 210, zoneType: 'ZONE_R1_GENERAL', officialPrice: 5500000, centroidLat: 37.5570, centroidLng: 126.9070 },
  { pnu: '1144010100100150015', address: '서울특별시 마포구 상수동 73-2', area: 178, zoneType: 'ZONE_R2_GENERAL', officialPrice: 7000000, centroidLat: 37.5485, centroidLng: 126.9220 },

  // ── Seoul 성동구 ──────────────────────────────────────────
  { pnu: '1120010100100160016', address: '서울특별시 성동구 성수동1가 685-7', area: 450, zoneType: 'ZONE_I_SEMI', officialPrice: 5800000, centroidLat: 37.5445, centroidLng: 127.0555 },
  { pnu: '1120010100100170017', address: '서울특별시 성동구 성수동2가 302-1', area: 380, zoneType: 'ZONE_R_SEMI', officialPrice: 7200000, centroidLat: 37.5408, centroidLng: 127.0590 },
  { pnu: '1120010100100180018', address: '서울특별시 성동구 금호동 450-3', area: 160, zoneType: 'ZONE_R2_GENERAL', officialPrice: 5000000, centroidLat: 37.5560, centroidLng: 127.0180 },
  { pnu: '1120010100100190019', address: '서울특별시 성동구 행당동 205-12', area: 250, zoneType: 'ZONE_R2_GENERAL', officialPrice: 4800000, centroidLat: 37.5580, centroidLng: 127.0285 },
  { pnu: '1120010100100200020', address: '서울특별시 성동구 옥수동 78-5', area: 195, zoneType: 'ZONE_R1_GENERAL', officialPrice: 5200000, centroidLat: 37.5470, centroidLng: 127.0120 },

  // ── Seoul 송파구 ──────────────────────────────────────────
  { pnu: '1171010100100210021', address: '서울특별시 송파구 잠실동 40-1', area: 890, zoneType: 'ZONE_C_GENERAL', officialPrice: 11500000, centroidLat: 37.5132, centroidLng: 127.0812 },
  { pnu: '1171010100100220022', address: '서울특별시 송파구 방이동 176-3', area: 320, zoneType: 'ZONE_R3_GENERAL', officialPrice: 7800000, centroidLat: 37.5118, centroidLng: 127.1090 },
  { pnu: '1171010100100230023', address: '서울특별시 송파구 문정동 89-2', area: 560, zoneType: 'ZONE_C_NEIGHBORHOOD', officialPrice: 8200000, centroidLat: 37.4855, centroidLng: 127.1220 },
  { pnu: '1171010100100240024', address: '서울특별시 송파구 가락동 150-8', area: 410, zoneType: 'ZONE_R2_GENERAL', officialPrice: 6500000, centroidLat: 37.4942, centroidLng: 127.1180 },
  { pnu: '1171010100100250025', address: '서울특별시 송파구 석촌동 267-1', area: 270, zoneType: 'ZONE_R2_GENERAL', officialPrice: 7200000, centroidLat: 37.5048, centroidLng: 127.0990 },

  // ── Seoul 용산구 ──────────────────────────────────────────
  { pnu: '1117010100100260026', address: '서울특별시 용산구 한남동 684-3', area: 480, zoneType: 'ZONE_R3_GENERAL', officialPrice: 12000000, centroidLat: 37.5340, centroidLng: 127.0000 },
  { pnu: '1117010100100270027', address: '서울특별시 용산구 이태원동 120-7', area: 200, zoneType: 'ZONE_C_NEIGHBORHOOD', officialPrice: 9500000, centroidLat: 37.5345, centroidLng: 126.9940 },
  { pnu: '1117010100100280028', address: '서울특별시 용산구 서빙고동 45-2', area: 1500, zoneType: 'ZONE_R_SEMI', officialPrice: 8000000, centroidLat: 37.5220, centroidLng: 126.9930 },
  { pnu: '1117010100100290029', address: '서울특별시 용산구 보광동 329-4', area: 155, zoneType: 'ZONE_R1_GENERAL', officialPrice: 5800000, centroidLat: 37.5295, centroidLng: 127.0030 },
  { pnu: '1117010100100300030', address: '서울특별시 용산구 원효로1가 12-8', area: 340, zoneType: 'ZONE_R2_GENERAL', officialPrice: 6000000, centroidLat: 37.5365, centroidLng: 126.9680 },

  // ── Seoul 광진구 ──────────────────────────────────────────
  { pnu: '1121510100100310031', address: '서울특별시 광진구 구의동 234-1', area: 310, zoneType: 'ZONE_R2_GENERAL', officialPrice: 5500000, centroidLat: 37.5428, centroidLng: 127.0870 },
  { pnu: '1121510100100320032', address: '서울특별시 광진구 자양동 680-5', area: 255, zoneType: 'ZONE_R2_GENERAL', officialPrice: 6000000, centroidLat: 37.5365, centroidLng: 127.0720 },
  { pnu: '1121510100100330033', address: '서울특별시 광진구 화양동 5-12', area: 180, zoneType: 'ZONE_C_NEIGHBORHOOD', officialPrice: 7500000, centroidLat: 37.5445, centroidLng: 127.0720 },

  // ── Seoul 동대문구 ─────────────────────────────────────────
  { pnu: '1123010100100340034', address: '서울특별시 동대문구 전농동 590-1', area: 400, zoneType: 'ZONE_R2_GENERAL', officialPrice: 4500000, centroidLat: 37.5770, centroidLng: 127.0555 },
  { pnu: '1123010100100350035', address: '서울특별시 동대문구 장안동 317-8', area: 220, zoneType: 'ZONE_R1_GENERAL', officialPrice: 4000000, centroidLat: 37.5710, centroidLng: 127.0670 },
  { pnu: '1123010100100360036', address: '서울특별시 동대문구 회기동 53-2', area: 170, zoneType: 'ZONE_R2_GENERAL', officialPrice: 4200000, centroidLat: 37.5890, centroidLng: 127.0570 },

  // ── Seoul 종로구 ──────────────────────────────────────────
  { pnu: '1111010100100370037', address: '서울특별시 종로구 삼청동 35-7', area: 240, zoneType: 'ZONE_R1_EXCLUSIVE', officialPrice: 8000000, centroidLat: 37.5830, centroidLng: 126.9820 },
  { pnu: '1111010100100380038', address: '서울특별시 종로구 통인동 78-1', area: 150, zoneType: 'ZONE_R1_GENERAL', officialPrice: 6500000, centroidLat: 37.5780, centroidLng: 126.9700 },

  // ── Seoul 중구 ────────────────────────────────────────────
  { pnu: '1114010100100390039', address: '서울특별시 중구 을지로동 196-3', area: 680, zoneType: 'ZONE_C_CENTRAL', officialPrice: 15000000, centroidLat: 37.5660, centroidLng: 126.9920 },
  { pnu: '1114010100100400040', address: '서울특별시 중구 충무로동 62-5', area: 350, zoneType: 'ZONE_C_GENERAL', officialPrice: 13000000, centroidLat: 37.5610, centroidLng: 126.9940 },

  // ── Gyeonggi 성남시 ────────────────────────────────────────
  { pnu: '4113110100100410041', address: '경기도 성남시 분당구 정자동 18-3', area: 500, zoneType: 'ZONE_R3_GENERAL', officialPrice: 6000000, centroidLat: 37.3655, centroidLng: 127.1085 },
  { pnu: '4113110100100420042', address: '경기도 성남시 분당구 서현동 245-1', area: 380, zoneType: 'ZONE_C_NEIGHBORHOOD', officialPrice: 7200000, centroidLat: 37.3845, centroidLng: 127.1230 },
  { pnu: '4113110100100430043', address: '경기도 성남시 수정구 신흥동 3302', area: 290, zoneType: 'ZONE_R2_GENERAL', officialPrice: 3500000, centroidLat: 37.4432, centroidLng: 127.1540 },

  // ── Gyeonggi 고양시 ────────────────────────────────────────
  { pnu: '4128110100100440044', address: '경기도 고양시 일산동구 백석동 1330', area: 600, zoneType: 'ZONE_R2_GENERAL', officialPrice: 4200000, centroidLat: 37.6510, centroidLng: 126.7740 },
  { pnu: '4128110100100450045', address: '경기도 고양시 덕양구 행신동 723-4', area: 320, zoneType: 'ZONE_R1_GENERAL', officialPrice: 3200000, centroidLat: 37.6120, centroidLng: 126.8340 },
  { pnu: '4128110100100460046', address: '경기도 고양시 일산서구 대화동 2150', area: 1800, zoneType: 'ZONE_C_GENERAL', officialPrice: 5500000, centroidLat: 37.6780, centroidLng: 126.7480 },

  // ── Gyeonggi 수원시 ────────────────────────────────────────
  { pnu: '4111110100100470047', address: '경기도 수원시 영통구 영통동 992-3', area: 450, zoneType: 'ZONE_R2_GENERAL', officialPrice: 3800000, centroidLat: 37.2500, centroidLng: 127.0730 },
  { pnu: '4111110100100480048', address: '경기도 수원시 팔달구 인계동 1037', area: 260, zoneType: 'ZONE_C_NEIGHBORHOOD', officialPrice: 5000000, centroidLat: 37.2650, centroidLng: 127.0320 },

  // ── Gyeonggi 하남시 ────────────────────────────────────────
  { pnu: '4145010100100490049', address: '경기도 하남시 감일동 532-1', area: 750, zoneType: 'ZONE_R2_GENERAL', officialPrice: 4800000, centroidLat: 37.5505, centroidLng: 127.1820 },
  { pnu: '4145010100100500050', address: '경기도 하남시 미사동 620-3', area: 420, zoneType: 'ZONE_R3_GENERAL', officialPrice: 5200000, centroidLat: 37.5630, centroidLng: 127.1950 },

  // ── Gyeonggi 과천시 ────────────────────────────────────────
  { pnu: '4129010100100510051', address: '경기도 과천시 별양동 1-5', area: 350, zoneType: 'ZONE_R2_GENERAL', officialPrice: 6500000, centroidLat: 37.4290, centroidLng: 127.0000 },
  { pnu: '4129010100100520052', address: '경기도 과천시 중앙동 38-2', area: 280, zoneType: 'ZONE_C_NEIGHBORHOOD', officialPrice: 7000000, centroidLat: 37.4260, centroidLng: 126.9950 },
]

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------
async function main() {
  console.log('Seeding database...')

  // ── Materials ─────────────────────────────────────────────
  console.log('  Creating materials...')
  for (const mat of MATERIALS) {
    await prisma.material.upsert({
      where: { name: mat.name },
      update: mat,
      create: mat,
    })
  }

  // ── Modules ───────────────────────────────────────────────
  console.log('  Creating module definitions...')
  for (const mod of MODULES) {
    await prisma.moduleDefinition.upsert({
      where: { name: mod.name },
      update: {
        nameKo: mod.nameKo,
        category: mod.category,
        description: mod.description,
        width: mod.width,
        depth: mod.depth,
        height: mod.height,
        gridWidth: mod.gridWidth,
        gridDepth: mod.gridDepth,
        gridHeight: mod.gridHeight,
        basePrice: mod.basePrice,
      },
      create: {
        name: mod.name,
        nameKo: mod.nameKo,
        category: mod.category,
        description: mod.description,
        width: mod.width,
        depth: mod.depth,
        height: mod.height,
        gridWidth: mod.gridWidth,
        gridDepth: mod.gridDepth,
        gridHeight: mod.gridHeight,
        basePrice: mod.basePrice,
      },
    })
  }

  // ── Land Parcels + Building Regulations ───────────────────
  console.log('  Creating land parcels and regulations...')
  for (const p of PARCELS) {
    const geometryJson = makeRectPolygon(p.centroidLat, p.centroidLng, p.area)
    const reg = ZONE_REGULATIONS[p.zoneType]
    const { buildableArea, maxTotalFloorArea } = computeBuildableMetrics(p.area, reg)

    const parcel = await prisma.landParcel.upsert({
      where: { pnu: p.pnu },
      update: {
        address: p.address,
        area: p.area,
        zoneType: p.zoneType,
        officialPrice: p.officialPrice,
        geometryJson,
        centroidLat: p.centroidLat,
        centroidLng: p.centroidLng,
      },
      create: {
        pnu: p.pnu,
        address: p.address,
        area: p.area,
        zoneType: p.zoneType,
        officialPrice: p.officialPrice,
        geometryJson,
        centroidLat: p.centroidLat,
        centroidLng: p.centroidLng,
      },
    })

    await prisma.buildingRegulation.upsert({
      where: { parcelId: parcel.id },
      update: {
        maxCoverageRatio: reg.maxCoverageRatio,
        maxFloorAreaRatio: reg.maxFloorAreaRatio,
        maxHeight: reg.maxHeight,
        maxFloors: reg.maxFloors,
        setbackFront: reg.setbackFront,
        setbackRear: reg.setbackRear,
        setbackLeft: reg.setbackLeft,
        setbackRight: reg.setbackRight,
        buildableArea,
        maxTotalFloorArea,
      },
      create: {
        parcelId: parcel.id,
        maxCoverageRatio: reg.maxCoverageRatio,
        maxFloorAreaRatio: reg.maxFloorAreaRatio,
        maxHeight: reg.maxHeight,
        maxFloors: reg.maxFloors,
        setbackFront: reg.setbackFront,
        setbackRear: reg.setbackRear,
        setbackLeft: reg.setbackLeft,
        setbackRight: reg.setbackRight,
        buildableArea,
        maxTotalFloorArea,
      },
    })
  }

  // ── Closed Schools ─────────────────────────────────────────
  console.log('  Seeding Closed Schools...')
  // path relative to prisma folder? __dirname IS prisma folder typically in ts-node execution if seed.ts is there?
  // prisma/seed.ts. src/data/closed_schools.json is ../src/data/...
  const schoolsJsonPath = path.join(__dirname, '../src/data/closed_schools.json')

  if (fs.existsSync(schoolsJsonPath)) {
    const rawData = fs.readFileSync(schoolsJsonPath, 'utf-8')
    const schoolsData = JSON.parse(rawData)
    const schools = schoolsData.data || []

    console.log(`  Found ${schools.length} closed schools. Upserting...`)

    for (const school of schools) {
      await prisma.closedSchool.upsert({
        where: { oldId: school.id },
        update: {
          name: school.name,
          status: school.status,
          sido: school.sido,
          sigungu: school.sigungu,
          address: school.address,
          buildingArea: school.buildingArea,
          landArea: school.landArea,
          appraisalLand: school.appraisalLand,
          appraisalBuilding: school.appraisalBuilding,
          appraisalTotal: school.appraisalTotal,
          futurePlan: school.futurePlan,
        },
        create: {
          oldId: school.id,
          name: school.name,
          status: school.status,
          sido: school.sido,
          sigungu: school.sigungu,
          address: school.address,
          buildingArea: school.buildingArea,
          landArea: school.landArea,
          appraisalLand: school.appraisalLand,
          appraisalBuilding: school.appraisalBuilding,
          appraisalTotal: school.appraisalTotal,
          futurePlan: school.futurePlan,
        },
      })
    }
  } else {
    console.warn(`  Warning: Closed schools data not found at ${schoolsJsonPath}`)
  }

  console.log('Seed completed successfully!')
  console.log(`  Materials: ${MATERIALS.length}`)
  console.log(`  Modules:   ${MODULES.length}`)
  console.log(`  Parcels:   ${PARCELS.length}`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
