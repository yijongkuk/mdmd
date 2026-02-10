'use client';

import { useRef, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { LocalPoint } from '@/lib/geo/coordTransform';
import { localToWgs84 } from '@/lib/geo/coordTransform';

export interface TerrainElevationGrid {
  cols: number;
  rows: number;
  minX: number;
  minZ: number;
  cellX: number;
  cellZ: number;
  heights: number[];
}

/** Sample terrain height at a local (x, z) point via bilinear interpolation */
export function sampleTerrainHeight(grid: TerrainElevationGrid, x: number, z: number): number {
  const gx = (x - grid.minX) / grid.cellX;
  const gz = (z - grid.minZ) / grid.cellZ;
  const x0 = Math.max(0, Math.min(grid.cols - 2, Math.floor(gx)));
  const z0 = Math.max(0, Math.min(grid.rows - 2, Math.floor(gz)));
  const tx = Math.max(0, Math.min(1, gx - x0));
  const tz = Math.max(0, Math.min(1, gz - z0));
  const v00 = grid.heights[z0 * grid.cols + x0];
  const v10 = grid.heights[z0 * grid.cols + x0 + 1];
  const v01 = grid.heights[(z0 + 1) * grid.cols + x0];
  const v11 = grid.heights[(z0 + 1) * grid.cols + x0 + 1];
  return (1 - tx) * (1 - tz) * v00 + tx * (1 - tz) * v10 +
         (1 - tx) * tz * v01 + tx * tz * v11;
}

interface TerrainMeshProps {
  /** Parcel polygon in local meter coords */
  polygon: LocalPoint[];
  /** Parcel centroid in WGS84 */
  centroidLng: number;
  centroidLat: number;
  /** Callback with the terrain height at parcel centroid (for building base level) */
  onBaseElevation?: (y: number) => void;
  /** Callback with the elevation grid for other components */
  onElevationGrid?: (grid: TerrainElevationGrid) => void;
}

/** SRTM native resolution ~30m — sample at this spacing to get real data */
const SAMPLE_SPACING = 25;
/** Padding around parcel to capture surrounding terrain gradient */
const AREA_PADDING = 50;
/** Fine mesh resolution for rendering */
const MESH_RES = 40;
/** Laplacian smoothing iterations (removes staircase artifacts) */
const SMOOTH_ITERATIONS = 4;

interface ElevationGrid {
  cols: number;
  rows: number;
  minX: number;
  minZ: number;
  cellX: number;
  cellZ: number;
  heights: number[];
  minElevation: number;
  maxElevation: number;
}

/**
 * Laplacian smoothing — replaces each interior vertex with the average
 * of its 4 neighbors. Edges are left unchanged. Repeated application
 * turns sharp SRTM staircase artifacts into smooth slopes.
 */
function smoothHeights(grid: number[], cols: number, rows: number, iterations: number): number[] {
  let current = [...grid];
  for (let iter = 0; iter < iterations; iter++) {
    const next = [...current];
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        const idx = r * cols + c;
        next[idx] =
          (current[idx - 1] + current[idx + 1] +
            current[idx - cols] + current[idx + cols]) / 4;
      }
    }
    current = next;
  }
  return current;
}

/**
 * Bilinear interpolation from a coarse grid to a fine grid.
 * coarseGrid is [rows][cols] row-major, returns fine grid [fineRows * fineCols].
 */
function bilinearUpsample(
  coarse: number[],
  cCols: number,
  cRows: number,
  cMinX: number,
  cMinZ: number,
  cCellX: number,
  cCellZ: number,
  fMinX: number,
  fMinZ: number,
  fCellX: number,
  fCellZ: number,
  fCols: number,
  fRows: number,
): number[] {
  const fine: number[] = new Array(fCols * fRows);

  for (let fr = 0; fr < fRows; fr++) {
    for (let fc = 0; fc < fCols; fc++) {
      const worldX = fMinX + fc * fCellX;
      const worldZ = fMinZ + fr * fCellZ;

      // Map to coarse grid coordinates
      const gx = (worldX - cMinX) / cCellX;
      const gz = (worldZ - cMinZ) / cCellZ;

      const x0 = Math.max(0, Math.min(cCols - 2, Math.floor(gx)));
      const z0 = Math.max(0, Math.min(cRows - 2, Math.floor(gz)));
      const x1 = x0 + 1;
      const z1 = z0 + 1;

      const tx = Math.max(0, Math.min(1, gx - x0));
      const tz = Math.max(0, Math.min(1, gz - z0));

      const v00 = coarse[z0 * cCols + x0];
      const v10 = coarse[z0 * cCols + x1];
      const v01 = coarse[z1 * cCols + x0];
      const v11 = coarse[z1 * cCols + x1];

      fine[fr * fCols + fc] =
        (1 - tx) * (1 - tz) * v00 +
        tx * (1 - tz) * v10 +
        (1 - tx) * tz * v01 +
        tx * tz * v11;
    }
  }

  return fine;
}

