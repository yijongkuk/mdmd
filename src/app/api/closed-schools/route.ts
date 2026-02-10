import { NextRequest, NextResponse } from 'next/server';
import { geocodeAddress } from '@/lib/api/vworld';
import { getCached, setCache, TTL } from '@/lib/api/cache';
import type { AuctionProperty } from '@/types/auction';
import closedSchoolsData from '@/data/closed_schools.json';

interface ClosedSchool {
  id: string;
  name: string;
  address: string;
  usageStatus: string;
  unusedReason?: string;
  landArea: number | null;
  buildingArea: number | null;
  appraisalTotal: number | null;
  appraisalLand: number | null;
  appraisalBuilding: number | null;
  closedYear: number | null;
  schoolLevel: string;
  sido: string;
  lat: number | null;
  lng: number | null;
}

const CACHE_KEY = 'closed-schools:list';
const CACHE_KEY_GEOCODED = 'closed-schools:geocoded';

/** 모듈 레벨에 매핑 결과 캐시 (HMR에도 유지됨) */
let moduleCache: AuctionProperty[] | null = null;

function mapToAuctionProperty(school: ClosedSchool): AuctionProperty {
  return {
    id: school.id,
    name: school.name,
    address: school.address,
    disposalMethod: '폐교 유휴부지',
    minBidPrice: (school.appraisalTotal ?? 0) * 1000,
    appraisalValue: (school.appraisalTotal ?? 0) * 1000,
    bidStartDate: '',
    bidEndDate: '',
    itemType: '폐교',
    status: school.usageStatus,
    onbidUrl: '',
    area: school.landArea ?? undefined,
    lat: school.lat ?? undefined,
    lng: school.lng ?? undefined,
    source: 'closed_school',
    closedYear: school.closedYear ?? undefined,
    buildingArea: school.buildingArea ?? undefined,
    unusedReason: school.unusedReason,
    schoolLevel: school.schoolLevel,
    sido: school.sido,
  };
}

function getUnusedSchools(): AuctionProperty[] {
  if (moduleCache) return moduleCache;

  const cached = getCached<AuctionProperty[]>(CACHE_KEY);
  if (cached) { moduleCache = cached; return cached; }

  const schools = (closedSchoolsData as { data: ClosedSchool[] }).data;
  const unused = schools
    .filter((s) => s.usageStatus === '미활용')
    .map(mapToAuctionProperty);

  setCache(CACHE_KEY, unused, TTL.GEOCODE);
  moduleCache = unused;
  return unused;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const geocode = searchParams.get('geocode') === 'true';

  if (!geocode) {
    const properties = getUnusedSchools();
    return NextResponse.json({ properties, totalCount: properties.length });
  }

  // Geocoded version — 캐시 히트 시 즉시 반환
  const cached = getCached<AuctionProperty[]>(CACHE_KEY_GEOCODED);
  if (cached) {
    return NextResponse.json({ properties: cached, totalCount: cached.length });
  }

  const properties = getUnusedSchools().map((p) => ({ ...p }));
  const needGeocode = properties.filter((p) => p.lat == null || p.lng == null);

  // 동시 5개씩 geocode (V-World 부하 제한, 순차 20보다 5배 빠름)
  const CONCURRENCY = 5;
  for (let i = 0; i < needGeocode.length; i += CONCURRENCY) {
    const batch = needGeocode.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((p) => geocodeAddress(p.address).catch(() => null)),
    );
    for (let j = 0; j < batch.length; j++) {
      if (results[j]) {
        batch[j].lat = results[j]!.lat;
        batch[j].lng = results[j]!.lng;
      }
    }
  }

  setCache(CACHE_KEY_GEOCODED, properties, TTL.GEOCODE);
  return NextResponse.json({ properties, totalCount: properties.length });
}
