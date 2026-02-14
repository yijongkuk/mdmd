import { create } from 'zustand';
import type { AuctionProperty } from '@/types/auction';
import type { LoadingProgress } from './hooks';

const STORAGE_KEY = 'auction-cache';
const STORAGE_TTL = 24 * 60 * 60 * 1000; // 24시간

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

  /** 캐시에 매물 병합 (새 항목 또는 좌표 업데이트) */
  mergeResults: (properties: AuctionProperty[]) => void;
  /** 로딩 상태 설정 */
  setIsLoading: (v: boolean) => void;
  setLoadingRegion: (v: string) => void;
  setProgress: (v: LoadingProgress | null) => void;
  setInitialFetchDone: (v: boolean) => void;
  setApiError: (v: string | null) => void;
  /** localStorage에 캐시 저장 */
  persistToStorage: () => void;
  /** localStorage에서 캐시 복원 — 성공 시 true */
  hydrateFromStorage: () => boolean;
  /** 캐시 초기화 */
  clearCache: () => void;
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

  mergeResults: (properties) => {
    const { cache } = get();
    let changed = 0;
    for (const p of properties) {
      if (!p.id) continue;
      if (!cache.has(p.id)) {
        cache.set(p.id, p);
        changed++;
      } else {
        const existing = cache.get(p.id)!;
        if (!existing.lat && p.lat) {
          cache.set(p.id, p);
          changed++;
        }
      }
    }
    if (changed > 0) {
      set({ version: get().version + 1 });
    }
  },

  setIsLoading: (v) => set({ isLoading: v }),
  setLoadingRegion: (v) => set({ loadingRegion: v }),
  setProgress: (v) => set({ progress: v }),
  setInitialFetchDone: (v) => set({ initialFetchDone: v }),
  setApiError: (v) => set({ apiError: v }),

  persistToStorage: () => {
    try {
      const { cache } = get();
      // 좌표 있는 매물만 저장 (좌표 없는 건 지도에 안 보이고 어차피 재지오코딩 필요)
      const geocoded = Array.from(cache.entries()).filter(([, p]) => p.lat != null);
      const payload = JSON.stringify({ timestamp: Date.now(), data: geocoded });
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
          lat: p.lat, lng: p.lng, source: p.source,
        }] as [string, AuctionProperty]);
        const slimPayload = JSON.stringify({ timestamp: Date.now(), data: slim });
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
      const { timestamp, data } = JSON.parse(raw) as {
        timestamp: number;
        data: [string, AuctionProperty][];
      };
      const ageMs = Date.now() - timestamp;
      if (ageMs > STORAGE_TTL) {
        console.log(`[auction-cache] TTL 만료 (${(ageMs / 3600000).toFixed(1)}시간 경과)`);
        localStorage.removeItem(STORAGE_KEY);
        return false;
      }
      const cache = new Map(data);
      console.log(`[auction-cache] ${cache.size}건 복원 (${(ageMs / 60000).toFixed(0)}분 전 저장)`);
      set({ cache, version: get().version + 1, initialFetchDone: true });
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
