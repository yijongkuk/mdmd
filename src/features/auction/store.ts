import { create } from 'zustand';
import type { AuctionProperty } from '@/types/auction';
import type { LoadingProgress } from './hooks';

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

  /** 캐시에 매물 병합 (새 항목 또는 좌표 업데이트) */
  mergeResults: (properties: AuctionProperty[]) => void;
  /** 로딩 상태 설정 */
  setIsLoading: (v: boolean) => void;
  setLoadingRegion: (v: string) => void;
  setProgress: (v: LoadingProgress | null) => void;
  setInitialFetchDone: (v: boolean) => void;
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
  clearCache: () => {
    get().cache.clear();
    set({ version: get().version + 1, initialFetchDone: false });
  },
}));
