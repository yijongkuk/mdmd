import { create } from 'zustand';
import type { AuctionProperty } from '@/types/auction';
import type { LoadingProgress } from './hooks';

const STORAGE_KEY = 'auction-cache';
const STORAGE_TTL = 4 * 60 * 60 * 1000; // 4시간

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
}

export const useAuctionStore = create<AuctionState>((set, get) => ({
  cache: new Map(),
  version: 0,
  initialFetchDone: false,
  isLoading: false,
  loadingRegion: '',
  progress: null,
  apiError: null,

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
      const data = Array.from(cache.entries());
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        timestamp: Date.now(),
        data,
      }));
    } catch { /* quota exceeded 등 무시 */ }
  },

  hydrateFromStorage: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const { timestamp, data } = JSON.parse(raw) as {
        timestamp: number;
        data: [string, AuctionProperty][];
      };
      if (Date.now() - timestamp > STORAGE_TTL) {
        localStorage.removeItem(STORAGE_KEY);
        return false;
      }
      const cache = new Map(data);
      set({ cache, version: get().version + 1, initialFetchDone: true });
      return true;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return false;
    }
  },

  clearCache: () => {
    get().cache.clear();
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
    set({ version: get().version + 1, initialFetchDone: false });
  },
}));
