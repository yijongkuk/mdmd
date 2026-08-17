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

/** 한 페이지에 받는 물건 수 */
const PAGE_SIZE = 1000;

/**
 * 지역 하나에서 받을 최대 페이지 수 (안전장치).
 * 페이지 수는 응답의 totalCount로 계산하므로 평소엔 이 값에 걸리지 않는다.
 */
const MAX_PAGES_PER_REGION = 30;

/** 지역별 대략적 중심 좌표 */
const REGION_CENTERS: Record<string, { lat: number; lng: number }> = {
  '서울': { lat: 37.5665, lng: 126.978 },
  '경기': { lat: 37.275, lng: 127.01 },
  '인천': { lat: 37.456, lng: 126.705 },
  '부산': { lat: 35.18, lng: 129.076 },
  '대구': { lat: 35.871, lng: 128.601 },
  '대전': { lat: 36.35, lng: 127.385 },
  '울산': { lat: 35.539, lng: 129.311 },
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

/**
 * 1단계 작업 목록 — 지역×수의계약(Y/N)마다 첫 페이지만.
 * 나머지 페이지는 응답의 totalCount를 보고 만든다. 페이지 수를 코드에
 * 적어두면 물건이 늘었을 때 조용히 잘려나가므로(경기 10페이지 설정 /
 * 실제 20페이지 필요 같은 사례) 응답에서 직접 계산한다.
 */
function buildSeedJobs(regionOrder: string[]) {
  const jobs: { region: string; page: number; share: 'Y' | 'N' }[] = [];
  for (const region of regionOrder) {
    jobs.push({ region, page: 1, share: 'N' });
    jobs.push({ region, page: 1, share: 'Y' });
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
  /** 일시적 실패로 재시도 중인 지역 수 — 0이면 표시하지 않음 */
  retryingCount?: number;
}

/**
 * 계속 진행해도 소용없는 치명적 API 오류인지 판정.
 * 키/권한/한도 문제는 즉시 사용자에게 알려야 하지만,
 * 타임아웃·일시적 네트워크 오류는 56개 지역 중 일부만 영향을 주므로
 * 로딩을 중단하거나 전체 화면을 에러로 덮으면 안 된다.
 */
function isFatalApiError(msg: string): boolean {
  // 게이트웨이는 영문 errMsg와 한글 returnAuthMsg를 모두 내려주므로 양쪽을 본다.
  // "초과"는 타임아웃 메시지("20초 timeout 초과")와 겹치므로 단독으로 쓰지 않는다.
  return /EXCEEDS|LIMITED_NUMBER|NOT_REGISTERED|SERVICE_KEY|ACCESS_DENIED|DEADLINE|UNREGISTERED/i.test(
    msg,
  ) || /한도|등록되지 않은|서비스키|인증키|활용기간|권한이 없/.test(msg);
}

/** geocode-batch 서버 호출 — 주소별/PNU별 결과를 각각 병합 */
async function fetchGeocodeBatch(
  items: { address: string; pnu?: string }[],
  geocodeResults: Record<string, { lat: number; lng: number }>,
  pnuResults: Record<string, { lat: number; lng: number }>,
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
      if (data.pnuResults) Object.assign(pnuResults, data.pnuResults);
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

    // localStorage 캐시 복원 — 성공하면 즉시 화면에 표시(빠른 첫 화면).
    // 단, API 호출을 스킵하지 않고 백그라운드로 OnBid 최신 데이터를 받아
    // 낙찰/취소되어 목록에서 사라진 물건을 제거한다 (stale-while-revalidate).
    const hydrated = currentState.hydrateFromStorage();

    fetchingRef.current = true;
    currentState.setInitialFetchDone(true);
    // 캐시가 이미 표시 중이면 풀스크린 로딩 오버레이를 띄우지 않고 조용히 갱신
    if (!hydrated) currentState.setIsLoading(true);

    // 지도 중심 좌표 기준 지역 정렬
    const centerLat = bounds ? (bounds.sw.lat + bounds.ne.lat) / 2 : 37.5385;
    const centerLng = bounds ? (bounds.sw.lng + bounds.ne.lng) / 2 : 127.0823;
    const regionOrder = getRegionsByDistance(centerLat, centerLng);
    const seedJobs = buildSeedJobs(regionOrder);

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

        // ── Phase 1: OnBid 매물 수집 (동시성 10) ──
        // 총 작업 수는 첫 페이지 응답의 totalCount를 보고 늘어난다
        let phase1Done = 0;
        let totalJobs = seedJobs.length;
        store.setProgress({ phase: '매물 목록 수집 중', completed: 0, total: totalJobs, propertyCount: 0 });
        const t0 = performance.now();

        let fatalApiError: string | null = null;
        const freshOnbidIds = new Set<string>();
        // 실패한 작업을 "지역:페이지" 단위로 추적한다. 한 지역에 여러 페이지가 있어
        // 지역 단위로만 관리하면 일부 페이지만 복구돼도 전체 성공으로 오판한다.
        const jobErrors = new Map<string, string>();
        // 일시적으로 실패해 재시도할 작업
        const pendingRetry: { region: string; page: number; share: 'Y' | 'N' }[] = [];

        const runJob = async ({ region, page, share }: { region: string; page: number; share: 'Y' | 'N' }) => {
          const key = `${region}:${page}:${share}`;
          try {
            const r = await fetchAuctionProperties(null, {
              page, size: PAGE_SIZE, source: 'kamco',
              regionKeyword: region, skipGeocode: true, pvctTrgtYn: share,
            });
            const err = (r as { apiError?: string }).apiError;
            if (err) jobErrors.set(key, err);
            else jobErrors.delete(key);
            return { r, region, page, share, err };
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            jobErrors.set(key, msg);
            return {
              r: { properties: [] as AuctionProperty[], totalCount: 0, page, pageSize: PAGE_SIZE },
              region,
              page,
              share,
              err: msg,
            };
          }
        };

        const collect = (
          { r, region, page, share, err }: {
            r: { properties: AuctionProperty[] };
            region: string; page: number; share: 'Y' | 'N'; err?: string;
          },
          isRetryPass: boolean,
        ) => {
          // 치명적 오류(키/권한/한도)만 즉시 사용자에게 알린다.
          if (err && isFatalApiError(err) && !fatalApiError) {
            fatalApiError = err;
            store.setApiError(err);
          } else if (err && !isRetryPass) {
            // 일시적 오류 → 로딩을 계속하고 뒤에서 한 번 더 시도
            pendingRetry.push({ region, page, share });
          }
          const tagged = r.properties.map((p) => ({ ...p, source: 'onbid' as const }));
          for (const p of tagged) if (p.id) freshOnbidIds.add(p.id);
          store.mergeResults(tagged);
          // 재시도 패스는 이미 1패스에서 센 작업이므로 진행률을 다시 올리지 않는다
          // (올리면 100% → 94% → 100%로 되돌아가 오작동처럼 보인다)
          if (!isRetryPass) phase1Done++;
          store.setProgress({
            phase: isRetryPass ? '일부 지역 재시도 중' : '매물 목록 수집 중',
            completed: phase1Done,
            total: totalJobs,
            propertyCount: store.cache.size,
            retryingCount: isRetryPass ? jobErrors.size : pendingRetry.length,
          });
        };

        // 1단계: 지역×Y/N의 첫 페이지. 응답의 totalCount로 남은 페이지를 계산한다.
        const restJobs: { region: string; page: number; share: 'Y' | 'N' }[] = [];
        await runWithConcurrency(
          seedJobs.map((job) => () => runJob(job)),
          10,
          (res) => {
            const total = (res.r as { totalCount?: number }).totalCount ?? 0;
            const pages = Math.min(Math.ceil(total / PAGE_SIZE), MAX_PAGES_PER_REGION);
            for (let p = 2; p <= pages; p++) {
              restJobs.push({ region: res.region, page: p, share: res.share });
            }
            totalJobs = seedJobs.length + restJobs.length;
            collect(res, false);
          },
        );

        // 2단계: 계산된 나머지 페이지
        if (restJobs.length > 0) {
          await runWithConcurrency(
            restJobs.map((job) => () => runJob(job)),
            10,
            (res) => collect(res, false),
          );
        }

        // 일시적으로 실패한 지역만 1회 재시도 — 전체 재로딩보다 훨씬 저렴하다
        if (pendingRetry.length > 0 && !fatalApiError) {
          const retryJobs = [...pendingRetry];
          pendingRetry.length = 0;
          store.setProgress({
            phase: '일부 지역 재시도 중',
            completed: phase1Done,
            total: totalJobs,
            propertyCount: store.cache.size,
            retryingCount: retryJobs.length,
          });
          await runWithConcurrency(
            retryJobs.map((job) => () => runJob(job)),
            5,
            // runJob이 성공 시 jobErrors에서 해당 키를 지우므로 별도 해제가 필요 없다
            (res) => collect(res, true),
          );
        }

        console.log(`[perf] Phase 1: ${((performance.now() - t0) / 1000).toFixed(1)}s — ${store.cache.size}건`);

        // 재시도까지 끝난 뒤 남은 실패 작업에서 지역 목록을 도출한다
        const regionFailed = new Set<string>([...jobErrors.keys()].map((k) => k.split(':')[0]));

        // 최신 OnBid 목록과 대조하여 사라진(낙찰/취소된) 물건을 캐시에서 제거.
        // 지역별 부분 prune: 요청이 모두 성공한 지역만 정리 → 일부 지역 실패해도
        // 나머지 지역의 낙찰/취소 물건은 정상적으로 제거됨(예전엔 1개만 실패해도 전체 생략됐음).
        const succeededRegions = new Set<string>(
          regionOrder.filter((rg) => !regionFailed.has(rg))
        );
        if (succeededRegions.size > 0 && freshOnbidIds.size > 0) {
          store.reconcileOnbid(freshOnbidIds, succeededRegions);
        }
        if (regionFailed.size > 0) {
          console.log(`[auction-cache] 실패 지역 ${[...regionFailed].join(',')} — 해당 지역은 prune 보류`);
        }

        // ── Phase 2: 좌표 변환 (V-World PNU + Kakao 동시 병렬) ──
        const toGeocode: { id: string; address: string; pnu?: string }[] = [];
        for (const [id, p] of store.cache) {
          if (p.lat == null && p.address && p.source !== 'closed_school') {
            toGeocode.push({ id, address: p.address, pnu: p.pnu });
          }
        }

        if (toGeocode.length > 0) {
          const geocodeResults: Record<string, { lat: number; lng: number }> = {};
          // PNU별 정확 좌표 — 주소는 여러 필지가 공유할 수 있으므로 PNU가 있으면 이쪽을 쓴다
          const pnuResults: Record<string, { lat: number; lng: number }> = {};
          const kakaoPnuMap: Record<string, string> = {};

          // 중복 제거 기준을 나눈다: PNU가 있으면 PNU로, 없으면 주소로.
          // 전부 주소로 묶으면 같은 주소의 서로 다른 필지가 한 건으로 합쳐져
          // 마커가 남의 필지 좌표를 받는다.
          const withPnu = [...new Map(
            toGeocode.filter((t) => t.pnu).map((t) => [t.pnu!, t]),
          ).values()];
          const withoutPnu = [...new Map(
            toGeocode.filter((t) => !t.pnu).map((t) => [t.address, t]),
          ).values()];
          const totalToGeocode = withPnu.length + withoutPnu.length;
          let geocodeDone = 0;

          store.setProgress({
            phase: '좌표 변환 중',
            completed: 0,
            total: totalToGeocode,
            propertyCount: store.cache.size,
          });

          const t1 = performance.now();

          /**
           * 지금까지 확보한 좌표를 캐시에 반영해 지도에 즉시 그린다.
           * 예전에는 모든 좌표 변환이 끝난 뒤 한 번에 반영해서, 전국 1만여 건을
           * 처리하는 약 2분 동안 지도에 아무것도 늘지 않았다. 지역 정렬상
           * 수도권이 먼저 처리되므로 사용자에겐 "수도권만 나온다"로 보인다.
           * 배치마다 반영하면 지방 물건이 순차적으로 나타난다.
           */
          const applyCoords = () => {
            const { cache } = store;
            let changed = 0;
            for (const { id, address, pnu: itemPnu } of toGeocode) {
              const coords = (itemPnu && pnuResults[itemPnu]) || geocodeResults[address];
              if (!coords) continue;
              const existing = cache.get(id);
              if (!existing || existing.lat != null) continue;
              const pnu = existing.pnu || kakaoPnuMap[address];
              cache.set(id, { ...existing, lat: coords.lat, lng: coords.lng, ...(pnu ? { pnu } : {}) });
              changed++;
            }
            if (changed > 0) {
              useAuctionStore.setState({ version: useAuctionStore.getState().version + 1 });
            }
            return changed;
          };

          // ── Phase 2a + 2b: V-World PNU와 Kakao를 동시 병렬 실행 ──
          await Promise.all([
            // 2a: PNU → V-World 필지 경계 (배치 2개 동시, 기존 순차 → 약 50% 단축)
            (async () => {
              if (withPnu.length === 0) return;
              // PNU 기준으로 중복 제거한다. 주소 기준으로 묶으면 같은 주소를 가진
              // 서로 다른 필지가 하나로 합쳐져 전부 같은 좌표를 받게 된다.
              const pnuItems = [...new Map(
                withPnu.map((t) => [t.pnu!, { address: t.address, pnu: t.pnu }]),
              ).values()];

              const batchSize = 50;
              const batches: (typeof pnuItems)[] = [];
              for (let i = 0; i < pnuItems.length; i += batchSize) {
                batches.push(pnuItems.slice(i, i + batchSize));
              }

              // 배치 2개씩 동시 실행 (V-World 부하 제한)
              await runWithConcurrency(
                batches.map((chunk) => async () => {
                  await fetchGeocodeBatch(chunk, geocodeResults, pnuResults);
                  geocodeDone += chunk.length;
                  // 배치가 끝날 때마다 지도에 반영 — 지방 물건이 순차적으로 나타난다
                  applyCoords();
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
                  applyCoords(); // 진행 중에도 지도에 반영
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
          const vworldFailed = withPnu.filter((t) => !pnuResults[t.pnu!]);
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

          // 남은 결과 적용 — Phase 2c 전에 마커 먼저 표시
          // (배치마다 이미 반영해 왔으므로 여기서는 마지막 잔여분만 처리된다)
          applyCoords();

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
              for (const { id, address, pnu: itemPnu } of toGeocode) {
                if (!refinedAddresses.has(address)) continue;
                // 자기 PNU로 이미 정확한 좌표를 받은 물건은 덮어쓰지 않는다.
                // (같은 주소를 공유하는 PNU 없는 물건의 보정값이 넘어올 수 있음)
                if (itemPnu && pnuResults[itemPnu]) continue;
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
