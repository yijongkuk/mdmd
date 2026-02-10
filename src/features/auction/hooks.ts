'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { AuctionProperty } from '@/types/auction';
import type { MapBounds } from '@/types/land';
import { fetchAuctionProperties } from './services';

/**
 * 지도 중심 우선 로딩 + 진행률 표시:
 * 1) 전 지역 skipGeocode → 목록 수집 (진행률 표시)
 * 2) batch geocode → 좌표 매핑 (진행률 표시)
 * 3) 모든 로딩 완료 시 오버레이 해제
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

/** Batch geocode: send addresses in chunks of batchSize to /api/geocode-batch */
async function batchGeocode(
  addresses: string[],
  batchSize: number,
  onBatchDone?: (done: number, total: number) => void,
): Promise<Record<string, { lat: number; lng: number }>> {
  const allResults: Record<string, { lat: number; lng: number }> = {};
  const chunks: string[][] = [];
  for (let i = 0; i < addresses.length; i += batchSize) {
    chunks.push(addresses.slice(i, i + batchSize));
  }

  let done = 0;
  for (const chunk of chunks) {
    try {
      const res = await fetch('/api/geocode-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresses: chunk }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.results) {
          Object.assign(allResults, data.results);
        }
      }
    } catch { /* skip failed batch */ }
    done++;
    onBatchDone?.(done, chunks.length);
  }

  return allResults;
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
  const cacheRef = useRef<Map<string, AuctionProperty>>(new Map());
  const [version, setVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingRegion, setLoadingRegion] = useState('');
  const [progress, setProgress] = useState<LoadingProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initialFetchDone = useRef(false);

  const mergeResults = useCallback((properties: AuctionProperty[]) => {
    let changed = 0;
    for (const p of properties) {
      if (!p.id) continue;
      if (!cacheRef.current.has(p.id)) {
        cacheRef.current.set(p.id, p);
        changed++;
      } else {
        const existing = cacheRef.current.get(p.id)!;
        if (!existing.lat && p.lat) {
          cacheRef.current.set(p.id, p);
          changed++;
        }
      }
    }
    if (changed > 0) {
      setVersion((v) => v + 1);
    }
  }, []);

  useEffect(() => {
    if (!enabled || initialFetchDone.current) return;
    initialFetchDone.current = true;
    setIsLoading(true);

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
            mergeResults(listData.properties);
          }
        }
        // 2) 지오코딩 (서버 캐시 히트 시 즉시, 미히트 시 수분 소요)
        const geoRes = await fetch('/api/closed-schools?geocode=true');
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          if (Array.isArray(geoData.properties)) {
            mergeResults(geoData.properties);
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
        setProgress({ phase: '매물 목록 수집 중', completed: 0, total: totalJobs, propertyCount: 0 });

        const phase1Tasks = allJobs.map(({ region, page }) => () =>
          fetchAuctionProperties(null, {
            page, size: 1000, source: 'kamco', category: 'land',
            regionKeyword: region, skipGeocode: true,
          }).catch(() => ({ properties: [] as AuctionProperty[], totalCount: 0, page, pageSize: 1000 }))
        );

        await runWithConcurrency(phase1Tasks, 10, (r) => {
          const tagged = r.properties.map((p) => ({ ...p, source: 'onbid' as const }));
          mergeResults(tagged);
          phase1Done++;
          setProgress({
            phase: '매물 목록 수집 중',
            completed: phase1Done,
            total: totalJobs,
            propertyCount: cacheRef.current.size,
          });
        });

        // ── Phase 2: batch geocode → 좌표 매핑 ──
        // Collect addresses from cache that don't have coordinates yet
        const toGeocode: { id: string; address: string }[] = [];
        for (const [id, p] of cacheRef.current) {
          if (p.lat == null && p.address && p.source !== 'closed_school') {
            toGeocode.push({ id, address: p.address });
          }
        }

        if (toGeocode.length > 0) {
          const uniqueAddresses = [...new Set(toGeocode.map((t) => t.address))];
          const totalBatches = Math.ceil(uniqueAddresses.length / 50);

          setProgress({
            phase: '지도 마커 생성 중',
            completed: 0,
            total: totalBatches,
            propertyCount: cacheRef.current.size,
          });

          const geocodeResults = await batchGeocode(
            uniqueAddresses,
            50,
            (done, total) => {
              setProgress({
                phase: '지도 마커 생성 중',
                completed: done,
                total,
                propertyCount: cacheRef.current.size,
              });
            },
          );

          // Apply geocode results to cached properties
          let changed = 0;
          for (const { id, address } of toGeocode) {
            const coords = geocodeResults[address];
            if (coords) {
              const existing = cacheRef.current.get(id);
              if (existing && !existing.lat) {
                cacheRef.current.set(id, { ...existing, lat: coords.lat, lng: coords.lng });
                changed++;
              }
            }
          }
          if (changed > 0) {
            setVersion((v) => v + 1);
          }
        }

        // OnBid 완료 후에도 폐교 geocode가 아직 진행중일 수 있음 — 기다리지 않음
        void closedSchoolPromise;
      } finally {
        setIsLoading(false);
        setLoadingRegion('');
        setProgress(null);
      }
    })();
  }, [enabled, mergeResults]);

  useEffect(() => {
    if (!enabled) {
      cacheRef.current.clear();
      initialFetchDone.current = false;
      setVersion((v) => v + 1);
    }
  }, [enabled]);

  const properties = useMemo(() => {
    return Array.from(cacheRef.current.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const totalCount = properties.length;

  return { properties, totalCount, isLoading, loadingRegion, progress, error };
}
