import { create } from 'zustand';
import type { AuctionProperty, AuctionFilters } from '@/types/auction';
import type { LoadingProgress } from './hooks';
import type { MapType } from '@/components/map/MapControls';

const STORAGE_KEY = 'auction-cache';
const FILTERS_KEY = 'auction-filters';
const SOIL_CACHE_KEY = 'soil-difficulty-cache';
const MAP_TYPE_KEY = 'map-type';
const STORAGE_TTL = 24 * 60 * 60 * 1000; // 1일 — 낙찰/취소 신선도 위해 단축(백그라운드 갱신으로 즉시 표시는 유지)

/**
 * 캐시 스키마 / 좌표 파이프라인 버전.
 *
 * 저장된 물건은 좌표를 그대로 재사용한다(mergeResults가 `existing.lat ?? p.lat`로
 * 보존). 따라서 좌표를 만드는 방식이 바뀌어도 캐시가 살아있는 한 옛 좌표가
 * 계속 쓰인다. 브라우저 하드 새로고침(Ctrl+Shift+R)은 localStorage를 지우지
 * 않으므로 사용자가 스스로 해결할 방법도 없다.
 * 좌표 산출 로직을 바꿀 때 이 값을 올리면 옛 캐시가 자동으로 폐기된다.
 *
 * 2: 차세대 온비드 전환 — PNU 산구분 변환 복구, 물건명에서 번지·리(里) 추출,
 *    본번 0000 PNU 무효 처리, 좌표를 PNU 기준으로 키잉
 * 3: 지역 커버리지 수정 — 전남(전남광주통합특별시) 시도명 오류로 7,552건,
 *    울산 항목 누락으로 1,678건이 통째로 빠져 있었다. 기존 캐시는 이 지역들이
 *    없는 불완전한 목록이므로 폐기하고 다시 수집한다.
 */
const CACHE_VERSION = 3;
const VIEWED_KEY = 'auction-viewed-ids';
const SOIL_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7일

/**
 * 주소(LDNM_ADRS)로 시도(REGION_PAGES의 지역명) 판별 — reconcileOnbid의 부분 prune용.
 * OnBid 주소는 정식 명칭("충청북도…")이라 약칭("충북")과 둘 다 매칭.
 */
function regionOfAddress(addr: string | undefined): string | null {
  if (!addr) return null;
  const a = addr.trimStart();
  if (a.startsWith('서울')) return '서울';
  if (a.startsWith('경기')) return '경기';
  if (a.startsWith('인천')) return '인천';
  if (a.startsWith('부산')) return '부산';
  if (a.startsWith('대구')) return '대구';
  if (a.startsWith('대전')) return '대전';
  if (a.startsWith('세종')) return '세종';
  if (a.startsWith('강원')) return '강원';
  if (a.startsWith('충청북도') || a.startsWith('충북')) return '충북';
  if (a.startsWith('충청남도') || a.startsWith('충남')) return '충남';
  if (a.startsWith('전라북도') || a.startsWith('전북')) return '전북';
  if (a.startsWith('전라남도') || a.startsWith('전남')) return '전남';
  if (a.startsWith('경상북도') || a.startsWith('경북')) return '경북';
  if (a.startsWith('경상남도') || a.startsWith('경남')) return '경남';
  if (a.startsWith('제주')) return '제주';
  return null; // 울산 등 미수집 지역 → prune 대상 아님(안전)
}

export const DEFAULT_FILTERS: AuctionFilters = {
  priceRange: [0, Number.MAX_SAFE_INTEGER],
  bidPriceRange: [0, Number.MAX_SAFE_INTEGER],
  areaRange: [0, Number.MAX_SAFE_INTEGER],
  disposalMethods: [],
  landTypes: [],
  region: 'all',
  searchQuery: '',
  dataSources: [],
  category: 'land',
  excludeLowUnitPrice: true,
  excludeDifficultSoil: false,
  excludeShareProperties: true,
};

type SoilDifficulty = 'good' | 'moderate' | 'difficult';

/** localStorage에서 본 물건 ID 복원 */
function loadPersistedViewedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(VIEWED_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as string[];
      return new Set(arr);
    }
  } catch { /* ignore */ }
  return new Set();
}

/** localStorage에서 토양 캐시 복원 */
function loadPersistedSoilCache(): Record<string, SoilDifficulty> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SOIL_CACHE_KEY);
    if (raw) {
      const { timestamp, data } = JSON.parse(raw) as { timestamp: number; data: Record<string, SoilDifficulty> };
      if (Date.now() - timestamp < SOIL_CACHE_TTL) return data;
      localStorage.removeItem(SOIL_CACHE_KEY);
    }
  } catch { /* ignore */ }
  return {};
}

/** localStorage에서 지도유형 복원 */
function loadPersistedMapType(): MapType {
  if (typeof window === 'undefined') return 'roadmap';
  try {
    const raw = localStorage.getItem(MAP_TYPE_KEY);
    if (raw === 'roadmap' || raw === 'skyview' || raw === 'hybrid') return raw;
  } catch { /* ignore */ }
  return 'roadmap';
}

