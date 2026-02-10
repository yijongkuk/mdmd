'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { LandParcel } from '@/types/land';
import { ZONE_TYPE_COLORS, ZONE_TYPE_LABELS } from '@/types/land';
import { formatArea, formatWon } from '@/lib/utils/format';
import { cn } from '@/lib/cn';
import { getKakaoMapInstance } from './KakaoMap';

interface LandParcelOverlayProps {
  parcels: LandParcel[];
  zoomLevel: number;
  selectedPnu: string | null;
  onSelect: (pnu: string) => void;
}

/**
 * Display mode based on zoom level (Kakao: 1=closest, 14=farthest)
 *  - CLUSTER:  zoom >= 7  → blue circles with parcel count
 *  - MARKER:   zoom 4-6   → individual pin markers per parcel
 *  - POLYGON:  zoom <= 3  → colored polygon fill + area label
 */
type DisplayMode = 'cluster' | 'marker' | 'polygon';

function getDisplayMode(zoom: number): DisplayMode {
  if (zoom >= 4) return 'cluster';
  if (zoom >= 2) return 'marker';
  return 'polygon';
}

// ─── Clustering (직방/다방 style) ────────────────────────────
interface Cluster {
  lat: number;
  lng: number;
  count: number;
  avgArea: number;
}

function clusterParcels(parcels: LandParcel[], zoomLevel: number): Cluster[] {
  if (parcels.length === 0) return [];
  // Finer grid at mid-zoom, coarser at far-zoom
  const cellSize =
    zoomLevel >= 11 ? 0.2
    : zoomLevel >= 9 ? 0.1
    : zoomLevel >= 7 ? 0.05
    : zoomLevel >= 5 ? 0.02
    : 0.01;
  const grid = new Map<string, LandParcel[]>();

  for (const p of parcels) {
    const key = `${Math.floor(p.centroidLat / cellSize)}:${Math.floor(p.centroidLng / cellSize)}`;
    const list = grid.get(key) ?? [];
    list.push(p);
    grid.set(key, list);
  }

  const clusters: Cluster[] = [];
  for (const group of grid.values()) {
    clusters.push({
      lat: group.reduce((s, p) => s + p.centroidLat, 0) / group.length,
      lng: group.reduce((s, p) => s + p.centroidLng, 0) / group.length,
      count: group.length,
      avgArea: Math.round(group.reduce((s, p) => s + p.area, 0) / group.length),
    });
  }
  return clusters;
}

function clusterHtml(count: number, avgArea: number): string {
  // Size scales with count: 1→36px, 5→46px, 10→54px, 20→62px, 50+→72px
  const size =
    count >= 50 ? 72
    : count >= 20 ? 62
    : count >= 10 ? 54
    : count >= 5 ? 46
    : 36;
  const fs = count >= 20 ? 16 : count >= 5 ? 14 : 12;

  // Color intensity by density: few=teal, moderate=blue, many=indigo/purple
  const [bg, shadow] =
    count >= 20 ? ['linear-gradient(135deg,#7c3aed,#6d28d9)', 'rgba(124,58,237,0.45)']
    : count >= 10 ? ['linear-gradient(135deg,#4f46e5,#4338ca)', 'rgba(79,70,229,0.4)']
    : count >= 5 ? ['linear-gradient(135deg,#3b82f6,#2563eb)', 'rgba(59,130,246,0.4)']
    : ['linear-gradient(135deg,#14b8a6,#0d9488)', 'rgba(20,184,166,0.4)'];

  const label = count >= 5
    ? `<div style="font-size:${fs}px;font-weight:800;line-height:1;">${count}</div>
       <div style="font-size:9px;opacity:0.85;margin-top:1px;">유휴지</div>`
    : `<div style="font-size:${fs}px;font-weight:800;line-height:1;">${count}</div>
       <div style="font-size:8px;opacity:0.8;margin-top:1px;">${avgArea}m²</div>`;

  return `<div style="
    width:${size}px;height:${size}px;border-radius:50%;
    background:${bg};
    border:3px solid white;box-shadow:0 2px 10px ${shadow};
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    color:white;cursor:pointer;
    transition:transform .15s;
  " onmouseover="this.style.transform='scale(1.15)'"
    onmouseout="this.style.transform='scale(1)'">${label}</div>`;
}

