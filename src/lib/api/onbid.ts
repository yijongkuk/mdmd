import { getCached, setCache, TTL } from './cache';
import type { AuctionProperty, AuctionSearchParams } from '@/types/auction';

const ONBID_API_KEY = process.env.ONBID_API_KEY ?? '';

/**
 * 차세대 온비드 오픈API (2026-04 전환)
 *
 * 구 `openapi.onbid.co.kr/.../KamcoPblsalThingInquireSvc` 계열은 전면 폐기되어
 * 호스트 자체가 응답하지 않는다. 대체 서비스는 공공데이터포털 게이트웨이(B010003).
 *   목록: https://www.data.go.kr/data/15157207/openapi.do  (부동산 물건목록 조회서비스)
 *   상세: https://www.data.go.kr/data/15157247/openapi.do  (부동산 물건상세 조회서비스)
 * KAMCO 직접 호출 주소(참고): https://open.kamco.or.kr/services/OnbidRlstListSrvc/getRlstCltrList
 */
const BASE_URL = 'https://apis.data.go.kr/B010003/OnbidRlstListSrvc2';
const LIST_OP = 'getRlstCltrList2';

/** 요청 타임아웃 — 구 API(120초)와 달리 게이트웨이는 정상 응답이 빠르다 */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * 재산유형코드(prptDivCd) — 필수 파라미터. 부동산 관련 유형 전체.
 * 0004(불용품)은 동산이므로 제외한다.
 */
const PRPT_DIV_ALL = '0007,0010,0005,0002,0003,0006,0008,0011,0013';

/** 입찰결과구분코드(pbctStatCd) 중 유휴지 탐색 대상에서 제외할 종료 상태 */
const DEAD_STATUS_CODES = new Set(['0010', '0012']); // 0010 낙찰, 0012 취소

/**
 * 지역 약칭 → lctnSdnm(소재지지번주소 시도)
 * hooks.ts의 REGION_PAGES가 약칭('서울','경기'…)을 쓰므로 정식 시도명으로 변환한다.
 */
const SIDO_MAP: Record<string, string> = {
  '서울': '서울특별시',
  '경기': '경기도',
  '인천': '인천광역시',
  '부산': '부산광역시',
  '대구': '대구광역시',
  '대전': '대전광역시',
  '광주': '광주광역시',
  '울산': '울산광역시',
  '세종': '세종특별자치시',
  '강원': '강원특별자치도',
  '충북': '충청북도',
  '충남': '충청남도',
  '전북': '전북특별자치도',
  '전남': '전라남도',
  '경북': '경상북도',
  '경남': '경상남도',
  '제주': '제주특별자치도',
};

if (!ONBID_API_KEY) {
  console.error('[OnBid] ❌ ONBID_API_KEY 환경변수가 설정되지 않았습니다!');
}

/** 차세대 온비드 부동산 물건목록 응답 항목 (getRlstCltrList2) */
interface OnbidRlstItem {
  cltrMngNo?: string | number;        // 물건관리번호 (상세조회 키)
  pbctCdtnNo?: string | number;       // 공매조건번호 (상세조회 키)
  onbidCltrno?: string | number;      // 온비드물건번호
  onbidPbancNo?: string | number;     // 온비드공고번호
  pbctNo?: string | number;           // 공매번호
  pbctNsq?: string | number;          // 회차
  onbidCltrNm?: string;               // 물건명
  lctnSdnm?: string;                  // 소재지 시도
  lctnSggnm?: string;                 // 소재지 시군구
  lctnEmdNm?: string;                 // 소재지 읍면동
  ltnoPnu?: string;                   // 지번PNU코드
  rdnmPnu?: string;                   // 도로명PNU코드
  dspsMthodCd?: string;               // 처분방식코드 (0001 매각, 0002 임대)
  dspsMthodNm?: string;               // 처분방식명
  lowstBidPrcIndctCont?: string;      // 최저입찰가격표시내용(원) — "비공개" 가능
  apslEvlAmt?: string | number;       // 감정평가금액(원)
  cltrBidBgngDt?: string | number;    // 입찰시작일시 (yyyyMMddHHmm)
  cltrBidEndDt?: string | number;     // 입찰종료일시 (yyyyMMddHHmm)
  cltrUsgLclsCtgrNm?: string;         // 용도대분류코드명
  cltrUsgMclsCtgrNm?: string;         // 용도중분류코드명
  cltrUsgSclsCtgrNm?: string;         // 용도소분류코드명
  pbctStatCd?: string;                // 입찰결과구분코드
  pbctStatNm?: string;                // 입찰결과구분코드명
  landSqms?: string | number;         // 토지면적(m2)
  bldSqms?: string | number;          // 건물면적(m2)
  alcYn?: string;                     // 지분물건여부 (Y/N)
  usbdNft?: string | number;          // 유찰횟수
  thnlImgUrlAdr?: string;             // 썸네일 이미지 URL
  prptDivNm?: string;                 // 재산유형코드명
  orgNm?: string;                     // 공고기관명
}

