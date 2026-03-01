'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, useGizmoContext } from '@react-three/drei';
import * as THREE from 'three';
import { useBuilderStore, type FloorAreaInfo } from '@/features/builder/store';
import { getModuleById } from '@/lib/constants/modules';
import { GRID_SIZE } from '@/lib/constants/grid';
import { BuilderGrid } from './BuilderGrid';
import { ParcelGrid } from './ParcelGrid';
import { ParcelBoundary } from './ParcelBoundary';
import { PlacedModule } from './PlacedModule';
import { GhostModule } from './GhostModule';
import { ModuleDragger } from './ModuleDragger';
import { BoxSelect } from './BoxSelect';
import { RegulationBoundary } from './RegulationBoundary';
import { RegulationBoundaryPolygon } from './RegulationBoundaryPolygon';
import { BuildableVolume } from './BuildableVolume';
import { TerrainMesh, type TerrainElevationGrid } from './TerrainMesh';
import { SurroundingBuildings } from './SurroundingBuildings';
import { SurroundingRoads } from './SurroundingRoads';
import { SatelliteOverlay } from './SatelliteOverlay';
import { geoJsonRingToLocal, wgs84ToLocal } from '@/lib/geo/coordTransform';
import { polygonInset, polygonBounds, polygonSignedArea, gridCellsInPolygon } from '@/lib/geo/polygonClip';
import type { ParcelInfo, SurroundingBuilding, SurroundingRoad } from '@/types/land';
import type { LocalPoint } from '@/lib/geo/coordTransform';