// ─── Pin Marker ──────────────────────────────────────────────
function markerHtml(parcel: LandParcel, isSelected: boolean): string {
  const color = (parcel.zoneType && ZONE_TYPE_COLORS[parcel.zoneType]) ?? '#94a3b8';
  const label = (parcel.zoneType && ZONE_TYPE_LABELS[parcel.zoneType]) ?? '미확인';
  const ring = isSelected ? 'box-shadow:0 0 0 3px #3b82f6,0 2px 8px rgba(0,0,0,0.25);' : 'box-shadow:0 2px 6px rgba(0,0,0,0.2);';
  // Short address: last two parts (e.g. "역삼동 123-4")
  const parts = parcel.address.split(' ');
  const short = parts.slice(-2).join(' ');

  return `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
    <div style="
      background:white;border-radius:8px;padding:4px 8px;
      border:2px solid ${color};${ring}
      white-space:nowrap;min-width:60px;text-align:center;
      transition:transform .15s;
    " onmouseover="this.style.transform='scale(1.08)'" onmouseout="this.style.transform='scale(1)'">
      <div style="font-size:11px;font-weight:700;color:#1e293b;line-height:1.3;">${short}</div>
      <div style="font-size:9px;color:#64748b;margin-top:1px;">${formatArea(parcel.area)}</div>
      <div style="font-size:8px;font-weight:600;color:white;background:${color};
        border-radius:3px;padding:1px 4px;margin-top:2px;display:inline-block;">${label}</div>
    </div>
    <div style="
      width:0;height:0;
      border-left:6px solid transparent;border-right:6px solid transparent;
      border-top:8px solid ${color};margin-top:-1px;
    "></div>
  </div>`;
}