export function TerrainMesh({
  polygon,
  centroidLng,
  centroidLat,
  onBaseElevation,
  onElevationGrid,
}: TerrainMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [grid, setGrid] = useState<ElevationGrid | null>(null);

  // Compute bounding box with wide padding
  const bounds = useMemo(() => {
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const p of polygon) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    return {
      minX: minX - AREA_PADDING,
      maxX: maxX + AREA_PADDING,
      minZ: minZ - AREA_PADDING,
      maxZ: maxZ + AREA_PADDING,
    };
  }, [polygon]);

  // Fetch elevation data — coarse sampling, then upsample + smooth
  useEffect(() => {
    let cancelled = false;

    async function fetchElevation() {
      const areaW = bounds.maxX - bounds.minX;
      const areaD = bounds.maxZ - bounds.minZ;

      // Coarse grid: sample at ~SAMPLE_SPACING intervals (matching SRTM)
      const cCols = Math.max(3, Math.ceil(areaW / SAMPLE_SPACING) + 1);
      const cRows = Math.max(3, Math.ceil(areaD / SAMPLE_SPACING) + 1);
      const cCellX = areaW / (cCols - 1);
      const cCellZ = areaD / (cRows - 1);

      // Build coarse sample points
      const locations: { latitude: number; longitude: number }[] = [];
      for (let r = 0; r < cRows; r++) {
        for (let c = 0; c < cCols; c++) {
          const localX = bounds.minX + c * cCellX;
          const localZ = bounds.minZ + r * cCellZ;
          const { lng, lat } = localToWgs84(localX, localZ, centroidLng, centroidLat);
          locations.push({ latitude: lat, longitude: lng });
        }
      }

      try {
        const res = await fetch('/api/elevation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locations }),
        });

        if (!res.ok || cancelled) return;
        const data = await res.json();
        const results: { elevation: number }[] = data?.results ?? [];
        if (results.length !== cCols * cRows || cancelled) return;

        // Extract raw elevations
        const rawElev = results.map((r) => r.elevation);

        // Find global min to normalize
        let minElev = Infinity;
        for (const e of rawElev) if (e < minElev) minElev = e;
        const coarseHeights = rawElev.map((e) => e - minElev);

        // Smooth the coarse grid to remove staircase artifacts
        const smoothedCoarse = smoothHeights(coarseHeights, cCols, cRows, SMOOTH_ITERATIONS);

        // Fine mesh grid
        const fCols = MESH_RES;
        const fRows = MESH_RES;
        const fCellX = areaW / (fCols - 1);
        const fCellZ = areaD / (fRows - 1);

        // Bilinear interpolation: coarse → fine
        const fineHeights = bilinearUpsample(
          smoothedCoarse,
          cCols, cRows,
          bounds.minX, bounds.minZ,
          cCellX, cCellZ,
          bounds.minX, bounds.minZ,
          fCellX, fCellZ,
          fCols, fRows,
        );

        // Recalculate min/max from fine heights
        let maxH = -Infinity;
        for (const h of fineHeights) if (h > maxH) maxH = h;

        if (!cancelled) {
          const gridData = {
            cols: fCols,
            rows: fRows,
            minX: bounds.minX,
            minZ: bounds.minZ,
            cellX: fCellX,
            cellZ: fCellZ,
            heights: fineHeights,
            minElevation: minElev,
            maxElevation: minElev + maxH,
          };
          setGrid(gridData);
          onElevationGrid?.(gridData);
        }
      } catch (err) {
        console.error('Terrain elevation fetch error:', err);
      }
    }

    fetchElevation();
    return () => { cancelled = true; };
  }, [bounds, centroidLng, centroidLat]);

  // Report centroid elevation to parent (parcel centroid = local 0,0)
  useEffect(() => {
    if (!grid || !onBaseElevation) return;
    const gx = (0 - grid.minX) / grid.cellX;
    const gz = (0 - grid.minZ) / grid.cellZ;
    const x0 = Math.max(0, Math.min(grid.cols - 2, Math.floor(gx)));
    const z0 = Math.max(0, Math.min(grid.rows - 2, Math.floor(gz)));
    const tx = Math.max(0, Math.min(1, gx - x0));
    const tz = Math.max(0, Math.min(1, gz - z0));
    const v00 = grid.heights[z0 * grid.cols + x0];
    const v10 = grid.heights[z0 * grid.cols + x0 + 1];
    const v01 = grid.heights[(z0 + 1) * grid.cols + x0];
    const v11 = grid.heights[(z0 + 1) * grid.cols + x0 + 1];
    const h = (1 - tx) * (1 - tz) * v00 + tx * (1 - tz) * v10 +
              (1 - tx) * tz * v01 + tx * tz * v11;
    onBaseElevation(h);
  }, [grid, onBaseElevation]);

  // Build geometry from elevation grid
  const geometry = useMemo(() => {
    if (!grid) return null;

    const { cols, rows, minX, minZ, cellX, cellZ, heights } = grid;

    const vertices = new Float32Array(cols * rows * 3);
    const uvs = new Float32Array(cols * rows * 2);
    const indices: number[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        vertices[idx * 3] = minX + c * cellX;
        vertices[idx * 3 + 1] = heights[idx];
        vertices[idx * 3 + 2] = minZ + r * cellZ;

        uvs[idx * 2] = c / (cols - 1);
        uvs[idx * 2 + 1] = r / (rows - 1);
      }
    }

    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c;
        const b = r * cols + c + 1;
        const d = (r + 1) * cols + c;
        const e = (r + 1) * cols + c + 1;
        indices.push(a, d, b);
        indices.push(b, d, e);
      }
    }

    const bufGeo = new THREE.BufferGeometry();
    bufGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    bufGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    bufGeo.setIndex(indices);
    bufGeo.computeVertexNormals();

    return bufGeo;
  }, [grid]);

  if (!geometry || !grid) return null;

  return (
    <group>
      {/* 반투명 면 — 지형이 살짝 비쳐 보임 */}
      <mesh geometry={geometry} receiveShadow>
        <meshBasicMaterial
          color="#e8e8e8"
          transparent
          opacity={0.12}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* 와이어프레임 삼각 그리드 */}
      <mesh ref={meshRef} geometry={geometry}>
        <meshBasicMaterial
          wireframe
          color="#c0c0c0"
          transparent
          opacity={0.35}
        />
      </mesh>
    </group>
  );
}
