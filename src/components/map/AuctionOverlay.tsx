'use client';

import { useEffect, useRef, useCallback, memo } from 'react';
import type { AuctionProperty } from '@/types/auction';
import { formatWon } from '@/lib/utils/format';
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

// ─── Parcel data cache (persists across renders) ─────────────
const parcelCache = new Map<string, ParcelData>();

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

interface AuctionOverlayProps {
  properties: AuctionProperty[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  zoomLevel?: number;
}

// ─── Display mode by zoom (Kakao: 1=closest, 14=farthest) ───
type DisplayMode = 'cluster' | 'marker';

function getDisplayMode(zoom: number): DisplayMode {
  // 매물 수가 적으므로 zoom 8(시/군 수준)부터 개별 마커 표시
  return zoom >= 8 ? 'cluster' : 'marker';
}

// ─── Clustering (직방/다방 style) ────────────────────────────
interface AuctionCluster {
  lat: number;
  lng: number;
  count: number;
  properties: AuctionProperty[];
}

function clusterAuctions(
  properties: AuctionProperty[],
  zoomLevel: number,
): AuctionCluster[] {
  const withCoords = properties.filter(
    (p) => p.lat != null && p.lng != null,
  );
  if (withCoords.length === 0) return [];

  const cellSize =
    zoomLevel >= 12 ? 0.5
    : zoomLevel >= 10 ? 0.2
    : zoomLevel >= 8 ? 0.1
    : 0.05;

  const grid = new Map<string, AuctionProperty[]>();
  for (const p of withCoords) {
    const key = `${Math.floor(p.lat! / cellSize)}:${Math.floor(p.lng! / cellSize)}`;
    const list = grid.get(key) ?? [];
    list.push(p);
    grid.set(key, list);
  }

  const clusters: AuctionCluster[] = [];
  for (const group of grid.values()) {
    clusters.push({
      lat: group.reduce((s, p) => s + p.lat!, 0) / group.length,
      lng: group.reduce((s, p) => s + p.lng!, 0) / group.length,
      count: group.length,
      properties: group,
    });
  }
  return clusters;
}

function clusterHtml(count: number): string {
  // Size scales: 1→38px, 5→48px, 10→56px, 20→64px, 50+→76px
  const size =
    count >= 50 ? 76
    : count >= 20 ? 64
    : count >= 10 ? 56
    : count >= 5 ? 48
    : 38;
  const fs = count >= 20 ? 17 : count >= 5 ? 15 : 13;

  // Color by density
  const [bg, shadow] =
    count >= 20 ? ['linear-gradient(135deg,#dc2626,#b91c1c)', 'rgba(220,38,38,0.45)']
    : count >= 10 ? ['linear-gradient(135deg,#ef4444,#dc2626)', 'rgba(239,68,68,0.4)']
    : count >= 5 ? ['linear-gradient(135deg,#f97316,#ea580c)', 'rgba(249,115,22,0.4)']
    : ['linear-gradient(135deg,#f97316,#f59e0b)', 'rgba(249,115,22,0.35)'];

  return `<div style="
    width:${size}px;height:${size}px;border-radius:50%;
    background:${bg};
    border:3px solid white;box-shadow:0 2px 10px ${shadow};
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    color:white;cursor:pointer;
    transition:transform .15s;
  " onmouseover="this.style.transform='scale(1.15)'"
    onmouseout="this.style.transform='scale(1)'">
    <div style="font-size:${fs}px;font-weight:800;line-height:1;">${count}</div>
    <div style="font-size:${count >= 10 ? 9 : 8}px;opacity:0.9;margin-top:1px;">매물</div>
  </div>`;
}

// ─── Individual marker ───────────────────────────────────────
function auctionMarkerHtml(
  property: AuctionProperty,
  isSelected: boolean,
): string {
  const shortName =
    property.name.length > 12
      ? property.name.slice(0, 12) + '...'
      : property.name;
  const ring = isSelected
    ? 'box-shadow:0 0 0 3px #ef4444,0 2px 8px rgba(0,0,0,0.25);'
    : 'box-shadow:0 2px 6px rgba(0,0,0,0.2);';

  return `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
    <div style="
      background:white;border-radius:8px;padding:4px 8px;
      border:2px solid #ef4444;${ring}
      white-space:nowrap;min-width:80px;text-align:center;
      transition:transform .15s;
    " onmouseover="this.style.transform='scale(1.08)'" onmouseout="this.style.transform='scale(1)'">
      <div style="font-size:11px;font-weight:700;color:#1e293b;line-height:1.3;">${shortName}</div>
      <div style="font-size:10px;color:#dc2626;font-weight:600;margin-top:1px;">${formatWon(property.minBidPrice)}</div>
      <div style="font-size:8px;font-weight:600;color:white;background:#f97316;
        border-radius:3px;padding:1px 4px;margin-top:2px;display:inline-block;">${property.disposalMethod || '공매'}</div>
    </div>
    <div style="
      width:0;height:0;
      border-left:6px solid transparent;border-right:6px solid transparent;
      border-top:8px solid #ef4444;margin-top:-1px;
    "></div>
  </div>`;
}

// ─── Viewport bounds helper ──────────────────────────────────
interface ViewportBounds {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
}

function getViewportBounds(padding = 0.2): ViewportBounds | null {
  const map = getKakaoMapInstance();
  if (!map || !window.kakao?.maps) return null;
  const bounds = map.getBounds();
  if (!bounds) return null;
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const latPad = (ne.getLat() - sw.getLat()) * padding;
  const lngPad = (ne.getLng() - sw.getLng()) * padding;
  return {
    swLat: sw.getLat() - latPad,
    swLng: sw.getLng() - lngPad,
    neLat: ne.getLat() + latPad,
    neLng: ne.getLng() + lngPad,
  };
}

function isInViewport(lat: number, lng: number, vp: ViewportBounds): boolean {
  return lat >= vp.swLat && lat <= vp.neLat && lng >= vp.swLng && lng <= vp.neLng;
}

// ─── Component ───────────────────────────────────────────────
export const AuctionOverlay = memo(function AuctionOverlay({
  properties,
  selectedId,
  onSelect,
  zoomLevel = 8,
}: AuctionOverlayProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overlaysRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerByIdRef = useRef<Map<string, any>>(new Map());
  // Map from property id → DOM element for fast selection updates
  const elementByIdRef = useRef<Map<string, HTMLDivElement>>(new Map());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polygonsRef = useRef<any[]>([]);
  const abortRef = useRef(false);
  // Track current selectedId in ref to avoid stale closures in drawPolygon
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // ─── Fetch parcel data, draw polygon, relocate marker to centroid ───
  const drawPolygon = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (property: AuctionProperty, map: any, kakao: any) => {
      if (property.lat == null || property.lng == null) return;

      const cacheKey = `${property.lat.toFixed(6)},${property.lng.toFixed(6)}`;

      // Try cache first
      let parcelData: ParcelData | undefined = parcelCache.get(cacheKey);
      if (!parcelData) {
        try {
          const res = await fetch(
            `/api/land/parcel-info?lat=${property.lat}&lng=${property.lng}`,
          );
          if (!res.ok) {
            parcelCache.set(cacheKey, { geometry: null, centroidLat: null, centroidLng: null });
            return;
          }
          const data = await res.json();
          parcelData = {
            geometry: data.geometry ?? null,
            centroidLat: data.centroidLat ?? null,
            centroidLng: data.centroidLng ?? null,
          };
          parcelCache.set(cacheKey, parcelData);
        } catch {
          parcelCache.set(cacheKey, { geometry: null, centroidLat: null, centroidLng: null });
          return;
        }
      }

      if (abortRef.current) return;

      // ── Relocate marker to parcel centroid ──
      if (parcelData.centroidLat && parcelData.centroidLng) {
        const marker = markerByIdRef.current.get(property.id);
        if (marker) {
          marker.setPosition(
            new kakao.maps.LatLng(parcelData.centroidLat, parcelData.centroidLng),
          );
        }
      }

      // ── Draw polygon ──
      if (!parcelData.geometry) return;

      const coords = parcelData.geometry.coordinates[0];
      const path = coords.map(
        ([lng, lat]: number[]) => new kakao.maps.LatLng(lat, lng),
      );

      const isSelected = property.id === selectedIdRef.current;
      const polygon = new kakao.maps.Polygon({
        path,
        strokeWeight: isSelected ? 3 : 2,
        strokeColor: isSelected ? '#3b82f6' : '#ef4444',
        strokeOpacity: 0.9,
        fillColor: isSelected ? '#3b82f6' : '#ef4444',
        fillOpacity: isSelected ? 0.4 : 0.2,
      });
      polygon.setMap(map);

      kakao.maps.event.addListener(polygon, 'click', () => onSelectRef.current(property.id));
      kakao.maps.event.addListener(polygon, 'mouseover', () => {
        polygon.setOptions({ fillOpacity: isSelected ? 0.5 : 0.35, strokeWeight: 3 });
      });
      kakao.maps.event.addListener(polygon, 'mouseout', () => {
        polygon.setOptions({
          fillOpacity: isSelected ? 0.4 : 0.2,
          strokeWeight: isSelected ? 3 : 2,
        });
      });

      if (!abortRef.current) {
        polygonsRef.current.push(polygon);
      } else {
        polygon.setMap(null);
      }
    },
    [], // No deps — uses refs for selectedId and onSelect
  );

  // ─── RENDER EFFECT: rebuild overlays when properties or zoom change ───
  useEffect(() => {
    const map = getKakaoMapInstance();
    if (!map || !window.kakao?.maps) return;

    abortRef.current = false;

    // Clear previous overlays & polygons
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
    markerByIdRef.current.clear();
    elementByIdRef.current.clear();
    polygonsRef.current.forEach((p) => p.setMap(null));
    polygonsRef.current = [];

    const { kakao } = window;
    const mode = getDisplayMode(zoomLevel);
    const viewport = getViewportBounds(0.2);

    // ── CLUSTER MODE ──
    if (mode === 'cluster') {
      const clusters = clusterAuctions(properties, zoomLevel);
      clusters.forEach((cluster) => {
        // Viewport culling for clusters
        if (viewport && !isInViewport(cluster.lat, cluster.lng, viewport)) return;

        const el = document.createElement('div');
        el.innerHTML = clusterHtml(cluster.count);
        el.style.cursor = 'pointer';

        // 드래그 vs 클릭 구분: mousedown 위치와 mouseup 위치 비교
        let downX = 0;
        let downY = 0;
        el.addEventListener('mousedown', (e) => { downX = e.clientX; downY = e.clientY; });
        el.addEventListener('click', (e) => {
          const dx = Math.abs(e.clientX - downX);
          const dy = Math.abs(e.clientY - downY);
          if (dx > 5 || dy > 5) return; // 5px 이상 이동 = 드래그 → 무시
          map.setCenter(new kakao.maps.LatLng(cluster.lat, cluster.lng));
          map.setLevel(Math.max(1, map.getLevel() - 3));
        });

        const ov = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(cluster.lat, cluster.lng),
          content: el,
          yAnchor: 0.5,
          xAnchor: 0.5,
        });
        ov.setMap(map);
        overlaysRef.current.push(ov);
      });
    }

    // ── MARKER MODE ──
    if (mode === 'marker') {
      const visibleWithCoords: AuctionProperty[] = [];

      properties.forEach((property) => {
        if (property.lat == null || property.lng == null) return;

        // Viewport culling — skip markers outside viewport + 20% buffer
        if (viewport && !isInViewport(property.lat, property.lng, viewport)) return;

        visibleWithCoords.push(property);

        const isSelected = property.id === selectedIdRef.current;
        const el = document.createElement('div');
        el.innerHTML = auctionMarkerHtml(property, isSelected);
        el.style.cursor = 'pointer';

        let downX = 0;
        let downY = 0;
        el.addEventListener('mousedown', (e) => { downX = e.clientX; downY = e.clientY; });
        el.addEventListener('click', (e) => {
          const dx = Math.abs(e.clientX - downX);
          const dy = Math.abs(e.clientY - downY);
          if (dx > 5 || dy > 5) return;
          onSelectRef.current(property.id);
        });

        const ov = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(property.lat, property.lng),
          content: el,
          yAnchor: 1.2,
          xAnchor: 0.5,
        });
        ov.setMap(map);
        overlaysRef.current.push(ov);
        markerByIdRef.current.set(property.id, ov);
        elementByIdRef.current.set(property.id, el);
      });

