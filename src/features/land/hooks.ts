'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { LandParcel, ParcelInfo, MapBounds } from '@/types/land';
import { fetchParcelsInBounds, fetchParcelByPnu } from './services';

/**
 * Pre-fetch bounding boxes for key Seoul/Gyeonggi areas.
 * V-World returns data for small-to-medium areas (~district level).
 * Each box covers roughly one gu/district.
 */
const PREFETCH_AREAS: MapBounds[] = [
  // 강남/서초/송파
  { sw: { lat: 37.48, lng: 127.01 }, ne: { lat: 37.53, lng: 127.10 } },
  // 마포/용산/종로
  { sw: { lat: 37.53, lng: 126.91 }, ne: { lat: 37.58, lng: 127.01 } },
  // 영등포/구로/금천
  { sw: { lat: 37.45, lng: 126.85 }, ne: { lat: 37.51, lng: 126.93 } },
  // 성동/광진/강동
  { sw: { lat: 37.53, lng: 127.03 }, ne: { lat: 37.57, lng: 127.13 } },
];

/**
 * Accumulates V-World parcels across zoom/pan operations.
 * On initial mount, pre-fetches key Seoul districts to seed the cache.
 * New fetches merge into a PNU-keyed cache so previously loaded parcels
 * remain visible when the user zooms out.
 */
export function useLandParcels(bounds: MapBounds | null) {
  const cacheRef = useRef<Map<string, LandParcel>>(new Map());
  const [version, setVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchDone = useRef(false);

  const mergeParcels = useCallback((result: LandParcel[]) => {
    for (const p of result) {
      if (p.pnu) cacheRef.current.set(p.pnu, p);
    }
    setVersion((v) => v + 1);
  }, []);

  const fetchParcels = useCallback(async (b: MapBounds) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchParcelsInBounds(b);
      mergeParcels(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : '필지 데이터를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [mergeParcels]);

  // Pre-fetch key areas on initial mount
  useEffect(() => {
    if (prefetchDone.current) return;
    prefetchDone.current = true;

    // Fire all pre-fetches in parallel, don't block UI
    Promise.allSettled(
      PREFETCH_AREAS.map((area) =>
        fetchParcelsInBounds(area).then(mergeParcels)
      )
    );
  }, [mergeParcels]);

  // Fetch on bounds change
  useEffect(() => {
    if (!bounds) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      fetchParcels(bounds);
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [bounds, fetchParcels]);

  // Filter cached parcels to those within current viewport
  const parcels = useMemo(() => {
    if (!bounds) return [];
    const all = Array.from(cacheRef.current.values());
    return all.filter(
      (p) =>
        p.centroidLat >= bounds.sw.lat &&
        p.centroidLat <= bounds.ne.lat &&
        p.centroidLng >= bounds.sw.lng &&
        p.centroidLng <= bounds.ne.lng
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds, version]);

  return { parcels, isLoading, error };
}

export function useParcelDetail(pnu: string | null) {
  const [parcel, setParcel] = useState<ParcelInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pnu) {
      setParcel(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchParcelByPnu(pnu)
      .then((result) => {
        if (!cancelled) {
          setParcel(result);
          setIsLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '필지 상세 정보를 불러오지 못했습니다.');
          setParcel(null);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pnu]);

  return { parcel, isLoading, error };
}
