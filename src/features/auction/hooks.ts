'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { AuctionProperty } from '@/types/auction';
import type { MapBounds } from '@/types/land';
import { fetchAuctionProperties } from './services';
import { useAuctionStore } from './store';

/**
 * 지도 중심 우선 로딩 + 진행률 표시:
 * 1) 전 지역 skipGeocode → 목록 수집 (진행률 표시)
 * 2a) PNU → V-World 필지 경계 조회 → 폴리곤 중심점 = 핀 위치 (가장 정확)
 * 2b) PNU 없거나 실패 → Kakao 클라이언트 지오코딩 fallback
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

export function useAuctionProperties(
  bounds: MapBounds | null,
  enabled: boolean,
  zoomLevel?: number,
) {
  const store = useAuctionStore();
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

        // ── Phase 1: skipGeocode 병렬 10개 → 목록 수집 ──
        let phase1Done = 0;
        store.setProgress({ phase: '매물 목록 수집 중', completed: 0, total: totalJobs, propertyCount: 0 });

        let firstApiError: string | null = null;
        const phase1Tasks = allJobs.map(({ region, page }) => () =>
          fetchAuctionProperties(null, {
            page, size: 1000, source: 'kamco', category: 'land',
            regionKeyword: region, skipGeocode: true,
          }).catch(() => ({ properties: [] as AuctionProperty[], totalCount: 0, page, pageSize: 1000 }))
        );

        await runWithConcurrency(phase1Tasks, 10, (r) => {
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

        // ── Phase 2: 필지 경계 → 중심점 방식 (PNU 우선, Kakao fallback) ──
        const toGeocode: { id: string; address: string; pnu?: string }[] = [];
        for (const [id, p] of store.cache) {
          if (p.lat == null && p.address && p.source !== 'closed_school') {
            toGeocode.push({ id, address: p.address, pnu: p.pnu });
          }
        }

        if (toGeocode.length > 0) {
          const geocodeResults: Record<string, { lat: number; lng: number }> = {};

          // ── Phase 2a: PNU → V-World 필지 경계 → 폴리곤 중심점 (가장 정확) ──
          const withPnu = toGeocode.filter((t) => t.pnu);
          const uniquePnuItems = [
            ...new Map(withPnu.map((t) => [t.address, { address: t.address, pnu: t.pnu }])).values(),
          ];

          if (uniquePnuItems.length > 0) {
            store.setProgress({
              phase: '필지 경계 조회 중',
              completed: 0,
              total: uniquePnuItems.length,
              propertyCount: store.cache.size,
            });

            // geocode-batch 서버 → PNU 기반 V-World 필지 조회 → centroid 반환
            const batchSize = 50;
            let batchDone = 0;
            for (let i = 0; i < uniquePnuItems.length; i += batchSize) {
              const chunk = uniquePnuItems.slice(i, i + batchSize);
              try {
                const res = await fetch('/api/geocode-batch', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ items: chunk }),
                });
                if (res.ok) {
                  const data = await res.json();
                  if (data.results) Object.assign(geocodeResults, data.results);
                }
              } catch { /* skip failed batch */ }
              batchDone += chunk.length;
              store.setProgress({
                phase: '필지 경계 조회 중',
                completed: batchDone,
                total: uniquePnuItems.length,
                propertyCount: store.cache.size,
              });
            }
          }

          // ── Phase 2b: PNU 실패 + PNU 없는 것 → Kakao 지오코딩 fallback ──
          const needKakao = toGeocode.filter((t) => !geocodeResults[t.address]);
          const uniqueKakaoAddresses = [...new Set(needKakao.map((t) => t.address))];
          // Kakao에서 추출한 PNU 맵 (address → pnu)
          const kakaoPnuMap: Record<string, string> = {};

          if (uniqueKakaoAddresses.length > 0) {
            store.setProgress({
              phase: '지도 마커 생성 중',
              completed: 0,
              total: uniqueKakaoAddresses.length,
              propertyCount: store.cache.size,
            });

            const kakaoReady = await waitForKakaoServices();
            if (kakaoReady) {
              const geocoder = new window.kakao.maps.services.Geocoder();
              let done = 0;

              const tasks = uniqueKakaoAddresses.map((address) => async () => {
                const result = await kakaoGeocode(geocoder, address);
                if (result) {
                  geocodeResults[address] = result;
                  if (result.pnu) kakaoPnuMap[address] = result.pnu;
                }
                done++;
                if (done % 10 === 0 || done === uniqueKakaoAddresses.length) {
                  store.setProgress({
                    phase: '지도 마커 생성 중',
                    completed: done,
                    total: uniqueKakaoAddresses.length,
                    propertyCount: store.cache.size,
                  });
                }
                return result;
              });

              await runWithConcurrency(tasks, 5);
            }
          }

          // ── Phase 2c: Kakao PNU → V-World 필지 경계 → 정확한 centroid ──
          const kakaoPnuEntries = Object.entries(kakaoPnuMap);
          if (kakaoPnuEntries.length > 0) {
            const kakaoPnuItems = kakaoPnuEntries.map(([address, pnu]) => ({ address, pnu }));

            store.setProgress({
              phase: 'Kakao PNU 필지 조회 중',
              completed: 0,
              total: kakaoPnuItems.length,
              propertyCount: store.cache.size,
            });

            const batchSize = 50;
            let batchDone = 0;
            for (let i = 0; i < kakaoPnuItems.length; i += batchSize) {
              const chunk = kakaoPnuItems.slice(i, i + batchSize);
              try {
                const res = await fetch('/api/geocode-batch', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ items: chunk }),
                });
                if (res.ok) {
                  const data = await res.json();
                  // V-World centroid로 좌표 갱신 (Kakao 좌표보다 정확)
                  if (data.results) {
                    for (const [addr, coords] of Object.entries(data.results) as [string, { lat: number; lng: number }][]) {
                      geocodeResults[addr] = coords;
                    }
                  }
                }
              } catch { /* skip failed batch */ }
              batchDone += chunk.length;
              store.setProgress({
                phase: 'Kakao PNU 필지 조회 중',
                completed: batchDone,
                total: kakaoPnuItems.length,
                propertyCount: store.cache.size,
              });
            }
          }

          // 결과 적용 — PNU도 함께 저장
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

        // OnBid 완료 후에도 폐교 geocode가 아직 진행중일 수 있음 — 기다리지 않음
        void closedSchoolPromise;
      } finally {
        // 수집 완료 — localStorage에 캐시 저장 (새로고침 시 즉시 복원)
        store.persistToStorage();
        store.setIsLoading(false);
        store.setLoadingRegion('');
        store.setProgress(null);
        fetchingRef.current = false;
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const properties = useMemo(() => {
    return Array.from(store.cache.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.version]);

  const totalCount = properties.length;

  const retry = useCallback(() => {
    const s = useAuctionStore.getState();
    s.clearCache();
    s.setApiError(null);
    fetchingRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
