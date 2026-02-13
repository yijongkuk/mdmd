import { NextRequest, NextResponse } from 'next/server';
import { getKamcoAuctionList, getInstitutionalAuctionList } from '@/lib/api/onbid';
import { geocodeAddress } from '@/lib/api/vworld';
import type { AuctionProperty } from '@/types/auction';

/**
 * 수도권 주소 키워드 — 서울/경기/인천 주소에 포함되는 문자열
 * geocoding 전에 주소 텍스트로 필터하여 geocoding 부하를 줄임
 */
const METRO_KEYWORDS = [
  '서울', '경기', '인천',
  '수원', '성남', '고양', '용인', '부천', '안산', '화성',
  '안양', '남양주', '의정부', '시흥', '파주', '김포', '광명',
  '광주시', '군포', '하남', '오산', '이천', '양주', '구리',
  '의왕', '포천', '양평', '여주', '동두천', '과천', '가평', '연천',
];

/**
 * 토지 관련 카테고리 키워드 — itemType(CTGR_FULL_NM)에서 필터
 * 건물이 아닌 토지/대지/임야 등 모듈러 건축 가능 물건
 */
const LAND_KEYWORDS = ['토지', '대지', '임야', '전', '답', '과수원', '목장', '잡종지', '나지'];

/** 건물/비토지 키워드 — 이 키워드가 포함되면 무조건 제외 */
const BUILDING_KEYWORDS = [
  '아파트', '건물', '상가', '주택', '빌라', '오피스텔', '빌딩',
  '사무실', '공장', '창고', '차량', '자동차', '기계', '선박',
  '항공', '유가증권', '동산', '회원권', '입주권',
];

function isMetroArea(address: string): boolean {
  return METRO_KEYWORDS.some((kw) => address.includes(kw));
}

function isLandCategory(itemType: string, name: string): boolean {
  const combined = `${itemType} ${name}`;
  // 건물/비토지 키워드가 있으면 제외
  if (BUILDING_KEYWORDS.some((kw) => combined.includes(kw))) return false;
  // 토지 키워드가 있으면 포함
  if (LAND_KEYWORDS.some((kw) => combined.includes(kw))) return true;
  // itemType이 비어있고 건물 키워드도 없으면 일단 포함
  if (!itemType) return true;
  return false;
}

/**
 * 같은 물건(ID)의 여러 입찰 회차 중 가장 적절한 것을 선택:
 * 1) 아직 입찰 시작 전인 회차 중 가장 가까운 것
 * 2) 없으면 가장 최근 입찰 종료일 것
 */