/** localStorage에서 필터 복원 — 초기화 전까지 유지 */
function loadPersistedFilters(): AuctionFilters {
  if (typeof window === 'undefined') return { ...DEFAULT_FILTERS };
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AuctionFilters>;
      return { ...DEFAULT_FILTERS, ...parsed };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_FILTERS };
}

interface AuctionState {
  /** 수집된 매물 캐시 (id → property) */
  cache: Map<string, AuctionProperty>;
  /** React 리렌더 트리거용 버전 */
  version: number;
  /** 초기 수집 완료 여부 */
  initialFetchDone: boolean;
  /** 로딩 상태 */
  isLoading: boolean;
  loadingRegion: string;
  progress: LoadingProgress | null;
  /** API 에러 메시지 (OnBid 한도 초과 등) */
  apiError: string | null;
  /** retry 트리거 카운터 */
  retryCounter: number;
  /** 필터 상태 (페이지 이동 후에도 유지) */
  filters: AuctionFilters;
  /** 토양 난이도 캐시 (PNU → difficulty) */
  soilDifficultyMap: Record<string, SoilDifficulty>;
  /** 지도 유형 (페이지 이동 후에도 유지) */
  mapType: MapType;
  /** 이미 본 물건 ID (선택하여 상세 확인한 것) */
  viewedIds: Set<string>;

  /** 캐시에 매물 병합 (새 항목 또는 좌표 업데이트) */
  mergeResults: (properties: AuctionProperty[]) => void;
  /** OnBid 최신 목록과 대조 — 요청 성공 지역에서 사라진(낙찰/취소) OnBid 물건 제거 */
  reconcileOnbid: (freshIds: Set<string>, succeededRegions: Set<string>) => void;
  /** 로딩 상태 설정 */
  setIsLoading: (v: boolean) => void;
  setLoadingRegion: (v: string) => void;
  setProgress: (v: LoadingProgress | null) => void;
  setInitialFetchDone: (v: boolean) => void;
  setApiError: (v: string | null) => void;
  /** 필터 상태 설정 */
  setFilters: (v: AuctionFilters) => void;
  /** 토양 난이도 캐시 업데이트 */
  setSoilDifficulty: (pnu: string, level: SoilDifficulty) => void;
  /** 지도 유형 설정 */
  setMapType: (type: MapType) => void;
  /** 물건을 "본 것"으로 기록 */
  markViewed: (id: string) => void;
  /** localStorage에 캐시 저장 */
  persistToStorage: () => void;
  /** localStorage에서 캐시 복원 — 성공 시 true */
  hydrateFromStorage: () => boolean;
  /** 캐시 초기화 */
  clearCache: () => void;
  /** localStorage에서 필터 복원 (mount 후 1회) */
  hydrateFilters: () => void;
  /** 캐시 초기화 + 에러 리셋 + 재수집 트리거 */
  triggerRetry: () => void;
}