      // ── POLYGON MODE (zoom ≤ 5 = 필지 경계 표시) ──
      if (zoomLevel <= 5 && visibleWithCoords.length > 0) {
        // Limit polygons to max 30 in viewport to avoid excessive API calls
        const polygonCandidates = visibleWithCoords.slice(0, 30);
        fetchConcurrent(polygonCandidates, (p) => drawPolygon(p, map, kakao), 4);
      }
    }

    return () => {
      abortRef.current = true;
      overlaysRef.current.forEach((o) => o.setMap(null));
      overlaysRef.current = [];
      markerByIdRef.current.clear();
      elementByIdRef.current.clear();
      polygonsRef.current.forEach((p) => p.setMap(null));
      polygonsRef.current = [];
    };
  }, [properties, zoomLevel, drawPolygon]);

  // ─── SELECTION EFFECT: update only the selected/deselected marker HTML ───
  useEffect(() => {
    const mode = getDisplayMode(zoomLevel);
    if (mode !== 'marker') return;

    // Update all markers: swap HTML only for previously selected and newly selected
    elementByIdRef.current.forEach((el, id) => {
      const isSelected = id === selectedId;
      // Find matching property for this id
      const property = properties.find((p) => p.id === id);
      if (!property) return;

      const currentHtml = auctionMarkerHtml(property, isSelected);
      // Only update if the HTML would differ (selected state changed)
      if (el.innerHTML !== currentHtml) {
        el.innerHTML = currentHtml;
      }
    });
  }, [selectedId, properties, zoomLevel]);

  return null;
});