/** Ray-casting point-in-polygon */
function pointInPolygon(px: number, pz: number, poly: LocalPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, zi = poly[i].z;
    const xj = poly[j].x, zj = poly[j].z;
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Count overlap between a shifted parcel and surrounding obstacles.
 * Bidirectional: obstacle vertices inside parcel + parcel vertices inside obstacles.
 */
function countOverlap(
  parcelPoly: LocalPoint[],
  dx: number,
  dz: number,
  buildingLocalPolys: LocalPoint[][],
  roadLocalPoints: LocalPoint[][],
  parcelSamplePts: LocalPoint[],
): number {
  let overlap = 0;

  // 1) Obstacle vertices inside shifted parcel
  for (const bPoly of buildingLocalPolys) {
    for (const pt of bPoly) {
      if (pointInPolygon(pt.x - dx, pt.z - dz, parcelPoly)) overlap++;
    }
  }
  for (const rPts of roadLocalPoints) {
    for (const pt of rPts) {
      if (pointInPolygon(pt.x - dx, pt.z - dz, parcelPoly)) overlap++;
    }
  }

  // 2) Shifted parcel sample points inside any building polygon
  for (const sp of parcelSamplePts) {
    const sx = sp.x + dx;
    const sz = sp.z + dz;
    for (const bPoly of buildingLocalPolys) {
      if (pointInPolygon(sx, sz, bPoly)) { overlap++; break; }
    }
  }

  return overlap;
}

/**
 * Compute parcel offset to minimize overlap with surrounding buildings/roads.
 * Limited to ±5m (dataset alignment offset is typically 1-3m).
 * Two-phase: coarse (1m steps) → fine (0.25m steps around best).
 */
function computeParcelOffset(
  parcelPoly: LocalPoint[],
  buildingLocalPolys: LocalPoint[][],
  roadLocalPoints: LocalPoint[][],
): { x: number; z: number } {
  // Sample points along parcel edges + interior for reverse overlap check
  const parcelSamplePts: LocalPoint[] = [...parcelPoly];
  for (let i = 0; i < parcelPoly.length; i++) {
    const a = parcelPoly[i];
    const b = parcelPoly[(i + 1) % parcelPoly.length];
    parcelSamplePts.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
  }

  // Check if there's any overlap at zero offset
  const zeroOverlap = countOverlap(parcelPoly, 0, 0, buildingLocalPolys, roadLocalPoints, parcelSamplePts);
  if (zeroOverlap === 0) return { x: 0, z: 0 };

  // Phase 1: Coarse search — ±5m in 1m steps (dataset offset is 1-3m, never more)
  const COARSE_RANGE = 5;
  const COARSE_STEP = 1;
  let bestDx = 0, bestDz = 0, bestScore = Infinity;

  for (let dx = -COARSE_RANGE; dx <= COARSE_RANGE; dx += COARSE_STEP) {
    for (let dz = -COARSE_RANGE; dz <= COARSE_RANGE; dz += COARSE_STEP) {
      const ov = countOverlap(parcelPoly, dx, dz, buildingLocalPolys, roadLocalPoints, parcelSamplePts);
      const dist = Math.sqrt(dx * dx + dz * dz);
      const score = ov * 10000 + dist;
      if (score < bestScore) {
        bestScore = score;
        bestDx = dx;
        bestDz = dz;
      }
    }
  }

  // Phase 2: Fine search — ±1m around coarse best in 0.25m steps
  const FINE_RANGE = 1;
  const FINE_STEP = 0.25;
  let fineDx = bestDx, fineDz = bestDz;
  let fineScore = bestScore;

  for (let dx = bestDx - FINE_RANGE; dx <= bestDx + FINE_RANGE; dx += FINE_STEP) {
    for (let dz = bestDz - FINE_RANGE; dz <= bestDz + FINE_RANGE; dz += FINE_STEP) {
      // Clamp to max range
      if (Math.abs(dx) > COARSE_RANGE || Math.abs(dz) > COARSE_RANGE) continue;
      const ov = countOverlap(parcelPoly, dx, dz, buildingLocalPolys, roadLocalPoints, parcelSamplePts);
      const dist = Math.sqrt(dx * dx + dz * dz);
      const score = ov * 10000 + dist;
      if (score < fineScore) {
        fineScore = score;
        fineDx = dx;
        fineDz = dz;
      }
    }
  }

  return { x: fineDx, z: fineDz };
}

// ─── Direction Cube (동서남북 방위 큐브) ─────────────────────
const DIRECTION_FACES: Array<{
  label: string;
  position: [number, number, number];
  rotation: [number, number, number];
  direction: [number, number, number];
  isNorth?: boolean;
}> = [
  { label: '동', position: [0.501, 0, 0], rotation: [0, Math.PI / 2, 0], direction: [1, 0, 0] },
  { label: '서', position: [-0.501, 0, 0], rotation: [0, -Math.PI / 2, 0], direction: [-1, 0, 0] },
  { label: '위', position: [0, 0.501, 0], rotation: [-Math.PI / 2, 0, 0], direction: [0, 1, 0] },
  { label: '아래', position: [0, -0.501, 0], rotation: [Math.PI / 2, 0, 0], direction: [0, -1, 0] },
  { label: '남', position: [0, 0, 0.501], rotation: [0, 0, 0], direction: [0, 0, 1] },
  { label: '북', position: [0, 0, -0.501], rotation: [0, Math.PI, 0], direction: [0, 0, -1], isNorth: true },
];

function createFaceCanvas(text: string, isNorth: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  // Semi-opaque background so back-face text doesn't bleed through
  ctx.fillStyle = isNorth ? 'rgba(239, 68, 68, 0.35)' : 'rgba(255, 255, 255, 0.75)';
  ctx.fillRect(0, 0, 128, 128);

  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 68);

  return canvas;
}

function DirectionCube() {
  const { tweenCamera } = useGizmoContext();
  const [hovered, setHovered] = useState<number | null>(null);

  const textures = useMemo(
    () => DIRECTION_FACES.map((f) => new THREE.CanvasTexture(createFaceCanvas(f.label, !!f.isNorth))),
    [],
  );

  const edgesGeom = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), []);

  return (
    <group scale={60}>
      <lineSegments geometry={edgesGeom}>
        <lineBasicMaterial color="#94a3b8" />
      </lineSegments>

      {DIRECTION_FACES.map((face, i) => (
        <mesh
          key={face.label}
          position={face.position}
          rotation={face.rotation}
          onClick={() => tweenCamera(new THREE.Vector3(...face.direction))}
          onPointerOver={() => setHovered(i)}
          onPointerOut={() => setHovered(null)}
        >
          <planeGeometry args={[0.98, 0.98]} />
          <meshBasicMaterial
            map={textures[i]}
            transparent
            opacity={hovered === i ? 0.95 : face.isNorth ? 0.9 : 0.85}
            side={THREE.DoubleSide}
            depthTest={false}
          />
        </mesh>
      ))}
    </group>
  );
}