function deduplicateByBestRound(properties: AuctionProperty[]): AuctionProperty[] {
  const groups = new Map<string, AuctionProperty[]>();
  for (const p of properties) {
    if (!p.id) continue;
    const arr = groups.get(p.id);
    if (arr) arr.push(p);
    else groups.set(p.id, [p]);
  }

  const now = Date.now();
  const result: AuctionProperty[] = [];
  for (const items of groups.values()) {
    if (items.length === 1) { result.push(items[0]); continue; }

    // 입찰 시작일이 미래인 것 중 가장 가까운 것 선택
    const future = items
      .filter((p) => p.bidStartDate && new Date(p.bidStartDate).getTime() > now)
      .sort((a, b) => new Date(a.bidStartDate).getTime() - new Date(b.bidStartDate).getTime());

    if (future.length > 0) {
      result.push(future[0]);
    } else {
      // 미래 입찰 없으면 가장 최근 종료일
      const sorted = items
        .filter((p) => p.bidEndDate)
        .sort((a, b) => new Date(b.bidEndDate).getTime() - new Date(a.bidEndDate).getTime());
      result.push(sorted[0] ?? items[0]);
    }
  }
  return result;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const size = parseInt(searchParams.get('size') ?? '1000', 10);
  const method = searchParams.get('method') ?? '';
  const region = searchParams.get('region') ?? ''; // 'metro' for 수도권 only
  const source = searchParams.get('source') ?? 'all'; // 'kamco', 'inst', 'all'
  const category = searchParams.get('category') ?? ''; // 'land' for 토지 only
  const skipGeocode = searchParams.get('skipGeocode') === 'true';
  const regionKeyword = searchParams.get('regionKeyword') ?? ''; // CLTR_NM 서버 측 필터

  try {
    const fetchPromises: Promise<{ properties: AuctionProperty[]; totalCount: number; apiError?: string }>[] = [];

    const params = {
      page,
      size,
      disposalMethodCode: method || undefined,
      regionKeyword: regionKeyword || undefined,
    };

    if (source !== 'inst') {
      fetchPromises.push(getKamcoAuctionList(params));
    }

    const results = await Promise.allSettled(fetchPromises);
    let allProperties: AuctionProperty[] = [];
    let totalCount = 0;
    let apiError: string | undefined;

    for (const r of results) {
      if (r.status === 'fulfilled') {
        allProperties = allProperties.concat(r.value.properties);
        totalCount += r.value.totalCount;
        if (r.value.apiError) apiError = r.value.apiError;
      } else {
        apiError = r.reason?.message ?? 'Unknown fetch error';
      }
    }

    // 스마트 중복제거: 같은 물건의 여러 입찰 회차 중 가장 가까운 미래 입찰 보존
    allProperties = deduplicateByBestRound(allProperties);

    // 입찰기간 만료 물건 제거 — 재공매 시 새 일자로 재등록되므로 안전
    const now = Date.now();
    allProperties = allProperties.filter((p) => {
      if (!p.bidEndDate) return true; // 종료일 없으면 일단 포함
      return new Date(p.bidEndDate).getTime() >= now;
    });

    // Pre-filter by region BEFORE geocoding (avoids wasting geocode calls)
    if (region === 'metro') {
      allProperties = allProperties.filter((p) => isMetroArea(p.address));
    }

    // Filter by land category
    if (category === 'land') {
      allProperties = allProperties.filter((p) => isLandCategory(p.itemType, p.name));
    }

    // 좌표 조회 (geocoding only — 공시지가 조회 제거로 대폭 속도 개선)
    let allResults: AuctionProperty[];
    if (skipGeocode) {
      allResults = allProperties;
    } else {
      const alreadyDone = allProperties.filter((p) => p.lat && p.lng);
      const toDo = allProperties.filter((p) => !p.lat || !p.lng);

      const BATCH_SIZE = 20;
      const enriched: AuctionProperty[] = [];
      for (let i = 0; i < toDo.length; i += BATCH_SIZE) {
        const batch = toDo.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(async (prop) => {
            const coords = await geocodeAddress(prop.address);
            if (coords) {
              return { ...prop, lat: coords.lat, lng: coords.lng };
            }
            return prop;
          })
        );
        enriched.push(...results);
      }

      allResults = [...alreadyDone, ...enriched];
    }

    // Optional bounds filter
    const swLat = parseFloat(searchParams.get('swLat') ?? '');
    const swLng = parseFloat(searchParams.get('swLng') ?? '');
    const neLat = parseFloat(searchParams.get('neLat') ?? '');
    const neLng = parseFloat(searchParams.get('neLng') ?? '');
    const hasBounds = ![swLat, swLng, neLat, neLng].some(Number.isNaN);

    let filtered = allResults;
    if (hasBounds) {
      filtered = allResults.filter(
        (p) =>
          p.lat != null &&
          p.lng != null &&
          p.lat >= swLat &&
          p.lat <= neLat &&
          p.lng >= swLng &&
          p.lng <= neLng
      );
    }

    return NextResponse.json({
      properties: filtered,
      totalCount,
      page,
      pageSize: size,
      ...(apiError ? { apiError } : {}),
    });
  } catch (e) {
    console.error('Auction API error:', e);
    return NextResponse.json(
      { properties: [], totalCount: 0, page, pageSize: size },
      { status: 200 }
    );
  }
}