/**
 * 온비드 날짜 문자열 → ISO 형식 변환
 * 차세대 API는 yyyyMMddHHmm(12자리)를 사용한다.
 */
function parseOnbidDate(raw: string | number | undefined): string {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  if (!s) return '';
  if (/^\d{8,14}$/.test(s)) {
    const y = s.slice(0, 4);
    const m = s.slice(4, 6);
    const d = s.slice(6, 8);
    const h = s.slice(8, 10) || '00';
    const min = s.slice(10, 12) || '00';
    return `${y}-${m}-${d}T${h}:${min}:00`;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return s;
}

/** "12,345,000원" / "비공개" → 숫자 (파싱 불가 시 0) */
function parsePrice(raw: string | number | undefined): number {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  const digits = raw.replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

function parseNum(raw: string | number | undefined): number | undefined {
  if (raw == null || raw === '') return undefined;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * OnBid PNU → V-World PNU 변환
 * OnBid 산구분(11번째 자리): 0=일반, 1=산
 * V-World 산구분:            1=일반, 2=산
 * 변환하지 않으면 V-World가 조회에 실패하거나(일반), 같은 본번-부번의
 * 다른 필지를 잘못 매칭한다(산 → 일반 지번으로 해석).
 */
function normalizeOnbidPnu(pnu: string): string {
  if (pnu.length !== 19) return pnu;
  const mountain = pnu[10];
  if (mountain === '0' || mountain === '1') {
    return pnu.slice(0, 10) + String(Number(mountain) + 1) + pnu.slice(11);
  }
  return pnu;
}

/**
 * 지오코딩용 주소 생성
 * 목록 응답의 소재지 필드는 읍면동까지만 제공되어, 그대로 지오코딩하면
 * 같은 동의 물건이 전부 동 중심점 한 곳에 쌓인다.
 * 물건명이 "<시도> <시군구> <읍면동> <번지> ..." 형태이므로 번지까지 살려낸다.
 */
function buildAddress(item: OnbidRlstItem): string {
  const base = [item.lctnSdnm, item.lctnSggnm, item.lctnEmdNm]
    .map((v) => (v ?? '').trim())
    .filter(Boolean)
    .join(' ');
  if (!base) return '';

  const nm = String(item.onbidCltrNm ?? '').trim();
  if (nm.startsWith(base)) {
    // 번지(예: "994-6", "산 2-45")까지만 취하고 "제3층 제318호" 등 건물 상세는 버린다.
    // 읍·면 지역은 소재지 필드가 읍면까지만이라 물건명에 리(里)가 한 단계 더
    // 붙는다("... 대관령면 횡계리 산 455"). 리를 건너뛰지 않으면 번지 추출이
    // 실패해 면 중심점으로 지오코딩된다(실측 최대 4.7km 오차).
    const m = nm.slice(base.length).trim().match(/^(?:([가-힣]+리)\s+)?(산\s*)?(\d+(?:-\d+)?)/);
    if (m) {
      const ri = m[1] ? `${m[1]} ` : '';
      const san = m[2] ? '산' : '';
      return `${base} ${ri}${san}${m[3]}`;
    }
  }
  return base;
}

/** 온비드 물건 상세 페이지 URL */
function buildOnbidUrl(item: OnbidRlstItem): string {
  const cltrNo = item.onbidCltrno ?? item.cltrMngNo;
  const cdtnNo = item.pbctCdtnNo;
  if (!cltrNo || !cdtnNo) return '';
  return `https://www.onbid.co.kr/op/cta/cltrdtl/collateralRealEstateDetail.do?cltrNo=${cltrNo}&pbctCdtnNo=${cdtnNo}`;
}

function mapItem(item: OnbidRlstItem): AuctionProperty {
  const landArea = parseNum(item.landSqms);
  const bldArea = parseNum(item.bldSqms);
  return {
    id: String(item.cltrMngNo ?? ''),
    pbctCdtnNo: item.pbctCdtnNo != null ? String(item.pbctCdtnNo) : undefined,
    // 물건명에 후행 공백이 붙어 오는 경우가 있다
    name: String(item.onbidCltrNm ?? '').trim(),
    address: buildAddress(item),
    disposalMethod: String(item.dspsMthodNm ?? ''),
    minBidPrice: parsePrice(item.lowstBidPrcIndctCont),
    appraisalValue: parsePrice(item.apslEvlAmt),
    bidStartDate: parseOnbidDate(item.cltrBidBgngDt),
    bidEndDate: parseOnbidDate(item.cltrBidEndDt),
    // 용도 중/소분류만 사용한다. 대분류는 이 서비스에서 항상 "부동산"이라
    // 정보량이 없을뿐더러 카테고리 제외 키워드 "동산"에 오탐된다.
    itemType: [item.cltrUsgMclsCtgrNm, item.cltrUsgSclsCtgrNm].filter(Boolean).join(' '),
    status: String(item.pbctStatNm ?? ''),
    onbidUrl: buildOnbidUrl(item),
    imageUrls: item.thnlImgUrlAdr ? [item.thnlImgUrlAdr] : [],
    // 지번PNU는 OnBid 산구분 체계이므로 V-World 체계로 변환해서 넘긴다
    pnu: item.ltnoPnu ? normalizeOnbidPnu(String(item.ltnoPnu)) : undefined,
    area: landArea ?? bldArea,
    buildingArea: bldArea,
    // 서버가 지분물건 여부를 직접 알려준다 (구 GOODS_NM 정규식 추정 대체)
    isShare: item.alcYn === 'Y',
  };
}

/** JSON 응답에서 items 배열 추출 (게이트웨이가 단건일 때 객체로 주는 경우 대응) */
function normalizeItems(body: unknown): OnbidRlstItem[] {
  const b = body as { items?: { item?: unknown } | unknown[] } | undefined;
  if (!b?.items) return [];
  const raw = Array.isArray(b.items)
    ? b.items
    : (b.items as { item?: unknown }).item;
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : [raw]) as OnbidRlstItem[];
}

/**
 * 응답 header/body 추출
 * 게이트웨이는 { header, body }를 최상위에 둔다 (구 API처럼 response로 감싸지 않음).
 * 혹시 모를 래핑 변화에 대비해 response 하위도 함께 확인한다.
 */
function extractHeader(json: Record<string, unknown>): Record<string, unknown> | undefined {
  const wrapped = (json?.response as Record<string, unknown> | undefined)?.header;
  return (wrapped ?? json?.header) as Record<string, unknown> | undefined;
}

function extractBody(json: Record<string, unknown>): Record<string, unknown> | undefined {
  const wrapped = (json?.response as Record<string, unknown> | undefined)?.body;
  return (wrapped ?? json?.body) as Record<string, unknown> | undefined;
}

/** 조회 결과 0건 — 에러가 아니라 빈 결과로 취급 */
const NODATA_CODE = '03';

/** 정상 결과코드 */
function isOkCode(code: string): boolean {
  return code === '00' || code === '0';
}

/**
 * 에러 감지 — 응답이 세 가지 형태로 내려온다.
 *  1) { OpenAPI_ServiceResponse: { cmmMsgHeader } }  게이트웨이 인증 오류
 *  2) { result: { resultCode, resultMsg } }          KAMCO 서비스 오류 / 0건
 *  3) { header: { resultCode: "00" }, body: {...} }  정상
 * @returns 에러 메시지 | 'NODATA'(0건) | null(정상)
 */
function checkApiError(json: Record<string, unknown>): string | null {
  const svcResp = json?.OpenAPI_ServiceResponse as Record<string, unknown> | undefined;
  if (svcResp?.cmmMsgHeader) {
    const hdr = svcResp.cmmMsgHeader as Record<string, unknown>;
    return String(hdr.returnAuthMsg ?? hdr.errMsg ?? 'UNKNOWN_API_ERROR');
  }

  for (const src of [json?.result as Record<string, unknown> | undefined, extractHeader(json)]) {
    if (src?.resultCode == null) continue;
    const code = String(src.resultCode);
    if (code === NODATA_CODE) return 'NODATA';
    if (!isOkCode(code)) return String(src.resultMsg ?? `ERROR_CODE_${code}`);
  }
  return null;
}

interface RawPage {
  items: OnbidRlstItem[];
  totalCount: number;
  apiError?: string;
}

async function fetchListPage(
  params: AuctionSearchParams,
  pvctTrgtYn: 'Y' | 'N',
): Promise<RawPage> {
  const page = params.page ?? 1;
  const size = params.size ?? 20;

  const query = new URLSearchParams({
    serviceKey: ONBID_API_KEY,
    pageNo: String(page),
    numOfRows: String(size),
    resultType: 'json',
    prptDivCd: PRPT_DIV_ALL,
  });
  if (params.disposalMethodCode) query.set('dspsMthodCd', params.disposalMethodCode);
  if (params.regionKeyword) {
    // 정식 시도명으로 변환 (매핑에 없으면 입력값 그대로 시도)
    query.set('lctnSdnm', SIDO_MAP[params.regionKeyword] ?? params.regionKeyword);
  }
  query.set('pvctTrgtYn', pvctTrgtYn);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/${LIST_OP}?${query.toString()}`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        items: [],
        totalCount: 0,
        apiError: `OnBid HTTP ${res.status} ${res.statusText}`,
      };
    }

    const text = await res.text();
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(text);
    } catch {
      // 게이트웨이가 XML 에러를 돌려준 경우 원문 일부를 노출
      return { items: [], totalCount: 0, apiError: `INVALID_JSON: ${text.slice(0, 200)}` };
    }

    const apiError = checkApiError(json);
    if (apiError === 'NODATA') return { items: [], totalCount: 0 };
    if (apiError) return { items: [], totalCount: 0, apiError };

    const body = extractBody(json);
    return {
      items: normalizeItems(body),
      totalCount: Number(body?.totalCount) || 0,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getKamcoAuctionList(
  params: AuctionSearchParams,
): Promise<{ properties: AuctionProperty[]; totalCount: number; apiError?: string }> {
  const page = params.page ?? 1;
  const size = params.size ?? 20;
  const regionKey = params.regionKeyword ?? '';
  const cacheKey = `auction:kamco:${page}:${size}:${params.disposalMethodCode ?? ''}:${regionKey}`;
  const cached = getCached<{ properties: AuctionProperty[]; totalCount: number }>(cacheKey);
  if (cached) return cached;

  try {
    // pvctTrgtYn(수의계약가능여부)은 이 서비스의 필수 파라미터다.
    // Y/N은 상호배타적이므로 두 번 조회해 합치면 해당 조건의 전체 물건이 된다.
    const [yes, no] = await Promise.all([
      fetchListPage(params, 'Y'),
      fetchListPage(params, 'N'),
    ]);

    // 한쪽이 0건인 것은 정상이므로, 양쪽 모두 실패했을 때만 에러로 본다
    if (yes.apiError && no.apiError) {
      console.error(`[OnBid] API error: ${yes.apiError} (region=${regionKey}, page=${page})`);
      return { properties: [], totalCount: 0, apiError: yes.apiError };
    }

    // 낙찰/취소 물건 제거 + 물건×공매조건 기준 중복 제거
    const seen = new Set<string>();
    const live: OnbidRlstItem[] = [];
    for (const it of [...yes.items, ...no.items]) {
      if (DEAD_STATUS_CODES.has(String(it.pbctStatCd ?? ''))) continue;
      const key = `${it.cltrMngNo}:${it.pbctCdtnNo}`;
      if (seen.has(key)) continue;
      seen.add(key);
      live.push(it);
    }

    const result = {
      properties: live.map(mapItem),
      totalCount: yes.totalCount + no.totalCount,
    };

    setCache(cacheKey, result, TTL.AUCTION);
    return result;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const isAbort = errMsg.includes('aborted') || errMsg.includes('AbortError');
    const detail = isAbort
      ? `${REQUEST_TIMEOUT_MS / 1000}초 timeout 초과 — OnBid API 응답 지연`
      : errMsg;
    console.error(`[OnBid] getKamcoAuctionList 실패 (region=${regionKey}, page=${page}): ${detail}`);
    return { properties: [], totalCount: 0, apiError: detail };
  }
}