const GIZMO_MARGIN_CLOSED = 80;
const GIZMO_MARGIN_OPEN = 368; // w-72 (288px) + 80px base

function AnimatedGizmo({ rightSidebarOpen }: { rightSidebarOpen: boolean }) {
  const target = rightSidebarOpen ? GIZMO_MARGIN_OPEN : GIZMO_MARGIN_CLOSED;
  const currentRef = useRef(target);
  const [marginX, setMarginX] = useState(target);

  useFrame(() => {
    const cur = currentRef.current;
    if (Math.abs(cur - target) < 20) {
      if (cur !== target) { currentRef.current = target; setMarginX(target); }
      return;
    }
    currentRef.current = THREE.MathUtils.lerp(cur, target, 0.5);
    setMarginX(Math.round(currentRef.current));
  });

  return (
    <GizmoHelper alignment="top-right" margin={[marginX, 80]}>
      <DirectionCube />
    </GizmoHelper>
  );
}

interface BuilderCanvasProps {
  boundaryWidth?: number;
  boundaryDepth?: number;
  boundaryHeight?: number;
  parcelInfo?: ParcelInfo | null;
  showSurrounding?: boolean;
  showSatellite?: boolean;
  rightSidebarOpen?: boolean;
}

function Scene({ boundaryWidth, boundaryDepth, boundaryHeight, parcelInfo, showSurrounding = true, showSatellite = false, rightSidebarOpen = true }: BuilderCanvasProps) {
  const activeTool = useBuilderStore((s) => s.activeTool);
  const placements = useBuilderStore((s) => s.placements);
  const currentFloor = useBuilderStore((s) => s.currentFloor);
  const visibleFloors = useBuilderStore((s) => s.visibleFloors);
  const selectedPlacementIds = useBuilderStore((s) => s.selectedPlacementIds);
  const gridOffset = useBuilderStore((s) => s.gridOffset);
  const viewAllFloors = useBuilderStore((s) => s.viewAllFloors);
  const gridSnap = useBuilderStore((s) => s.gridSnap);
  const terrainBaseY = useBuilderStore((s) => s.terrainBaseY);
  const setTerrainBaseY = useBuilderStore((s) => s.setTerrainBaseY);
  const setMaxFloors = useBuilderStore((s) => s.setMaxFloors);

  const visiblePlacements = placements.filter((p) => visibleFloors.includes(p.floor));

  // Convert GeoJSON polygon to local meter coordinates
  const parcelPolygon = useMemo(() => {
    if (!parcelInfo?.geometryJson?.coordinates?.[0]) return null;
    const ring = parcelInfo.geometryJson.coordinates[0];
    if (ring.length < 3) return null;
    const local = geoJsonRingToLocal(ring, parcelInfo.centroidLng, parcelInfo.centroidLat);
    return local.length >= 3 ? local : null;
  }, [parcelInfo]);

  // Parcel bounding box for positioning helpers
  const parcelBounds = useMemo(() => {
    return parcelPolygon ? polygonBounds(parcelPolygon) : null;
  }, [parcelPolygon]);

  // Compute setback-inset polygon (대지안의 공지, default 1m)
  const DEFAULT_SETBACK = 1;
  const regulationPolygon = useMemo(() => {
    if (!parcelPolygon) return null;
    const inset = polygonInset(parcelPolygon, DEFAULT_SETBACK);
    return inset.length >= 3 ? inset : null;
  }, [parcelPolygon]);

  // Compute buildable volume:
  //   buildablePolygon = 건폐율 스케일된 폴리곤 (와이어프레임용, 대지 형태 유지)
  //   buildableCells = regulationPolygon 내 셀 집합 (충돌 검사용, 이형 대지 지원)
  //   volumeHeight = 용적률 ÷ 건폐율 → 층수 → 높이
  const { buildablePolygon, buildableCells, volumeHeight, effectiveFloors } = useMemo(() => {
    if (!regulationPolygon || !parcelInfo) return { buildablePolygon: null, buildableCells: null, volumeHeight: 0, effectiveFloors: 0 };

    const reg = parcelInfo.regulation;
    const maxCoverage = reg?.maxCoverageRatio ?? 60;
    const maxFAR = reg?.maxFloorAreaRatio ?? 200;
    const maxFootprint = parcelInfo.area * maxCoverage / 100;

    // 1. Cells within regulation polygon — for collision detection (handles concave parcels)
    const cells = gridCellsInPolygon(regulationPolygon, GRID_SIZE, gridOffset.x, gridOffset.z);

    // 2. Regulation polygon area (signed area → absolute)
    const regArea = Math.abs(polygonSignedArea(regulationPolygon));

    // 3. Scale polygon from centroid if area exceeds 건폐율 limit
    let footprint = regulationPolygon;
    let footprintArea = regArea;
    if (regArea > maxFootprint) {
      const scale = Math.sqrt(maxFootprint / regArea);
      // Compute centroid
      let cx = 0, cz = 0;
      for (const p of regulationPolygon) { cx += p.x; cz += p.z; }
      cx /= regulationPolygon.length;
      cz /= regulationPolygon.length;
      // Scale each vertex toward centroid
      footprint = regulationPolygon.map(p => ({
        x: cx + (p.x - cx) * scale,
        z: cz + (p.z - cz) * scale,
      }));
      footprintArea = maxFootprint;
    }

    // 4. Volume height — 용적률 ÷ 건폐율 = 층수, capped by zone limits
    const maxTotalFloorArea = parcelInfo.area * maxFAR / 100;
    const floorsFromFAR = Math.floor(maxTotalFloorArea / footprintArea);
    const maxFloors = reg?.maxFloors ?? 0;
    const maxHeight = reg?.maxHeight ?? 0;
    const floorsCap = maxFloors > 0 ? maxFloors : Infinity;
    const heightCap = maxHeight > 0 ? Math.floor(maxHeight / 3) : Infinity;
    const effectiveFloors = Math.min(floorsFromFAR, floorsCap, heightCap);
    const height = effectiveFloors * 3;

    return { buildablePolygon: footprint, buildableCells: cells, volumeHeight: height, effectiveFloors };
  }, [regulationPolygon, parcelInfo, gridOffset]);

  // Sync effective floors to store so FloorNavigator shows correct count
  useEffect(() => {
    if (effectiveFloors > 0) setMaxFloors(effectiveFloors);
  }, [effectiveFloors, setMaxFloors]);

  // Compute per-floor areas (with solar clipping) and push to store
  const setFloorAreas = useBuilderStore((s) => s.setFloorAreas);
  const solarNorthZ = useMemo(() => {
    if (regulationPolygon && boundaryHeight && boundaryHeight > 9) {
      return polygonBounds(regulationPolygon).maxZ;
    }
    return null;
  }, [regulationPolygon, boundaryHeight]);

  const floorAreas = useMemo<FloorAreaInfo[]>(() => {
    if (!buildablePolygon || volumeHeight <= 0) return [];

    const baseArea = Math.abs(polygonSignedArea(buildablePolygon));
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const p of buildablePolygon) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const fullDepth = maxZ - minZ;

    const FLOOR_H = 3;
    const numFloors = Math.floor(volumeHeight / FLOOR_H);
    const areas: FloorAreaInfo[] = [];

    for (let f = 1; f <= numFloors; f++) {
      const ceilingY = f * FLOOR_H;
      let clippedMaxZ = maxZ;
      if (solarNorthZ != null && ceilingY > 9) {
        clippedMaxZ = Math.min(maxZ, solarNorthZ - (ceilingY - 9) / 2);
      }
      if (clippedMaxZ <= minZ) break;
      const w = maxX - minX;
      const d = clippedMaxZ - minZ;
      // Solar-clipped area: proportional to depth reduction
      const area = clippedMaxZ < maxZ ? baseArea * (d / fullDepth) : baseArea;
      areas.push({ floor: f, area, width: w, depth: d });
    }
    return areas;
  }, [buildablePolygon, volumeHeight, solarNorthZ]);

  useEffect(() => {
    setFloorAreas(floorAreas);
  }, [floorAreas, setFloorAreas]);

  // Initial camera: position above parcel center looking down
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const initialCameraSetRef = useRef(false);

  useEffect(() => {
    if (!parcelBounds || initialCameraSetRef.current) return;
    const ctrl = controlsRef.current;
    if (!ctrl) return;

    // Parcel center in world coords (Z-mirrored by parent group)
    const cx = (parcelBounds.minX + parcelBounds.maxX) / 2;
    const cz = (parcelBounds.minZ + parcelBounds.maxZ) / 2;
    const worldX = cx;
    const worldZ = -cz;

    // Distance to fit parcel in view
    const extentX = parcelBounds.maxX - parcelBounds.minX;
    const extentZ = parcelBounds.maxZ - parcelBounds.minZ;
    const maxExtent = Math.max(extentX, extentZ, 20);
    const fovRad = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180;
    const dist = (maxExtent * 2.0) / (2 * Math.tan(fovRad / 2));

    // Top-down with slight south angle for 3D perspective
    camera.position.set(worldX, dist, worldZ + dist * 0.15);
    ctrl.target.set(worldX, 0, worldZ);
    ctrl.update();

    initialCameraSetRef.current = true;
  }, [parcelBounds, camera]);

  const hasTerrain = !!(parcelPolygon && parcelInfo);
  const [elevationGrid, setElevationGrid] = useState<TerrainElevationGrid | null>(null);

  // Surrounding buildings/roads context
  const [surroundingBuildings, setSurroundingBuildings] = useState<SurroundingBuilding[]>([]);
  const [surroundingRoads, setSurroundingRoads] = useState<SurroundingRoad[]>([]);

  // Compute radius to match terrain extent (parcel bounds + 50m padding)
  const surroundingRadius = useMemo(() => {
    if (!parcelBounds) return 100;
    const halfW = Math.max(Math.abs(parcelBounds.maxX), Math.abs(parcelBounds.minX)) + 50;
    const halfD = Math.max(Math.abs(parcelBounds.maxZ), Math.abs(parcelBounds.minZ)) + 50;
    return Math.ceil(Math.sqrt(halfW * halfW + halfD * halfD));
  }, [parcelBounds]);

  useEffect(() => {
    if (!parcelInfo || !showSurrounding) {
      setSurroundingBuildings([]);
      setSurroundingRoads([]);
      return;
    }

    let cancelled = false;

    async function fetchSurrounding() {
      try {
        const res = await fetch('/api/land/surrounding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            centroidLat: parcelInfo!.centroidLat,
            centroidLng: parcelInfo!.centroidLng,
            radiusMeters: surroundingRadius,
          }),
        });

        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) {
          setSurroundingBuildings(data.buildings ?? []);
          setSurroundingRoads(data.roads ?? []);
        }
      } catch (err) {
        console.error('Failed to fetch surrounding context:', err);
      }
    }

    fetchSurrounding();
    return () => { cancelled = true; };
  }, [parcelInfo?.centroidLat, parcelInfo?.centroidLng, showSurrounding, surroundingRadius]);

  // Compute offset to move parcel away from overlapping buildings/roads
  const parcelOffset = useMemo(() => {
    if (!parcelPolygon || !parcelInfo || surroundingBuildings.length === 0) {
      return { x: 0, z: 0 };
    }

    const bldgPolys: LocalPoint[][] = [];
    for (const bldg of surroundingBuildings) {
      const ring = bldg.geometry?.coordinates?.[0];
      if (!ring || ring.length < 4) continue;
      const local = geoJsonRingToLocal(ring, parcelInfo.centroidLng, parcelInfo.centroidLat);
      if (local.length >= 3) bldgPolys.push(local);
    }

    const roadPts: LocalPoint[][] = [];
    for (const road of surroundingRoads) {
      let lineStrings: number[][][];
      if (road.geometry.type === 'MultiLineString') {
        lineStrings = road.geometry.coordinates as number[][][];
      } else {
        lineStrings = [road.geometry.coordinates as number[][]];
      }
      for (const coords of lineStrings) {
        if (!coords || coords.length < 2) continue;
        const local = coords.map(([lng, lat]) =>
          wgs84ToLocal(lng, lat, parcelInfo.centroidLng, parcelInfo.centroidLat),
        );
        roadPts.push(local);
      }
    }

    return computeParcelOffset(parcelPolygon, bldgPolys, roadPts);
  }, [parcelPolygon, parcelInfo, surroundingBuildings, surroundingRoads]);

  // Filter out buildings that overlap with the offset parcel
  const filteredBuildings = useMemo(() => {
    if (!parcelPolygon || !parcelInfo || surroundingBuildings.length === 0) {
      return surroundingBuildings;
    }

    // Shrink parcel slightly inward (2m) to avoid filtering edge-touching buildings
    const innerParcel = polygonInset(parcelPolygon, 2) ?? parcelPolygon;

    return surroundingBuildings.filter((bldg) => {
      const ring = bldg.geometry?.coordinates?.[0];
      if (!ring || ring.length < 4) return true;

      const local = geoJsonRingToLocal(ring, parcelInfo.centroidLng, parcelInfo.centroidLat);
      if (local.length < 3) return true;

      // Check if any building vertex is inside the parcel
      for (const p of local) {
        if (pointInPolygon(p.x - parcelOffset.x, p.z - parcelOffset.z, innerParcel)) {
          return false; // remove this building
        }
      }

      // Check if any parcel vertex is inside the building polygon
      for (const pp of innerParcel) {
        if (pointInPolygon(pp.x + parcelOffset.x, pp.z + parcelOffset.z, local)) {
          return false;
        }
      }

      // Check centroid as well (small buildings fully inside)
      let cx = 0, cz = 0;
      for (const p of local) { cx += p.x; cz += p.z; }
      cx /= local.length;
      cz /= local.length;
      if (pointInPolygon(cx - parcelOffset.x, cz - parcelOffset.z, innerParcel)) {
        return false;
      }

      return true;
    });
  }, [surroundingBuildings, parcelPolygon, parcelInfo, parcelOffset]);

  return (
    <>
      {/* Camera controls — outside mirror group */}
      <OrbitControls
        ref={controlsRef}
        makeDefault
        minPolarAngle={0.05}
        maxPolarAngle={Math.PI - 0.05}
        minDistance={3}
        maxDistance={500}
        enableDamping
        dampingFactor={0.1}
        mouseButtons={{
          LEFT: undefined as unknown as THREE.MOUSE,   // box select uses left
          MIDDLE: THREE.MOUSE.ROTATE,                  // wheel drag = orbit
          RIGHT: THREE.MOUSE.PAN,                      // right drag = pan
        }}
        touches={{
          ONE: activeTool === 'place' ? (undefined as unknown as THREE.TOUCH) : THREE.TOUCH.ROTATE,
          TWO: THREE.TOUCH.DOLLY_PAN,
        }}
      />

      {/* Mirror Z + camera from north: north=screen top, east=screen right (matches 2D map) */}
      <group scale={[1, 1, -1]}>
        {/* Lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[10, 20, 10]}
          intensity={1}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <directionalLight position={[-5, 10, -5]} intensity={0.3} />

        {/* Terrain mesh — stays at world y=0 (outside the building group) */}
        {hasTerrain && (
          <TerrainMesh
            polygon={parcelPolygon!}
            centroidLng={parcelInfo!.centroidLng}
            centroidLat={parcelInfo!.centroidLat}
            onBaseElevation={setTerrainBaseY}
            onElevationGrid={setElevationGrid}
          />
        )}

        {/* All elements — shifted up to terrain level */}
        <group position={[0, terrainBaseY, 0]}>
          {/* Satellite overlay — fixed position (ground truth) */}
          {showSatellite && parcelInfo && (
            <SatelliteOverlay
              centroidLat={parcelInfo.centroidLat}
              centroidLng={parcelInfo.centroidLng}
              radius={surroundingRadius}
            />
          )}

          {/* Surrounding buildings/roads — fixed position (ground truth) */}
          {showSurrounding && filteredBuildings.length > 0 && parcelInfo && (
            <SurroundingBuildings
              buildings={filteredBuildings}
              centroidLng={parcelInfo.centroidLng}
              centroidLat={parcelInfo.centroidLat}
            />
          )}
          {showSurrounding && surroundingRoads.length > 0 && parcelInfo && (
            <SurroundingRoads
              roads={surroundingRoads}
              centroidLng={parcelInfo.centroidLng}
              centroidLat={parcelInfo.centroidLat}
            />
          )}

          {/* Parcel elements — offset to align with surrounding context */}
          <group position={[parcelOffset.x, 0, parcelOffset.z]}>
            {/* Grid — aligned to buildable polygon, or parcel, or fallback */}
            {buildablePolygon && gridSnap ? (
              <>
                <ParcelGrid polygon={buildablePolygon} floor={currentFloor} offset={gridOffset} />
                {parcelPolygon && <ParcelBoundary polygon={parcelPolygon} />}
              </>
            ) : parcelPolygon ? (
              <>
                {gridSnap && <ParcelGrid polygon={parcelPolygon} floor={currentFloor} offset={gridOffset} />}
                <ParcelBoundary polygon={parcelPolygon} />
              </>
            ) : gridSnap ? (
              <BuilderGrid floor={currentFloor} />
            ) : null}

            {/* Ground plane — visible only without terrain */}
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, -0.01, 0]}
              receiveShadow
            >
              <planeGeometry args={[200, 200]} />
              {hasTerrain ? (
                <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
              ) : (
                <meshStandardMaterial color="#f8fafc" side={THREE.DoubleSide} />
              )}
            </mesh>

            {/* Placed modules */}
            {visiblePlacements.map((placement) => {
              const mod = getModuleById(placement.moduleId);
              if (!mod) return null;
              return (
                <PlacedModule
                  key={placement.id}
                  placement={placement}
                  module={mod}
                  isSelected={selectedPlacementIds.includes(placement.id)}
                  isCurrentFloor={viewAllFloors || placement.floor === currentFloor}
                />
              );
            })}

            {/* Ghost module for placement preview — 건폐율 적용된 건축영역(와이어프레임)과 일치 */}
            <GhostModule parcelOffset={parcelOffset} buildablePolygon={buildablePolygon ?? regulationPolygon} />

            {/* Drag-to-move ghost for selected modules */}
            <ModuleDragger buildablePolygon={buildablePolygon ?? regulationPolygon} />

            {/* Box select (drag rectangle to select multiple modules) */}
            <BoxSelect parcelOffset={parcelOffset} />

            {/* 대지안의 공지 (setback) — green dashed on ground */}
            {regulationPolygon && (
              <RegulationBoundaryPolygon polygon={regulationPolygon} />
            )}

            {/* 건폐율 볼륨 — blue dashed wireframe with floor plates, solar-clipped */}
            {buildablePolygon && volumeHeight > 0 ? (
              <BuildableVolume
                polygon={buildablePolygon}
                height={volumeHeight}
                solarNorthZ={
                  regulationPolygon && boundaryHeight && boundaryHeight > 9
                    ? polygonBounds(regulationPolygon).maxZ
                    : undefined
                }
              />
            ) : boundaryWidth && boundaryDepth && boundaryHeight && !parcelPolygon ? (
              <RegulationBoundary
                width={boundaryWidth}
                depth={boundaryDepth}
                height={boundaryHeight}
              />
            ) : null}

          </group>
        </group>
      </group>

      {/* Gizmo helper — outside mirror group */}
      <AnimatedGizmo rightSidebarOpen={rightSidebarOpen} />
    </>
  );
}

export function BuilderCanvas({ boundaryWidth, boundaryDepth, boundaryHeight, parcelInfo, showSurrounding = true, showSatellite = false, rightSidebarOpen = true }: BuilderCanvasProps) {
  return (
    <div className="h-full w-full">
      <Canvas
        camera={{ position: [0, 45, 45], fov: 50, near: 0.1, far: 1000 }}
        frameloop="always"
        shadows
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.2;
        }}
      >
        <Suspense fallback={null}>
          <Scene
            boundaryWidth={boundaryWidth}
            boundaryDepth={boundaryDepth}
            boundaryHeight={boundaryHeight}
            parcelInfo={parcelInfo}
            showSurrounding={showSurrounding}
            showSatellite={showSatellite}
            rightSidebarOpen={rightSidebarOpen}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
