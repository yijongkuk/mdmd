import { XMLParser } from 'fast-xml-parser';
import { getCached, setCache, TTL } from './cache';
import type { AuctionProperty, AuctionSearchParams } from '@/types/auction';

const ONBID_API_KEY = process.env.ONBID_API_KEY ?? '';
const BASE_URL = 'http://openapi.onbid.co.kr/openapi/services/KamcoPblsalThingInquireSvc';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

interface OnbidItem {
  CLTR_NM?: string;
  LDNM_ADRS?: string;
  LDNM_PNU?: string;              // 필지고유번호 (PNU)
  DPSL_MTD_NM?: string;
  MIN_BID_PRC?: string | number;
  APSL_ASES_AVG_AMT?: string | number; // 감정평가액(평균)
  PBCT_BEGN_DTM?: string | number;  // yyyyMMddHHmmss or yyyy-MM-dd HH:mm
  PBCT_CLS_DTM?: string | number;
  CLTR_MNMT_NO?: string | number;
  CTGR_FULL_NM?: string;
  PBCT_CDTN_NM?: string;
  CLTR_HMPG_ADRS?: string;
  GOODS_NM?: string; // 면적 등 상세 (예: "전 287 ㎡")
}

/**
 * OnBid 날짜 문자열 → ISO 형식 변환
 * 입력 예: "20240315", "2024-03-15 10:00", "2024-03-15 10:00:00.0", "", undefined
 */
function parseOnbidDate(raw: string | number | undefined): string {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  if (!s) return '';
  // yyyyMMdd or yyyyMMddHHmmss
  if (/^\d{8,14}$/.test(s)) {
    const y = s.slice(0, 4);
    const m = s.slice(4, 6);
    const d = s.slice(6, 8);
    const h = s.slice(8, 10) || '00';
    const min = s.slice(10, 12) || '00';
    return `${y}-${m}-${d}T${h}:${min}:00`;
  }
  // Already has dashes (yyyy-MM-dd ...) — normalize
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return s; // fallback: return as-is
}

/**
 * GOODS_NM에서 면적(㎡) 파싱
 * 예: "전 287 ㎡" → 287, "대 30.61 ㎡ 지분(...)" → 30.61
 */
function parseAreaFromGoods(goodsNm: string | undefined): number | undefined {
  if (!goodsNm) return undefined;
  const match = goodsNm.match(/([\d,.]+)\s*㎡/);
  if (match) return parseFloat(match[1].replace(',', ''));
  return undefined;
}

/**
 * OnBid PNU → V-World PNU 변환
 * OnBid 산구분: 0=일반, 1=산
 * V-World 산구분: 1=일반, 2=산
 * 변환: +1
 */
function normalizeOnbidPnu(pnu: string): string {
  if (pnu.length !== 19) return pnu;
  const mountain = pnu[10];
  if (mountain === '0' || mountain === '1') {
    return pnu.slice(0, 10) + String(Number(mountain) + 1) + pnu.slice(11);
  }
  return pnu;
}

function mapItem(item: OnbidItem): AuctionProperty {
  return {
    id: String(item.CLTR_MNMT_NO ?? ''),
    name: String(item.CLTR_NM ?? ''),
    address: String(item.LDNM_ADRS ?? ''),
    disposalMethod: String(item.DPSL_MTD_NM ?? ''),
    minBidPrice: Number(item.MIN_BID_PRC) || 0,
    appraisalValue: Number(item.APSL_ASES_AVG_AMT) || 0,
    bidStartDate: parseOnbidDate(item.PBCT_BEGN_DTM),
    bidEndDate: parseOnbidDate(item.PBCT_CLS_DTM),
    itemType: String(item.CTGR_FULL_NM ?? ''),
    status: String(item.PBCT_CDTN_NM ?? ''),
    onbidUrl: String(item.CLTR_HMPG_ADRS ?? ''),
    pnu: item.LDNM_PNU ? normalizeOnbidPnu(String(item.LDNM_PNU)) : undefined,
    area: parseAreaFromGoods(item.GOODS_NM),
  };
}