export const useAuctionStore = create<AuctionState>((set, get) => ({
  cache: new Map(),
  version: 0,
  initialFetchDone: false,
  isLoading: false,
  loadingRegion: '',
  progress: null,
  apiError: null,
  retryCounter: 0,
  filters: { ...DEFAULT_FILTERS },  // SSR 일관성 — mount 후 hydrateFilters()로 복원
  soilDifficultyMap: loadPersistedSoilCache(),
  mapType: loadPersistedMapType(),
  viewedIds: loadPersistedViewedIds(),

  mergeResults: (properties) => {
    const { cache } = get();
    let changed = 0;
    for (const p of properties) {
      if (!p.id) continue;
      const existing = cache.get(p.id);
      if (!existing) {
        cache.set(p.id, p);
        changed++;
      } else {
        // 최신 데이터(상태·가격·지분여부 등)로 갱신하되, 이미 확보한 좌표/PNU는 보존
        cache.set(p.id, {
          ...p,
          lat: existing.lat ?? p.lat,
          lng: existing.lng ?? p.lng,
          pnu: existing.pnu ?? p.pnu,
        });
        changed++;
      }
    }
    if (changed > 0) {
      set({ version: get().version + 1 });
    }
  },

  reconcileOnbid: (freshIds, succeededRegions) => {
    const { cache } = get();
    let removed = 0;
    for (const [id, p] of cache) {
      // OnBid 물건만 대상 — 폐교 등 다른 소스는 건드리지 않음
      if (p.source !== 'onbid' || freshIds.has(id)) continue;
      // 주소로 지역(시도) 판별 — 요청이 성공한 지역의 물건만 제거(부분 실패 안전)
      const region = regionOfAddress(p.address);
      if (region && succeededRegions.has(region)) {
        cache.delete(id);
        removed++;
      }
    }
    if (removed > 0) {
      set({ version: get().version + 1 });
      console.log(`[auction-cache] OnBid 목록에서 사라진 ${removed}건 제거 (낙찰/취소된 물건)`);
    }
  },

  setIsLoading: (v) => set({ isLoading: v }),
  setLoadingRegion: (v) => set({ loadingRegion: v }),
  setProgress: (v) => set({ progress: v }),
  setInitialFetchDone: (v) => set({ initialFetchDone: v }),
  setApiError: (v) => set({ apiError: v }),
  setFilters: (v) => {
    set({ filters: v });
    try { localStorage.setItem(FILTERS_KEY, JSON.stringify(v)); } catch { /* ignore */ }
  },
  setSoilDifficulty: (pnu, level) => {
    const map = { ...get().soilDifficultyMap, [pnu]: level };
    set({ soilDifficultyMap: map });
    try {
      localStorage.setItem(SOIL_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: map }));
    } catch { /* ignore */ }
  },
  setMapType: (type) => {
    set({ mapType: type });
    try { localStorage.setItem(MAP_TYPE_KEY, type); } catch { /* ignore */ }
  },
  markViewed: (id) => {
    const { viewedIds } = get();
    if (viewedIds.has(id)) return;
    const next = new Set(viewedIds);
    next.add(id);
    set({ viewedIds: next });
    try { localStorage.setItem(VIEWED_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
  },

  persistToStorage: () => {
    try {
      const { cache } = get();
      // 좌표 있는 매물만 저장 (좌표 없는 건 지도에 안 보이고 어차피 재지오코딩 필요)
      const geocoded = Array.from(cache.entries()).filter(([, p]) => p.lat != null);
      const payload = JSON.stringify({ version: CACHE_VERSION, timestamp: Date.now(), data: geocoded });
      localStorage.setItem(STORAGE_KEY, payload);
      console.log(`[auction-cache] ${geocoded.length}건 저장 (${(payload.length / 1024).toFixed(0)}KB)`);
    } catch (e) {
      console.warn('[auction-cache] localStorage 저장 실패:', e);
      // quota 초과 시 기존 캐시 정리 후 재시도
      try {
        localStorage.removeItem(STORAGE_KEY);
        const { cache } = get();
        const geocoded = Array.from(cache.entries()).filter(([, p]) => p.lat != null);
        // 필수 필드만 남겨 용량 축소
        const slim = geocoded.map(([id, p]) => [id, {
          id: p.id, name: p.name, address: p.address,
          disposalMethod: p.disposalMethod,
          minBidPrice: p.minBidPrice, appraisalValue: p.appraisalValue,
          bidStartDate: p.bidStartDate, bidEndDate: p.bidEndDate,
          itemType: p.itemType, status: p.status, onbidUrl: p.onbidUrl,
          pnu: p.pnu, area: p.area, officialLandPrice: p.officialLandPrice,
          lat: p.lat, lng: p.lng, isShare: p.isShare, source: p.source,
        }] as [string, AuctionProperty]);
        const slimPayload = JSON.stringify({ version: CACHE_VERSION, timestamp: Date.now(), data: slim });
        localStorage.setItem(STORAGE_KEY, slimPayload);
        console.log(`[auction-cache] slim 모드 ${slim.length}건 저장 (${(slimPayload.length / 1024).toFixed(0)}KB)`);
      } catch {
        console.warn('[auction-cache] slim 저장도 실패 — 캐시 비활성화');
      }
    }
  },

  hydrateFromStorage: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        console.log('[auction-cache] localStorage에 캐시 없음');
        return false;
      }
      const { version, timestamp, data } = JSON.parse(raw) as {
        version?: number;
        timestamp: number;
        data: [string, AuctionProperty][];
      };
      // 좌표 산출 방식이 바뀌었으면 저장된 좌표를 신뢰할 수 없다
      if (version !== CACHE_VERSION) {
        console.log(`[auction-cache] 캐시 버전 불일치 (저장 ${version ?? '없음'} / 현재 ${CACHE_VERSION}) — 폐기하고 재수집`);
        localStorage.removeItem(STORAGE_KEY);
        return false;
      }
      const ageMs = Date.now() - timestamp;
      if (ageMs > STORAGE_TTL) {
        console.log(`[auction-cache] TTL 만료 (${(ageMs / 3600000).toFixed(1)}시간 경과)`);
        localStorage.removeItem(STORAGE_KEY);
        return false;
      }
      const cache = new Map(data);
      console.log(`[auction-cache] ${cache.size}건 복원 (${(ageMs / 60000).toFixed(0)}분 전 저장) — 백그라운드 갱신 진행`);
      // initialFetchDone은 설정하지 않음: 캐시는 즉시 표시용이고,
      // 호출부에서 OnBid 최신 데이터로 백그라운드 갱신(낙찰/취소 제거)을 계속 진행한다.
      set({ cache, version: get().version + 1 });
      return true;
    } catch (e) {
      console.warn('[auction-cache] 복원 실패:', e);
      localStorage.removeItem(STORAGE_KEY);
      return false;
    }
  },

  clearCache: () => {
    get().cache.clear();
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
    set({ version: get().version + 1, initialFetchDone: false });
  },

  hydrateFilters: () => {
    const persisted = loadPersistedFilters();
    set({ filters: persisted });
  },

  triggerRetry: () => {
    const s = get();
    s.cache.clear();
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
    set({
      version: s.version + 1,
      initialFetchDone: false,
      apiError: null,
      retryCounter: s.retryCounter + 1,
    });
  },
}));
