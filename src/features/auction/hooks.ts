'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { AuctionProperty } from '@/types/auction';
import type { MapBounds } from '@/types/land';
import { fetchAuctionProperties } from './services';
import { useAuctionStore } from './store';

/**
 * 지도 중심 우선 로딩 + 진행률 표시:
 * 1) 전 지역 skipGeocode → 목록 수집 (진행률 표시)
 * 2) 좌표 변환 — V-World PNU + Kakao 동시 병렬 처리
 * 3) 모든 로딩 완료 시 오버레이 해제
 *
 * Zustand 글로벌 스토어로 데이터 유지 — 페이지 이동 후에도 재수집 안 함
 */

const REGION_PAGES: { region: string; maxPages: number }[] = [
  { region: '서울', maxPages: 4 },
  { region: '경기', maxPages: 10 },
  { region: '인천', maxPages: 3 },
  { region: '부산', maxPages: 3 },
  { region: '대구', maxPages: 2 },
  { region: '대전', maxPages: 2 },
  { region: '세종', maxPages: 1 },
  { region: '강원', maxPages: 5 },
  { region: '충북', maxPages: 3 },
  { region: '충남', maxPages: 4 },
  { region: '전북', maxPages: 3 },
  { region: '전남', maxPages: 4 },
  { region: '경북', maxPages: 5 },
  { region: '경남', maxPages: 5 },
  { region: '제주', maxPages: 2 },
];

/** 지역별 대략적 중심 좌표 */
const REGION_CENTERS: Record<string, { lat: number; lng: number }> = {
  '서울': { lat: 37.5665, lng: 126.978 },
  '경기': { lat: 37.275, lng: 127.01 },
  '인천': { lat: 37.456, lng: 126.705 },
  '부산': { lat: 35.18, lng: 129.076 },
  '대구': { lat: 35.871, lng: 128.601 },
  '대전': { lat: 36.35, lng: 127.385 },
  '세종': { lat: 36.48, lng: 127.0 },
  '강원': { lat: 37.881, lng: 127.73 },
  '충북': { lat: 36.636, lng: 127.492 },
  '충남': { lat: 36.518, lng: 126.8 },
  '전북': { lat: 35.82, lng: 127.15 },
  '전남': { lat: 34.816, lng: 126.463 },
  '경북': { lat: 36.576, lng: 128.506 },
  '경남': { lat: 35.461, lng: 128.213 },
  '제주': { lat: 33.489, lng: 126.498 },
};

/** 좌표 기준으로 가까운 지역 순으로 정렬 */
function getRegionsByDistance(lat: number, lng: number): string[] {
  return Object.entries(REGION_CENTERS)
    .sort(([, a], [, b]) => {
      const da = (lat - a.lat) ** 2 + (lng - a.lng) ** 2;
      const db = (lat - b.lat) ** 2 + (lng - b.lng) ** 2;
      return da - db;
    })
    .map(([name]) => name);
}

/** 지역 순서대로 job 빌드 */
function buildJobsSorted(regionOrder: string[]) {
  const pageMap = new Map(REGION_PAGES.map((r) => [r.region, r.maxPages]));
  const jobs: { region: string; page: number }[] = [];
  for (const region of regionOrder) {
    const maxPages = pageMap.get(region) ?? 0;
    for (let page = 1; page <= maxPages; page++) {
      jobs.push({ region, page });
    }
  }
  return jobs;
}

/** 동시성 제한 병렬 실행 */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  onResult?: (result: T, index: number) => void,
): Promise<T[]> {
  const results: T[] = [];
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      const result = await tasks[i]();
      results[i] = result;
      onResult?.(result, i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}

/** OnBid 주소 정제 — 지오코더가 인식 못하는 부가 텍스트 제거 */
function cleanAddress(addr: string): string {
  return addr
    .replace(/\s*외\s*\d+\s*필지.*$/, '')   // "외 1필지" 등 제거
    .replace(/\s*일원\s*$/, '')              // "일원" 제거
    .replace(/\s*일대\s*$/, '')              // "일대" 제거
    .replace(/\([^)]*\)\s*$/, '')            // 끝 괄호 내용 제거
    .trim();
}

/** Kakao SDK services 로드 대기 */
async function waitForKakaoServices(timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.kakao?.maps?.services) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

