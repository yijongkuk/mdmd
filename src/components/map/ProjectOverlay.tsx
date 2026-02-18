'use client';

import { useEffect, useRef, useCallback, useState, memo } from 'react';
import { useRouter } from 'next/navigation';
import type { ProjectSummary } from '@/types/project';
import { getKakaoMapInstance } from './KakaoMap';

// ─── Geometry type from V-World ──────────────────────────────
interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

interface ParcelData {
  geometry: GeoJsonPolygon | null;
  centroidLat: number | null;
  centroidLng: number | null;
}

interface ResolvedProject {
  project: ProjectSummary;
  lat: number;
  lng: number;
  geometry: GeoJsonPolygon | null;
}

// ─── Parcel data cache (persists across renders) ─────────────
const projectParcelCache = new Map<string, ParcelData>();

// ─── Concurrent fetch limiter ────────────────────────────────
async function fetchConcurrent<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency: number,
): Promise<void> {
  let idx = 0;
  const run = async () => {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
}

interface ProjectOverlayProps {
  zoomLevel: number;
}

// ─── Marker HTML ─────────────────────────────────────────────
// ─── 축소 모드 (클러스터 줌): 글씨 없이 작은 핀만 ─────────
function projectPinCompactHtml(): string {
  return `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
    <div style="
      width:21px;height:21px;border-radius:50% 50% 50% 0;
      background:#3b82f6;border:2px solid white;
      box-shadow:0 1px 4px rgba(59,130,246,0.5);
      transform:rotate(-45deg);
      transition:transform .15s;
    " onmouseover="this.style.transform='rotate(-45deg) scale(1.2)'"
       onmouseout="this.style.transform='rotate(-45deg) scale(1)'"></div>
  </div>`;
}

// ─── 확대 모드: 이름 + 뱃지 ─────────────────────────────────
function projectMarkerHtml(name: string, flipped: boolean): string {
  const shortName = name.length > 10 ? name.slice(0, 10) + '...' : name;

  const body = `<div style="
    background:white;border-radius:8px;padding:4px 8px;
    border:2px solid #3b82f6;
    box-shadow:0 2px 6px rgba(0,0,0,0.2);
    white-space:nowrap;min-width:60px;text-align:center;
    transition:transform .15s;
  " onmouseover="this.style.transform='scale(1.08)'" onmouseout="this.style.transform='scale(1)'">
    <div style="font-size:11px;font-weight:700;color:#1e293b;line-height:1.3;">${shortName}</div>
    <div style="font-size:8px;font-weight:600;color:white;background:#3b82f6;
      border-radius:3px;padding:1px 4px;margin-top:2px;display:inline-block;">내 프로젝트</div>
  </div>`;

  if (flipped) {
    // 뒤집힌 핀: 꼬리(▲)가 위 → 빨간 핀 꼬리(▽)와 맞닿음
    return `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
      <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;
        border-bottom:8px solid #3b82f6;margin-bottom:-1px;"></div>
      ${body}
    </div>`;
  }
  // 정상 핀: 꼬리(▽)가 아래
  return `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
    ${body}
    <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;
      border-top:8px solid #3b82f6;margin-top:-1px;"></div>
  </div>`;
}

// ─── Component ───────────────────────────────────────────────
export const ProjectOverlay = memo(function ProjectOverlay({
  zoomLevel,
}: ProjectOverlayProps) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overlaysRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polygonsRef = useRef<any[]>([]);
  const genRef = useRef(0);

  const [resolved, setResolved] = useState<ResolvedProject[]>([]);

  // ─── Fetch projects + resolve parcel data ───
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/projects');
        if (!res.ok || cancelled) return;
        const json = await res.json();
        const projects: ProjectSummary[] = json.projects ?? json;
        const withPnu = projects.filter((p) => p.parcelPnu);
        if (withPnu.length === 0 || cancelled) return;

        const results: ResolvedProject[] = [];

        await fetchConcurrent(
          withPnu,
          async (proj) => {
            if (cancelled) return;
            const pnu = proj.parcelPnu!;
            let data = projectParcelCache.get(pnu);

            if (!data) {
              try {
                const r = await fetch(`/api/land/parcel-info?pnu=${pnu}`);
                if (r.ok) {
                  const json = await r.json();
                  data = {
                    geometry: json.geometry ?? null,
                    centroidLat: json.centroidLat ?? null,
                    centroidLng: json.centroidLng ?? null,
                  };
                } else {
                  data = { geometry: null, centroidLat: null, centroidLng: null };
                }
              } catch {
                data = { geometry: null, centroidLat: null, centroidLng: null };
              }
              projectParcelCache.set(pnu, data);
            }

            if (cancelled) return;
            if (data.centroidLat && data.centroidLng) {
              results.push({
                project: proj,
                lat: data.centroidLat,
                lng: data.centroidLng,
                geometry: data.geometry,
              });
            }
          },
          3,
        );

        if (!cancelled) setResolved(results);
      } catch {
        // silently fail
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // ─── Draw markers (all zoom levels) ───
  useEffect(() => {
    const map = getKakaoMapInstance();
    if (!map || !window.kakao?.maps || resolved.length === 0) return;

    // Clear previous overlays
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    const { kakao } = window;
    // 빨간 개별 핀이 보이는 줌(< 8)이면 뒤집어서 아래로
    const markerMode = zoomLevel < 8;
    const compact = !markerMode; // 클러스터 줌에서는 작은 핀

    resolved.forEach((rp) => {
      const el = document.createElement('div');
      el.innerHTML = compact
        ? projectPinCompactHtml()
        : projectMarkerHtml(rp.project.name, true);
      el.style.cursor = 'pointer';

      // Drag vs click detection
      let downX = 0;
      let downY = 0;
      el.addEventListener('mousedown', (e) => { downX = e.clientX; downY = e.clientY; });
      el.addEventListener('click', (e) => {
        const dx = Math.abs(e.clientX - downX);
        const dy = Math.abs(e.clientY - downY);
        if (dx > 5 || dy > 5) return;
        routerRef.current.push(`/builder/${rp.project.id}`);
      });

      const ov = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(rp.lat, rp.lng),
        content: el,
        yAnchor: compact ? 0.5 : 0, // compact: 중심, flipped: 상단 꼬리=좌표
        xAnchor: 0.5,
        zIndex: compact ? 11 : -1, // compact: 클러스터(10) 위, flipped: 빨간 핀 아래
      });
      ov.setMap(map);
      overlaysRef.current.push(ov);
    });

    return () => {
      overlaysRef.current.forEach((o) => o.setMap(null));
      overlaysRef.current = [];
    };
  }, [resolved, zoomLevel]);

  // ─── Draw polygons (zoom ≤ 4, close zoom) ───
  const drawPolygons = useCallback(() => {
    const map = getKakaoMapInstance();
    if (!map || !window.kakao?.maps) return;

    // Clear previous polygons
    polygonsRef.current.forEach((p) => p.setMap(null));
    polygonsRef.current = [];

    const currentZoom = map.getLevel();
    if (currentZoom > 4) return; // Only draw at close zoom

    const gen = ++genRef.current;
    const { kakao } = window;

    for (const rp of resolved) {
      if (genRef.current !== gen) break;
      if (!rp.geometry) continue;

      const coords = rp.geometry.coordinates[0];
      if (!coords || coords.length < 3) continue;

      try {
        const path = coords.map(
          ([lng, lat]: number[]) => new kakao.maps.LatLng(lat, lng),
        );

        const polygon = new kakao.maps.Polygon({
          path,
          strokeWeight: 3,
          strokeColor: '#3b82f6',
          strokeOpacity: 0.9,
          fillColor: '#3b82f6',
          fillOpacity: 0.2,
        });
        polygon.setMap(map);

        // Hover effect
        kakao.maps.event.addListener(polygon, 'mouseover', () => {
          polygon.setOptions({ fillOpacity: 0.35 });
        });
        kakao.maps.event.addListener(polygon, 'mouseout', () => {
          polygon.setOptions({ fillOpacity: 0.2 });
        });
        kakao.maps.event.addListener(polygon, 'click', () => {
          routerRef.current.push(`/builder/${rp.project.id}`);
        });

        polygonsRef.current.push(polygon);
      } catch {
        // skip invalid geometry
      }
    }
  }, [resolved]);

  // Register idle listener for polygon redraw on pan/zoom
  const idleRegisteredRef = useRef(false);

  useEffect(() => {
    const map = getKakaoMapInstance();
    if (!map || !window.kakao?.maps) return;

    if (!idleRegisteredRef.current) {
      window.kakao.maps.event.addListener(map, 'idle', drawPolygons);
      idleRegisteredRef.current = true;
    }

    drawPolygons();

    return () => {
      genRef.current++;
      polygonsRef.current.forEach((p) => p.setMap(null));
      polygonsRef.current = [];
    };
  }, [drawPolygons, zoomLevel, resolved]);

  return null;
});