// ─── Component ───────────────────────────────────────────────
export function LandParcelOverlay({
  parcels,
  zoomLevel,
  selectedPnu,
  onSelect,
}: LandParcelOverlayProps) {
  const [hoveredPnu, setHoveredPnu] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polygonsRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overlaysRef = useRef<any[]>([]);

  const mode = getDisplayMode(zoomLevel);

  // Pan map to a parcel and zoom in
  const panToParcel = useCallback((parcel: LandParcel) => {
    const map = getKakaoMapInstance();
    if (!map || !window.kakao?.maps) return;
    const { kakao } = window;
    map.setCenter(new kakao.maps.LatLng(parcel.centroidLat, parcel.centroidLng));
    if (map.getLevel() > 4) map.setLevel(4);
  }, []);

  const handleCardClick = useCallback((parcel: LandParcel) => {
    onSelect(parcel.pnu);
    panToParcel(parcel);
  }, [onSelect, panToParcel]);

  // ─── Main rendering effect ─────────────────────────────────
  useEffect(() => {
    const map = getKakaoMapInstance();
    if (!map || !window.kakao?.maps) return;

    // Clear all previous overlays
    polygonsRef.current.forEach((p) => p.setMap(null));
    overlaysRef.current.forEach((o) => o.setMap(null));
    polygonsRef.current = [];
    overlaysRef.current = [];

    const { kakao } = window;

    // ── CLUSTER MODE ──
    if (mode === 'cluster') {
      const clusters = clusterParcels(parcels, zoomLevel);
      clusters.forEach((cluster) => {
        const el = document.createElement('div');
        el.innerHTML = clusterHtml(cluster.count, cluster.avgArea);
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => {
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
      parcels.forEach((parcel) => {
        const isSelected = parcel.pnu === selectedPnu;
        const el = document.createElement('div');
        el.innerHTML = markerHtml(parcel, isSelected);
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => onSelect(parcel.pnu));

        const ov = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(parcel.centroidLat, parcel.centroidLng),
          content: el,
          yAnchor: 1.2,
          xAnchor: 0.5,
        });
        ov.setMap(map);
        overlaysRef.current.push(ov);
      });
    }

    // ── POLYGON MODE ──
    if (mode === 'polygon') {
      parcels.forEach((parcel) => {
        const coords = parcel.geometryJson.coordinates[0];
        const path = coords.map(
          ([lng, lat]: number[]) => new kakao.maps.LatLng(lat, lng)
        );
        const color = (parcel.zoneType && ZONE_TYPE_COLORS[parcel.zoneType]) ?? '#94a3b8';
        const isSelected = parcel.pnu === selectedPnu;

        const polygon = new kakao.maps.Polygon({
          path,
          strokeWeight: isSelected ? 3 : 2,
          strokeColor: isSelected ? '#3b82f6' : color,
          strokeOpacity: 0.9,
          fillColor: color,
          fillOpacity: isSelected ? 0.6 : 0.35,
        });
        polygon.setMap(map);
        polygonsRef.current.push(polygon);

        kakao.maps.event.addListener(polygon, 'click', () => onSelect(parcel.pnu));
        kakao.maps.event.addListener(polygon, 'mouseover', () => {
          polygon.setOptions({ fillOpacity: 0.55, strokeWeight: 3 });
        });
        kakao.maps.event.addListener(polygon, 'mouseout', () => {
          polygon.setOptions({
            fillOpacity: isSelected ? 0.6 : 0.35,
            strokeWeight: isSelected ? 3 : 2,
          });
        });

        // Area label
        const labelContent = `<div style="
          padding:3px 8px;background:white;border:1px solid ${color};
          border-radius:6px;font-size:11px;font-weight:600;color:#334155;
          white-space:nowrap;pointer-events:none;
          box-shadow:0 1px 4px rgba(0,0,0,0.12);
        ">${parcel.address.split(' ').slice(-2).join(' ')} · ${formatArea(parcel.area)}</div>`;

        const labelOv = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(parcel.centroidLat, parcel.centroidLng),
          content: labelContent,
          yAnchor: 1.4,
        });
        labelOv.setMap(map);
        overlaysRef.current.push(labelOv);
      });
    }

    return () => {
      polygonsRef.current.forEach((p) => p.setMap(null));
      overlaysRef.current.forEach((o) => o.setMap(null));
      polygonsRef.current = [];
      overlaysRef.current = [];
    };
  }, [parcels, selectedPnu, zoomLevel, mode, onSelect]);

  if (parcels.length === 0) return null;

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 max-h-[40%] overflow-y-auto bg-white/95 backdrop-blur-sm border-t border-slate-200 shadow-lg">
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-2">
        <span className="text-sm font-medium text-slate-700">
          필지 {parcels.length}건
        </span>
        <span className="text-xs text-slate-400">
          클릭하면 해당 위치로 이동합니다
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {parcels.map((parcel) => (
          <ParcelCard
            key={parcel.pnu}
            parcel={parcel}
            isSelected={parcel.pnu === selectedPnu}
            isHovered={parcel.pnu === hoveredPnu}
            onSelect={() => handleCardClick(parcel)}
            onHover={(h) => setHoveredPnu(h ? parcel.pnu : null)}
          />
        ))}
      </div>
    </div>
  );
}

function ParcelCard({
  parcel,
  isSelected,
  isHovered,
  onSelect,
  onHover,
}: {
  parcel: LandParcel;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: () => void;
  onHover: (h: boolean) => void;
}) {
  const color = (parcel.zoneType && ZONE_TYPE_COLORS[parcel.zoneType]) ?? '#94a3b8';
  const label = (parcel.zoneType && ZONE_TYPE_LABELS[parcel.zoneType]) ?? '미확인';

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={cn(
        'w-full rounded-lg border p-3 text-left transition-all cursor-pointer',
        isSelected
          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
          : isHovered
            ? 'border-slate-300 bg-slate-50'
            : 'border-slate-200 bg-white hover:border-slate-300'
      )}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-900 leading-tight">
          {parcel.address}
        </p>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
          style={{ backgroundColor: color }}
        >
          {label}
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span>{formatArea(parcel.area)}</span>
        {parcel.officialPrice != null && <span>{formatWon(parcel.officialPrice)}/m²</span>}
      </div>
    </button>
  );
}