/** Kakao address 응답에서 PNU 19자리 조합 */
function buildPnuFromKakaoAddress(addr: {
  b_code: string;
  mountain_yn: string;
  main_address_no: string;
  sub_address_no: string;
}): string | undefined {
  const bCode = addr.b_code?.trim();
  if (!bCode || bCode.length !== 10) return undefined;

  const mainNo = parseInt(addr.main_address_no, 10);
  if (!mainNo || mainNo <= 0) return undefined;

  const mountainFlag = addr.mountain_yn === 'Y' ? '2' : '1';
  const mainPadded = String(mainNo).padStart(4, '0');
  const subNo = parseInt(addr.sub_address_no, 10) || 0;
  const subPadded = String(subNo).padStart(4, '0');

  const pnu = `${bCode}${mountainFlag}${mainPadded}${subPadded}`;
  if (pnu.length !== 19 || !/^\d{19}$/.test(pnu)) return undefined;
  return pnu;
}

/** Kakao Geocoder.addressSearch를 Promise로 래핑 — PNU도 추출 */
function kakaoGeocode(
  geocoder: InstanceType<typeof window.kakao.maps.services.Geocoder>,
  address: string,
): Promise<{ lat: number; lng: number; pnu?: string } | null> {
  return new Promise((resolve) => {
    geocoder.addressSearch(cleanAddress(address), (result, status) => {
      if (status === window.kakao.maps.services.Status.OK && result.length > 0) {
        const r = result[0];
        const pnu = r.address ? buildPnuFromKakaoAddress(r.address) : undefined;
        resolve({ lat: parseFloat(r.y), lng: parseFloat(r.x), pnu });
      } else {
        resolve(null);
      }
    });
  });
}

export interface LoadingProgress {
  phase: string;
  completed: number;
  total: number;
  propertyCount: number;
}

/** geocode-batch 서버 호출 — 결과를 geocodeResults에 병합 */
async function fetchGeocodeBatch(
  items: { address: string; pnu?: string }[],
  geocodeResults: Record<string, { lat: number; lng: number }>,
): Promise<void> {
  try {
    const res = await fetch('/api/geocode-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.results) Object.assign(geocodeResults, data.results);
    }
  } catch { /* skip failed batch */ }
}

