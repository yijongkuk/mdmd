import type { LandParcel, GeoJsonPolygon, ZoneType } from '@/types/land';

/**
 * Generate a rectangular GeoJSON polygon near a centroid.
 * Matches the logic used in prisma/seed.ts.
 */
function makeRectPolygon(lat: number, lng: number, areaM2: number): GeoJsonPolygon {
  const side = Math.sqrt(areaM2);
  const halfW = side / 2 / 111320;
  const halfH = side / 2 / 110540;

  return {
    type: 'Polygon',
    coordinates: [
      [
        [lng - halfW, lat - halfH],
        [lng + halfW, lat - halfH],
        [lng + halfW, lat + halfH],
        [lng - halfW, lat + halfH],
        [lng - halfW, lat - halfH],
      ],
    ],
  };
}

interface ParcelSeed {
  pnu: string;
  address: string;
  area: number;
  zoneType: ZoneType;
  officialPrice: number;
  centroidLat: number;
  centroidLng: number;
}

const PARCEL_SEEDS: ParcelSeed[] = [
  // -- Seoul 강남구 (5) --
  { pnu: '1168010100100010001', address: '서울특별시 강남구 역삼동 123-4', area: 330, zoneType: 'ZONE_C_GENERAL', officialPrice: 12500000, centroidLat: 37.5010, centroidLng: 127.0368 },
  { pnu: '1168010100100020002', address: '서울특별시 강남구 삼성동 45-12', area: 520, zoneType: 'ZONE_C_GENERAL', officialPrice: 14200000, centroidLat: 37.5088, centroidLng: 127.0638 },
  { pnu: '1168010100100030003', address: '서울특별시 강남구 대치동 890-1', area: 280, zoneType: 'ZONE_R3_GENERAL', officialPrice: 9800000, centroidLat: 37.4943, centroidLng: 127.0572 },
  { pnu: '1168010100100040004', address: '서울특별시 강남구 논현동 234-7', area: 185, zoneType: 'ZONE_R2_GENERAL', officialPrice: 8500000, centroidLat: 37.5152, centroidLng: 127.0283 },
  { pnu: '1168010100100050005', address: '서울특별시 강남구 청담동 56-3', area: 710, zoneType: 'ZONE_C_NEIGHBORHOOD', officialPrice: 13000000, centroidLat: 37.5245, centroidLng: 127.0508 },

  // -- Seoul 서초구 (5) --
  { pnu: '1165010100100060006', address: '서울특별시 서초구 서초동 1305-8', area: 420, zoneType: 'ZONE_C_GENERAL', officialPrice: 11000000, centroidLat: 37.4920, centroidLng: 127.0090 },
  { pnu: '1165010100100070007', address: '서울특별시 서초구 반포동 18-3', area: 350, zoneType: 'ZONE_R3_GENERAL', officialPrice: 10500000, centroidLat: 37.5055, centroidLng: 126.9920 },
  { pnu: '1165010100100080008', address: '서울특별시 서초구 방배동 455-2', area: 230, zoneType: 'ZONE_R2_GENERAL', officialPrice: 7200000, centroidLat: 37.4812, centroidLng: 126.9870 },
  { pnu: '1165010100100090009', address: '서울특별시 서초구 잠원동 12-7', area: 290, zoneType: 'ZONE_R2_GENERAL', officialPrice: 8800000, centroidLat: 37.5120, centroidLng: 126.9955 },
  { pnu: '1165010100100100010', address: '서울특별시 서초구 양재동 305-1', area: 1200, zoneType: 'ZONE_C_NEIGHBORHOOD', officialPrice: 6500000, centroidLat: 37.4700, centroidLng: 127.0350 },

  // -- Seoul 마포구 (5) --
  { pnu: '1144010100100110011', address: '서울특별시 마포구 합정동 367-5', area: 198, zoneType: 'ZONE_R2_GENERAL', officialPrice: 6800000, centroidLat: 37.5505, centroidLng: 126.9135 },
  { pnu: '1144010100100120012', address: '서울특별시 마포구 서교동 402-3', area: 165, zoneType: 'ZONE_C_NEIGHBORHOOD', officialPrice: 7500000, centroidLat: 37.5563, centroidLng: 126.9230 },
  { pnu: '1144010100100130013', address: '서울특별시 마포구 연남동 228-14', area: 145, zoneType: 'ZONE_R2_GENERAL', officialPrice: 6200000, centroidLat: 37.5663, centroidLng: 126.9245 },
  { pnu: '1144010100100140014', address: '서울특별시 마포구 망원동 412-8', area: 210, zoneType: 'ZONE_R1_GENERAL', officialPrice: 5500000, centroidLat: 37.5570, centroidLng: 126.9070 },
  { pnu: '1144010100100150015', address: '서울특별시 마포구 상수동 73-2', area: 178, zoneType: 'ZONE_R2_GENERAL', officialPrice: 7000000, centroidLat: 37.5485, centroidLng: 126.9220 },

  // -- Seoul 성동구 (5) --
  { pnu: '1120010100100160016', address: '서울특별시 성동구 성수동1가 685-7', area: 450, zoneType: 'ZONE_I_SEMI', officialPrice: 5800000, centroidLat: 37.5445, centroidLng: 127.0555 },
  { pnu: '1120010100100170017', address: '서울특별시 성동구 성수동2가 302-1', area: 380, zoneType: 'ZONE_R_SEMI', officialPrice: 7200000, centroidLat: 37.5408, centroidLng: 127.0590 },
  { pnu: '1120010100100180018', address: '서울특별시 성동구 금호동 450-3', area: 160, zoneType: 'ZONE_R2_GENERAL', officialPrice: 5000000, centroidLat: 37.5560, centroidLng: 127.0180 },
  { pnu: '1120010100100190019', address: '서울특별시 성동구 행당동 205-12', area: 250, zoneType: 'ZONE_R2_GENERAL', officialPrice: 4800000, centroidLat: 37.5580, centroidLng: 127.0285 },
  { pnu: '1120010100100200020', address: '서울특별시 성동구 옥수동 78-5', area: 195, zoneType: 'ZONE_R1_GENERAL', officialPrice: 5200000, centroidLat: 37.5470, centroidLng: 127.0120 },

  // -- Seoul 송파구 (5) --
  { pnu: '1171010100100210021', address: '서울특별시 송파구 잠실동 40-1', area: 890, zoneType: 'ZONE_C_GENERAL', officialPrice: 11500000, centroidLat: 37.5132, centroidLng: 127.0812 },
  { pnu: '1171010100100220022', address: '서울특별시 송파구 방이동 176-3', area: 320, zoneType: 'ZONE_R3_GENERAL', officialPrice: 7800000, centroidLat: 37.5118, centroidLng: 127.1090 },
  { pnu: '1171010100100230023', address: '서울특별시 송파구 문정동 89-2', area: 560, zoneType: 'ZONE_C_NEIGHBORHOOD', officialPrice: 8200000, centroidLat: 37.4855, centroidLng: 127.1220 },
  { pnu: '1171010100100240024', address: '서울특별시 송파구 가락동 150-8', area: 410, zoneType: 'ZONE_R2_GENERAL', officialPrice: 6500000, centroidLat: 37.4942, centroidLng: 127.1180 },
  { pnu: '1171010100100250025', address: '서울특별시 송파구 석촌동 267-1', area: 270, zoneType: 'ZONE_R2_GENERAL', officialPrice: 7200000, centroidLat: 37.5048, centroidLng: 127.0990 },

  // -- Seoul 용산구 (5) --
  { pnu: '1117010100100260026', address: '서울특별시 용산구 한남동 684-3', area: 480, zoneType: 'ZONE_R3_GENERAL', officialPrice: 12000000, centroidLat: 37.5340, centroidLng: 127.0000 },
  { pnu: '1117010100100270027', address: '서울특별시 용산구 이태원동 120-7', area: 200, zoneType: 'ZONE_C_NEIGHBORHOOD', officialPrice: 9500000, centroidLat: 37.5345, centroidLng: 126.9940 },
  { pnu: '1117010100100280028', address: '서울특별시 용산구 서빙고동 45-2', area: 1500, zoneType: 'ZONE_R_SEMI', officialPrice: 8000000, centroidLat: 37.5220, centroidLng: 126.9930 },
  { pnu: '1117010100100290029', address: '서울특별시 용산구 보광동 329-4', area: 155, zoneType: 'ZONE_R1_GENERAL', officialPrice: 5800000, centroidLat: 37.5295, centroidLng: 127.0030 },
  { pnu: '1117010100100300030', address: '서울특별시 용산구 원효로1가 12-8', area: 340, zoneType: 'ZONE_R2_GENERAL', officialPrice: 6000000, centroidLat: 37.5365, centroidLng: 126.9680 },

  // -- Seoul 광진구 (3) --
  { pnu: '1121510100100310031', address: '서울특별시 광진구 구의동 234-1', area: 310, zoneType: 'ZONE_R2_GENERAL', officialPrice: 5500000, centroidLat: 37.5428, centroidLng: 127.0870 },
  { pnu: '1121510100100320032', address: '서울특별시 광진구 자양동 680-5', area: 255, zoneType: 'ZONE_R2_GENERAL', officialPrice: 6000000, centroidLat: 37.5365, centroidLng: 127.0720 },
  { pnu: '1121510100100330033', address: '서울특별시 광진구 화양동 5-12', area: 180, zoneType: 'ZONE_C_NEIGHBORHOOD', officialPrice: 7500000, centroidLat: 37.5445, centroidLng: 127.0720 },

  // -- Seoul 동대문구 (3) --
  { pnu: '1123010100100340034', address: '서울특별시 동대문구 전농동 590-1', area: 400, zoneType: 'ZONE_R2_GENERAL', officialPrice: 4500000, centroidLat: 37.5770, centroidLng: 127.0555 },
  { pnu: '1123010100100350035', address: '서울특별시 동대문구 장안동 317-8', area: 220, zoneType: 'ZONE_R1_GENERAL', officialPrice: 4000000, centroidLat: 37.5710, centroidLng: 127.0670 },
  { pnu: '1123010100100360036', address: '서울특별시 동대문구 회기동 53-2', area: 170, zoneType: 'ZONE_R2_GENERAL', officialPrice: 4200000, centroidLat: 37.5890, centroidLng: 127.0570 },

  // -- Seoul 종로구 (2) --
  { pnu: '1111010100100370037', address: '서울특별시 종로구 삼청동 35-7', area: 240, zoneType: 'ZONE_R1_EXCLUSIVE', officialPrice: 8000000, centroidLat: 37.5830, centroidLng: 126.9820 },
  { pnu: '1111010100100380038', address: '서울특별시 종로구 통인동 78-1', area: 150, zoneType: 'ZONE_R1_GENERAL', officialPrice: 6500000, centroidLat: 37.5780, centroidLng: 126.9700 },

  // -- Seoul 중구 (2) --
  { pnu: '1114010100100390039', address: '서울특별시 중구 을지로동 196-3', area: 680, zoneType: 'ZONE_C_CENTRAL', officialPrice: 15000000, centroidLat: 37.5660, centroidLng: 126.9920 },
  { pnu: '1114010100100400040', address: '서울특별시 중구 충무로동 62-5', area: 350, zoneType: 'ZONE_C_GENERAL', officialPrice: 13000000, centroidLat: 37.5610, centroidLng: 126.9940 },

  // -- Seoul 영등포구 (2) --
  { pnu: '1156010100100410041', address: '서울특별시 영등포구 여의도동 28-1', area: 950, zoneType: 'ZONE_C_GENERAL', officialPrice: 14000000, centroidLat: 37.5260, centroidLng: 126.9240 },
  { pnu: '1156010100100420042', address: '서울특별시 영등포구 문래동3가 55-7', area: 380, zoneType: 'ZONE_I_SEMI', officialPrice: 4500000, centroidLat: 37.5170, centroidLng: 126.8960 },

  // -- Seoul 강서구 (2) --
  { pnu: '1150010100100430043', address: '서울특별시 강서구 마곡동 757-1', area: 1100, zoneType: 'ZONE_C_NEIGHBORHOOD', officialPrice: 5800000, centroidLat: 37.5610, centroidLng: 126.8370 },
  { pnu: '1150010100100440044', address: '서울특별시 강서구 화곡동 1068-3', area: 260, zoneType: 'ZONE_R2_GENERAL', officialPrice: 3800000, centroidLat: 37.5410, centroidLng: 126.8490 },

  // -- Gyeonggi 성남시 (3) --
  { pnu: '4113110100100450045', address: '경기도 성남시 분당구 정자동 18-3', area: 500, zoneType: 'ZONE_R3_GENERAL', officialPrice: 6000000, centroidLat: 37.3655, centroidLng: 127.1085 },
  { pnu: '4113110100100460046', address: '경기도 성남시 분당구 서현동 245-1', area: 380, zoneType: 'ZONE_C_NEIGHBORHOOD', officialPrice: 7200000, centroidLat: 37.3845, centroidLng: 127.1230 },
  { pnu: '4113110100100470047', address: '경기도 성남시 수정구 신흥동 3302', area: 290, zoneType: 'ZONE_R2_GENERAL', officialPrice: 3500000, centroidLat: 37.4432, centroidLng: 127.1540 },

  // -- Gyeonggi 고양시 (3) --
  { pnu: '4128110100100480048', address: '경기도 고양시 일산동구 백석동 1330', area: 600, zoneType: 'ZONE_R2_GENERAL', officialPrice: 4200000, centroidLat: 37.6510, centroidLng: 126.7740 },
  { pnu: '4128110100100490049', address: '경기도 고양시 덕양구 행신동 723-4', area: 320, zoneType: 'ZONE_R1_GENERAL', officialPrice: 3200000, centroidLat: 37.6120, centroidLng: 126.8340 },
  { pnu: '4128110100100500050', address: '경기도 고양시 일산서구 대화동 2150', area: 1800, zoneType: 'ZONE_C_GENERAL', officialPrice: 5500000, centroidLat: 37.6780, centroidLng: 126.7480 },

  // -- Gyeonggi 수원시 (2) --
  { pnu: '4111110100100510051', address: '경기도 수원시 영통구 영통동 992-3', area: 450, zoneType: 'ZONE_R2_GENERAL', officialPrice: 3800000, centroidLat: 37.2500, centroidLng: 127.0730 },
  { pnu: '4111110100100520052', address: '경기도 수원시 팔달구 인계동 1037', area: 260, zoneType: 'ZONE_C_NEIGHBORHOOD', officialPrice: 5000000, centroidLat: 37.2650, centroidLng: 127.0320 },

  // -- Gyeonggi 하남시 (2) --
  { pnu: '4145010100100530053', address: '경기도 하남시 감일동 532-1', area: 750, zoneType: 'ZONE_R2_GENERAL', officialPrice: 4800000, centroidLat: 37.5505, centroidLng: 127.1820 },
  { pnu: '4145010100100540054', address: '경기도 하남시 미사동 620-3', area: 420, zoneType: 'ZONE_R3_GENERAL', officialPrice: 5200000, centroidLat: 37.5630, centroidLng: 127.1950 },

  // -- Gyeonggi 과천시 (2) --
  { pnu: '4129010100100550055', address: '경기도 과천시 별양동 1-5', area: 350, zoneType: 'ZONE_R2_GENERAL', officialPrice: 6500000, centroidLat: 37.4290, centroidLng: 127.0000 },
  { pnu: '4129010100100560056', address: '경기도 과천시 중앙동 38-2', area: 280, zoneType: 'ZONE_C_NEIGHBORHOOD', officialPrice: 7000000, centroidLat: 37.4260, centroidLng: 126.9950 },
];

let _counter = 0;
function makeId(): string {
  _counter++;
  const hex = _counter.toString(16).padStart(8, '0');
  return `clseed${hex}${Math.random().toString(36).slice(2, 8)}`;
}

export const SEED_PARCELS: LandParcel[] = PARCEL_SEEDS.map((s) => ({
  id: makeId(),
  pnu: s.pnu,
  address: s.address,
  area: s.area,
  zoneType: s.zoneType,
  officialPrice: s.officialPrice,
  geometryJson: makeRectPolygon(s.centroidLat, s.centroidLng, s.area),
  centroidLat: s.centroidLat,
  centroidLng: s.centroidLng,
}));