function normalizeItems(body: { items?: { item?: OnbidItem | OnbidItem[] } }): OnbidItem[] {
  const raw = body?.items?.item;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

/** OnBid XML 에러 응답 감지 — 공공 API는 HTTP 200이지만 body에 에러 포함 */
function checkXmlError(parsed: Record<string, unknown>): string | null {
  const svcResp = parsed?.OpenAPI_ServiceResponse as Record<string, unknown> | undefined;
  if (svcResp?.cmmMsgHeader) {
    const hdr = svcResp.cmmMsgHeader as Record<string, unknown>;
    return String(hdr.returnAuthMsg ?? hdr.errMsg ?? 'UNKNOWN_API_ERROR');
  }
  const header = (parsed?.response as Record<string, unknown>)?.header as Record<string, unknown> | undefined;
  if (header) {
    const code = String(header.resultCode ?? '');
    // XML 파서가 '00'을 숫자 0으로 변환할 수 있음 → '0'도 정상
    if (code && code !== '00' && code !== '0') {
      return String(header.resultMsg ?? `ERROR_CODE_${code}`);
    }
  }
  return null;
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
    const query = new URLSearchParams({
      serviceKey: ONBID_API_KEY,
      pageNo: String(page),
      numOfRows: String(size),
    });
    if (params.disposalMethodCode) {
      query.set('DPSL_MTD_CD', params.disposalMethodCode);
    }
    if (params.regionKeyword) {
      query.set('CLTR_NM', params.regionKeyword);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);
    const res = await fetch(`${BASE_URL}/getKamcoPbctCltrList?${query.toString()}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errMsg = `OnBid HTTP ${res.status} ${res.statusText} (region=${regionKey}, page=${page})`;
      console.error(errMsg);
      return { properties: [], totalCount: 0, apiError: errMsg };
    }

    const xml = await res.text();
    const parsed = parser.parse(xml);

    // 공공 API XML 에러 응답 감지
    const xmlError = checkXmlError(parsed);
    if (xmlError) {
      console.error(`OnBid API error: ${xmlError} (region=${regionKey}, page=${page})`);
      return { properties: [], totalCount: 0, apiError: xmlError };
    }

    const body = parsed?.response?.body;
    const items = normalizeItems(body);
    const totalCount = Number(body?.totalCount) || 0;

    const result = {
      properties: items.map(mapItem),
      totalCount,
    };

    setCache(cacheKey, result, TTL.AUCTION);
    return result;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`OnBid getKamcoAuctionList error: ${errMsg} (region=${regionKey}, page=${page})`);
    return { properties: [], totalCount: 0, apiError: errMsg };
  }
}

export async function getInstitutionalAuctionList(
  params: AuctionSearchParams,
): Promise<{ properties: AuctionProperty[]; totalCount: number }> {
  const page = params.page ?? 1;
  const size = params.size ?? 20;
  const cacheKey = `auction:inst:${page}:${size}:${params.disposalMethodCode ?? ''}`;
  const cached = getCached<{ properties: AuctionProperty[]; totalCount: number }>(cacheKey);
  if (cached) return cached;

  try {
    const query = new URLSearchParams({
      serviceKey: ONBID_API_KEY,
      pageNo: String(page),
      numOfRows: String(size),
    });
    if (params.disposalMethodCode) {
      query.set('DPSL_MTD_CD', params.disposalMethodCode);
    }

    const res = await fetch(`${BASE_URL}/getUtlinsttPbctCltrList?${query.toString()}`);
    if (!res.ok) return { properties: [], totalCount: 0 };

    const xml = await res.text();
    const parsed = parser.parse(xml);
    const body = parsed?.response?.body;
    const items = normalizeItems(body);
    const totalCount = Number(body?.totalCount) || 0;

    const result = {
      properties: items.map(mapItem),
      totalCount,
    };

    setCache(cacheKey, result, TTL.AUCTION);
    return result;
  } catch (err) {
    console.error('OnBid getInstitutionalAuctionList error:', err);
    return { properties: [], totalCount: 0 };
  }
}
