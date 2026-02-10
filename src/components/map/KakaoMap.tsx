'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { MapBounds } from '@/types/land';

interface KakaoMapProps {
  onBoundsChange: (bounds: MapBounds) => void;
  onZoomChange: (level: number) => void;
  children?: React.ReactNode;
}

// 서울 광진구 중심 (건대입구 부근)
const KOREA_CENTER = { lat: 37.5385, lng: 127.0823 };
const DEFAULT_LEVEL = 8;

declare global {
  interface Window {
    kakao: {
      maps: {
        load: (cb: () => void) => void;
        LatLng: new (lat: number, lng: number) => { getLat(): number; getLng(): number };
        Map: new (container: HTMLElement, options: Record<string, unknown>) => KakaoMapInstance;
        event: {
          addListener: (target: unknown, type: string, handler: () => void) => void;
        };
        Point: new (x: number, y: number) => { x: number; y: number };
        Polygon: new (options: Record<string, unknown>) => KakaoPolygon;
        CustomOverlay: new (options: Record<string, unknown>) => KakaoCustomOverlay;
        LatLngBounds: new () => { extend(latlng: unknown): void };
      };
    };
  }
}

interface KakaoMapInstance {
  getBounds(): {
    getSouthWest(): { getLat(): number; getLng(): number };
    getNorthEast(): { getLat(): number; getLng(): number };
  };
  getLevel(): number;
  setLevel(level: number): void;
  setCenter(latlng: unknown): void;
  getCenter(): { getLat(): number; getLng(): number };
  getProjection(): {
    pointFromCoords(latlng: unknown): { x: number; y: number };
    coordsFromPoint(point: { x: number; y: number }): { getLat(): number; getLng(): number };
  };
}

interface KakaoPolygon {
  setMap(map: KakaoMapInstance | null): void;
  setOptions(options: Record<string, unknown>): void;
}

interface KakaoCustomOverlay {
  setMap(map: KakaoMapInstance | null): void;
}

export function KakaoMap({ onBoundsChange, onZoomChange, children }: KakaoMapProps) {
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkFailed, setSdkFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMapInstance | null>(null);

  // Initialize Kakao Maps SDK - poll until loaded or timeout
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 20; // 20 * 500ms = 10s timeout

    function tryInit() {
      if (cancelled) return;
      if (typeof window === 'undefined') return;

      if (window.kakao?.maps?.load) {
        window.kakao.maps.load(() => {
          if (!cancelled) setSdkReady(true);
        });
      } else {
        attempts++;
        if (attempts >= maxAttempts) {
          if (!cancelled) setSdkFailed(true);
        } else {
          setTimeout(tryInit, 500);
        }
      }
    }

    tryInit();
    return () => { cancelled = true; };
  }, []);

  // Create map instance once SDK is ready
  useEffect(() => {
    if (!sdkReady || !containerRef.current || mapRef.current) return;

    const { kakao } = window;
    const center = new kakao.maps.LatLng(KOREA_CENTER.lat, KOREA_CENTER.lng);
    const map = new kakao.maps.Map(containerRef.current, {
      center,
      level: DEFAULT_LEVEL,
    });
    mapRef.current = map;

    function emitBounds() {
      const bounds = map.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      onBoundsChange({
        sw: { lat: sw.getLat(), lng: sw.getLng() },
        ne: { lat: ne.getLat(), lng: ne.getLng() },
      });
      onZoomChange(map.getLevel());
    }

    kakao.maps.event.addListener(map, 'idle', emitBounds);
    // Emit initial bounds
    setTimeout(emitBounds, 500);

    // Middle mouse button panning
    const el = containerRef.current!;
    let midDrag = false;
    let lastX = 0, lastY = 0;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 1) return; // middle button only
      e.preventDefault();
      midDrag = true;
      lastX = e.clientX;
      lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!midDrag) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      const center = map.getCenter();
      const proj = map.getProjection();
      const pt = proj.pointFromCoords(center);
      const next = proj.coordsFromPoint(new kakao.maps.Point(pt.x - dx, pt.y - dy));
      map.setCenter(next);
    };
    const onUp = (e: PointerEvent) => {
      if (e.button !== 1) return;
      midDrag = false;
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);

    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
    };
  }, [sdkReady, onBoundsChange, onZoomChange]);

  // Expose the map instance to children via context-like pattern
  // We pass it through a global ref that overlay components can access
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__kakaoMapInstance = mapRef.current;
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__kakaoMapInstance = undefined;
    };
  }, [sdkReady]);

  // SDK loaded - real Kakao Map
  if (sdkReady) {
    return (
      <div className="relative h-full w-full">
        <div ref={containerRef} className="h-full w-full" />
        {children}
      </div>
    );
  }

  // SDK failed - fallback UI
  if (sdkFailed) {
    return <FallbackMap onBoundsChange={onBoundsChange} onZoomChange={onZoomChange}>{children}</FallbackMap>;
  }

  // Loading
  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-blue-600" />
        <p className="text-sm text-slate-500">지도를 불러오는 중...</p>
      </div>
    </div>
  );
}

/** Get the Kakao map instance (used by overlay components) */
export function getKakaoMapInstance(): KakaoMapInstance | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).__kakaoMapInstance as KakaoMapInstance | null;
}

function FallbackMap({ onBoundsChange, onZoomChange, children }: KakaoMapProps) {
  useEffect(() => {
    onBoundsChange({
      sw: { lat: 37.2, lng: 126.7 },
      ne: { lat: 37.7, lng: 127.3 },
    });
    onZoomChange(DEFAULT_LEVEL);
  }, [onBoundsChange, onZoomChange]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-100">
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(to right, #cbd5e1 1px, transparent 1px), linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 shadow-sm">
          카카오맵 API 키가 설정되지 않았습니다. 아래 필지 목록에서 토지를 선택하세요.
        </div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <p className="text-6xl font-bold text-slate-200">서울 / 경기</p>
          <p className="mt-2 text-lg text-slate-300">모두의 모듈 지도 뷰</p>
        </div>
      </div>
      {children}
    </div>
  );
}