export function useAuctionProperties(
  bounds: MapBounds | null,
  enabled: boolean,
  zoomLevel?: number,
) {
  const store = useAuctionStore();
  const retryCounter = useAuctionStore((s) => s.retryCounter);
  const fetchingRef = useRef(false);

  useEffect(() => {
    // 항상 최신 store 상태를 읽어야 페이지 재진입 시 중복 fetch 방지
    const currentState = useAuctionStore.getState();
    if (!enabled || currentState.initialFetchDone || fetchingRef.current) return;

    // localStorage에서 캐시 복원 시도 — 성공하면 API 호출 스킵
    if (currentState.hydrateFromStorage()) {
      fetchingRef.current = false;
      return;
    }

    fetchingRef.current = true;
    currentState.setInitialFetchDone(true);
    currentState.setIsLoading(true);

    // 지도 중심 좌표 기준 지역 정렬
    const centerLat = bounds ? (bounds.sw.lat + bounds.ne.lat) / 2 : 37.5385;
    const centerLng = bounds ? (bounds.sw.lng + bounds.ne.lng) / 2 : 127.0823;
    const regionOrder = getRegionsByDistance(centerLat, centerLng);
    const allJobs = buildJobsSorted(regionOrder);
    const totalJobs = allJobs.length;

    // ── 폐교 유휴부지: 백그라운드 병렬 (OnBid 로딩을 블록하지 않음) ──
    const fetchClosedSchools = async () => {
      try {
        // 1) 목록 즉시 로드 (좌표 없이)
        const listRes = await fetch('/api/closed-schools');
        if (listRes.ok) {
          const listData = await listRes.json();
          if (Array.isArray(listData.properties)) {
            store.mergeResults(listData.properties);
          }
        }
        // 2) 지오코딩 (서버 캐시 히트 시 즉시, 미히트 시 수분 소요)
        const geoRes = await fetch('/api/closed-schools?geocode=true');
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          if (Array.isArray(geoData.properties)) {
            store.mergeResults(geoData.properties);
          }
        }
      } catch { /* 폐교 데이터 실패 시 무시 — OnBid 로딩에 영향 없음 */ }
    };

    (async () => {
      try {
        // 폐교 데이터를 백그라운드로 시작 (await 하지 않음)
        const closedSchoolPromise = fetchClosedSchools();

        // Kakao SDK를 Phase 1 도중 미리 로딩 시작
        const kakaoReadyPromise = waitForKakaoServices();

        // ── Phase 1: OnBid 매물 수집 (동시성 5, 기존 3 → 약 40% 단축) ──
        let phase1Done = 0;
        store.setProgress({ phase: '매물 목록 수집 중', completed: 0, total: totalJobs, propertyCount: 0 });
        const t0 = performance.now();

        let firstApiError: string | null = null;
        const phase1Tasks = allJobs.map(({ region, page }) => () =>
          fetchAuctionProperties(null, {
            page, size: 1000, source: 'kamco',
            regionKeyword: region, skipGeocode: true,
          }).catch(() => ({ properties: [] as AuctionProperty[], totalCount: 0, page, pageSize: 1000 }))
        );

        await runWithConcurrency(phase1Tasks, 5, (r) => {
          // API 에러 감지 (OnBid 한도 초과, 키 오류 등)
          if ('apiError' in r && (r as { apiError?: string }).apiError && !firstApiError) {
            firstApiError = (r as { apiError?: string }).apiError!;
            store.setApiError(firstApiError);
          }
          const tagged = r.properties.map((p) => ({ ...p, source: 'onbid' as const }));
          store.mergeResults(tagged);
          phase1Done++;
          store.setProgress({
            phase: firstApiError ? `API 오류: ${firstApiError}` : '매물 목록 수집 중',
            completed: phase1Done,
            total: totalJobs,
            propertyCount: store.cache.size,
          });
        });

        console.log(`[perf] Phase 1: ${((performance.now() - t0) / 1000).toFixed(1)}s — ${store.cache.size}건`);

        // ── Phase 2: 좌표 변환 (V-World PNU + Kakao 동시 병렬) ──
        const toGeocode: { id: string; address: string; pnu?: string }[] = [];
        for (const [id, p] of store.cache) {
          if (p.lat == null && p.address && p.source !== 'closed_school') {
            toGeocode.push({ id, address: p.address, pnu: p.pnu });
          }
        }

        if (toGeocode.length > 0) {
          const geocodeResults: Record<string, { lat: number; lng: number }> = {};
          const kakaoPnuMap: Record<string, string> = {};

          // 주소별 중복 제거
          const uniqueByAddr = [...new Map(toGeocode.map((t) => [t.address, t])).values()];
          const withPnu = uniqueByAddr.filter((t) => t.pnu);
          const withoutPnu = uniqueByAddr.filter((t) => !t.pnu);
          const totalToGeocode = uniqueByAddr.length;
          let geocodeDone = 0;

          store.setProgress({
            phase: '좌표 변환 중',
            completed: 0,
            total: totalToGeocode,
            propertyCount: store.cache.size,
          });

          const t1 = performance.now();

          // ── Phase 2a + 2b: V-World PNU와 Kakao를 동시 병렬 실행 ──
          await Promise.all([
            // 2a: PNU → V-World 필지 경계 (배치 2개 동시, 기존 순차 → 약 50% 단축)
            (async () => {
              if (withPnu.length === 0) return;
              const pnuItems = [...new Map(
                withPnu.map((t) => [t.address, { address: t.address, pnu: t.pnu }]),
              ).values()];

              const batchSize = 50;
              const batches: (typeof pnuItems)[] = [];
              for (let i = 0; i < pnuItems.length; i += batchSize) {
                batches.push(pnuItems.slice(i, i + batchSize));
              }

              // 배치 2개씩 동시 실행 (V-World 부하 제한)
              await runWithConcurrency(
                batches.map((chunk) => async () => {
                  await fetchGeocodeBatch(chunk, geocodeResults);
                  geocodeDone += chunk.length;
                  store.setProgress({
                    phase: '좌표 변환 중',
                    completed: geocodeDone,
                    total: totalToGeocode,
                    propertyCount: store.cache.size,
                  });
                }),
                2,
              );
            })(),

            // 2b: PNU 없는 항목 → Kakao 클라이언트 지오코딩 (동시성 10, 기존 5 → 2배)
            (async () => {
              if (withoutPnu.length === 0) return;
              const kakaoReady = await kakaoReadyPromise;
              if (!kakaoReady) return;
              const geocoder = new window.kakao.maps.services.Geocoder();

              const tasks = withoutPnu.map((item) => async () => {
                const result = await kakaoGeocode(geocoder, item.address);
                if (result) {
                  geocodeResults[item.address] = result;
                  if (result.pnu) kakaoPnuMap[item.address] = result.pnu;
                }
                geocodeDone++;
                if (geocodeDone % 20 === 0 || geocodeDone === totalToGeocode) {
                  store.setProgress({
                    phase: '좌표 변환 중',
                    completed: geocodeDone,
                    total: totalToGeocode,
                    propertyCount: store.cache.size,
                  });
                }
              });

              await runWithConcurrency(tasks, 10);
            })(),
          ]);

          // V-World PNU 실패 → Kakao fallback (기존엔 누락되던 항목)
          const vworldFailed = withPnu.filter((t) => !geocodeResults[t.address]);
          if (vworldFailed.length > 0) {
            const kakaoReady = await kakaoReadyPromise;
            if (kakaoReady) {
              const geocoder = new window.kakao.maps.services.Geocoder();
              const tasks = vworldFailed.map((item) => async () => {
                const result = await kakaoGeocode(geocoder, item.address);
                if (result) {
                  geocodeResults[item.address] = result;
                  if (result.pnu) kakaoPnuMap[item.address] = result.pnu;
                }
              });
              await runWithConcurrency(tasks, 10);
            }
          }

          console.log(`[perf] Phase 2a+2b: ${((performance.now() - t1) / 1000).toFixed(1)}s`);

          // 중간 결과 적용 — Phase 2c 전에 마커 먼저 표시
          {
            const { cache } = store;
            let changed = 0;
            for (const { id, address } of toGeocode) {
              const coords = geocodeResults[address];
              if (coords) {
                const existing = cache.get(id);
                if (existing && !existing.lat) {
                  const pnu = existing.pnu || kakaoPnuMap[address];
                  cache.set(id, { ...existing, lat: coords.lat, lng: coords.lng, ...(pnu ? { pnu } : {}) });
                  changed++;
                }
              }
            }
            if (changed > 0) {
              useAuctionStore.setState({ version: useAuctionStore.getState().version + 1 });
            }
          }

          // ── Phase 2c: Kakao PNU → V-World 필지 정밀 좌표 (배치 동시 실행) ──
          const kakaoPnuEntries = Object.entries(kakaoPnuMap);
          if (kakaoPnuEntries.length > 0) {
            const pnuItems = kakaoPnuEntries.map(([address, pnu]) => ({ address, pnu }));
            const batchSize = 50;
            const batches: (typeof pnuItems)[] = [];
            for (let i = 0; i < pnuItems.length; i += batchSize) {
              batches.push(pnuItems.slice(i, i + batchSize));
            }

            const refinedAddresses = new Set<string>();
            await runWithConcurrency(
              batches.map((chunk) => async () => {
                try {
                  const res = await fetch('/api/geocode-batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: chunk }),
                  });
                  if (res.ok) {
                    const data = await res.json();
                    if (data.results) {
                      for (const [addr, coords] of Object.entries(data.results) as [string, { lat: number; lng: number }][]) {
                        geocodeResults[addr] = coords;
                        refinedAddresses.add(addr);
                      }
                    }
                  }
                } catch { /* skip */ }
              }),
              2,
            );

            // 정밀 좌표 적용
            if (refinedAddresses.size > 0) {
              const { cache } = store;
              let changed = 0;
              for (const { id, address } of toGeocode) {
                if (!refinedAddresses.has(address)) continue;
                const coords = geocodeResults[address];
                const existing = cache.get(id);
                if (existing && coords) {
                  const pnu = existing.pnu || kakaoPnuMap[address];
                  cache.set(id, { ...existing, lat: coords.lat, lng: coords.lng, ...(pnu ? { pnu } : {}) });
                  changed++;
                }
              }
              if (changed > 0) {
                useAuctionStore.setState({ version: useAuctionStore.getState().version + 1 });
              }
            }
          }

          console.log(`[perf] Phase 2 total: ${((performance.now() - t1) / 1000).toFixed(1)}s`);
        }

        console.log(`[perf] Total: ${((performance.now() - t0) / 1000).toFixed(1)}s — ${store.cache.size}건`);

        // OnBid 완료 후에도 폐교 geocode가 아직 진행중일 수 있음 — 기다리지 않음
        void closedSchoolPromise;
      } finally {
        // 수집 완료 — 에러 없을 때만 localStorage에 캐시 저장
        const currentApiError = useAuctionStore.getState().apiError;
        if (!currentApiError) {
          store.persistToStorage();
        }
        store.setIsLoading(false);
        store.setLoadingRegion('');
        store.setProgress(null);
        fetchingRef.current = false;
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, retryCounter]);

  const properties = useMemo(() => {
    return Array.from(store.cache.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.version]);

  const totalCount = properties.length;

  const retry = useCallback(() => {
    fetchingRef.current = false;
    useAuctionStore.getState().triggerRetry();
  }, []);

  return {
    properties,
    totalCount,
    isLoading: store.isLoading,
    loadingRegion: store.loadingRegion,
    progress: store.progress,
    apiError: store.apiError,
    retry,
  };
}
