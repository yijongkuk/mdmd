'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { wgs84ToLocal } from '@/lib/geo/coordTransform';

interface SatelliteOverlayProps {
  centroidLat: number;
  centroidLng: number;
  radius: number; // meters
}

/** WGS84 → Slippy-map tile coordinates at given zoom */
function lngLatToTile(lng: number, lat: number, zoom: number): { tx: number; ty: number } {
  const n = 2 ** zoom;
  const tx = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const ty = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { tx, ty };
}

/** Tile grid coordinate → WGS84 (top-left corner of tile) */
function tileToLngLat(tx: number, ty: number, zoom: number): { lng: number; lat: number } {
  const n = 2 ** zoom;
  const lng = (tx / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lng, lat };
}

const TILE_SIZE = 256;
const ZOOM = 18;

export function SatelliteOverlay({ centroidLat, centroidLng, radius }: SatelliteOverlayProps) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  const [planeGeom, setPlaneGeom] = useState<{ width: number; height: number; cx: number; cz: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Compute bounding box in WGS84 and tile range
  const tileInfo = useMemo(() => {
    // Approximate offset in degrees for the given radius
    const dLat = radius / 110540;
    const dLng = radius / (Math.cos(centroidLat * Math.PI / 180) * 111320);

    const minLng = centroidLng - dLng;
    const maxLng = centroidLng + dLng;
    const minLat = centroidLat - dLat;
    const maxLat = centroidLat + dLat;

    const topLeft = lngLatToTile(minLng, maxLat, ZOOM);
    const bottomRight = lngLatToTile(maxLng, minLat, ZOOM);

    const txMin = topLeft.tx;
    const txMax = bottomRight.tx;
    const tyMin = topLeft.ty;
    const tyMax = bottomRight.ty;

    const cols = txMax - txMin + 1;
    const rows = tyMax - tyMin + 1;

    // World corners of tile grid in WGS84
    const gridTopLeft = tileToLngLat(txMin, tyMin, ZOOM);
    const gridBottomRight = tileToLngLat(txMax + 1, tyMax + 1, ZOOM);

    // Convert to local meters
    const localTL = wgs84ToLocal(gridTopLeft.lng, gridTopLeft.lat, centroidLng, centroidLat);
    const localBR = wgs84ToLocal(gridBottomRight.lng, gridBottomRight.lat, centroidLng, centroidLat);

    const width = localBR.x - localTL.x;
    const height = localTL.z - localBR.z; // z increases northward in local coords
    const cx = (localTL.x + localBR.x) / 2;
    const cz = (localTL.z + localBR.z) / 2;

    return { txMin, txMax, tyMin, tyMax, cols, rows, width, height, cx, cz };
  }, [centroidLat, centroidLng, radius]);

  // Fetch tiles and compose onto canvas
  useEffect(() => {
    const { txMin, txMax, tyMin, tyMax, cols, rows, width, height, cx, cz } = tileInfo;

    let cancelled = false;

    const canvas = document.createElement('canvas');
    canvas.width = cols * TILE_SIZE;
    canvas.height = rows * TILE_SIZE;
    canvasRef.current = canvas;

    const ctx = canvas.getContext('2d')!;
    // Fill with dark background while loading
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = false; // canvas top=north → UV v=0=north, Z-mirror 그룹에서 방향 일치
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    setTexture(tex);
    setPlaneGeom({ width: Math.abs(width), height: Math.abs(height), cx, cz });

    // Fetch each tile
    let loaded = 0;
    const total = cols * rows;

    for (let ty = tyMin; ty <= tyMax; ty++) {
      for (let tx = txMin; tx <= txMax; tx++) {
        const col = tx - txMin;
        const row = ty - tyMin;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          if (cancelled) return;
          ctx.drawImage(img, col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          loaded++;
          tex.needsUpdate = true;
        };
        img.onerror = () => {
          loaded++;
        };
        img.src = `/api/satellite-tile?z=${ZOOM}&x=${tx}&y=${ty}`;
      }
    }

    return () => {
      cancelled = true;
      tex.dispose();
    };
  }, [tileInfo]);

  if (!texture || !planeGeom) return null;

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[planeGeom.cx, -0.3, planeGeom.cz]}
    >
      <planeGeometry args={[planeGeom.width, planeGeom.height]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={0.55}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}
