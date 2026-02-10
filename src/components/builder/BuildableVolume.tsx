'use client';

import { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import * as THREE from 'three';
import { ThreeEvent, useThree, useFrame } from '@react-three/fiber';
import { FLOOR_HEIGHT } from '@/lib/constants/grid';
import { useBuilderStore } from '@/features/builder/store';
import { floorToWorldY } from '@/features/builder/utils/gridUtils';
import type { LocalPoint } from '@/lib/geo/coordTransform';

interface BuildableVolumeProps {
  polygon: LocalPoint[];
  height: number;
  solarNorthZ?: number;
}

interface FloorRect {
  y: number;
  floorNum: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** 그리드 드래그 중인지 동기적으로 확인 (BoxSelect에서 사용) */
let _gridDragging = false;
export function isGridDragging(): boolean {
  return _gridDragging;
}

export function BuildableVolume({ polygon, height, solarNorthZ }: BuildableVolumeProps) {
  const lineRef = useRef<THREE.LineSegments>(null);
  const currentFloor = useBuilderStore((s) => s.currentFloor);
  const activeTool = useBuilderStore((s) => s.activeTool);
  const gridLocked = useBuilderStore((s) => s.gridLocked);
  const gridOffset = useBuilderStore((s) => s.gridOffset);
  const setGridOffset = useBuilderStore((s) => s.setGridOffset);
  const terrainBaseY = useBuilderStore((s) => s.terrainBaseY);

  // Grid drag state (local)
  const [isDraggingGrid, setIsDraggingGrid] = useState(false);
  const dragStartRef = useRef<{
    worldX: number;
    worldZ: number;
    offsetX: number;
    offsetZ: number;
  } | null>(null);
  const movedRef = useRef(false); // distinguish click vs grid-drag
  const pointerDownScreenRef = useRef<{ x: number; y: number } | null>(null); // screen pos at pointerDown

  // Reusable Three.js objects for raycasting
  const _plane = useMemo(() => new THREE.Plane(), []);
  const _target = useMemo(() => new THREE.Vector3(), []);

  // Disable OrbitControls while dragging grid
  const controls = useThree((s) => s.controls);
  useEffect(() => {
    if (!isDraggingGrid || !controls) return;
    (controls as any).enabled = false;
    return () => { (controls as any).enabled = true; };
  }, [isDraggingGrid, controls]);

  // Track pointer in useFrame for smooth grid dragging
  useFrame((state) => {
    if (!isDraggingGrid || !dragStartRef.current) return;
    const floorY = floorToWorldY(currentFloor);
    _plane.set(new THREE.Vector3(0, 1, 0), -(floorY + terrainBaseY));
    state.raycaster.setFromCamera(state.pointer, state.camera);
    if (!state.raycaster.ray.intersectPlane(_plane, _target)) return;

    const dx = _target.x - dragStartRef.current.worldX;
    // Negate Z delta: world Z is mirrored by scale={[1,1,-1]}, gridOffset is in local space
    const dz = -((_target.z - dragStartRef.current.worldZ));

    if (!movedRef.current && (Math.abs(dx) > 0.05 || Math.abs(dz) > 0.05)) {
      movedRef.current = true;
    }

    if (movedRef.current) {
      setGridOffset({
        x: dragStartRef.current.offsetX + dx,
        z: dragStartRef.current.offsetZ + dz,
      });
    }
  });

  // End drag on pointer up (window-level)
  useEffect(() => {
    if (!isDraggingGrid) return;
    const handleUp = () => {
      _gridDragging = false;
      setIsDraggingGrid(false);
      dragStartRef.current = null;
      movedRef.current = false;
      document.body.style.cursor = '';
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Cancel: restore original offset
        if (dragStartRef.current) {
          setGridOffset({
            x: dragStartRef.current.offsetX,
            z: dragStartRef.current.offsetZ,
          });
        }
        _gridDragging = false;
        setIsDraggingGrid(false);
        dragStartRef.current = null;
        document.body.style.cursor = '';
      }
    };
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('keydown', handleKey);
    };
  }, [isDraggingGrid, setGridOffset]);

  // Compute clipped floor rectangles
  const floors = useMemo<FloorRect[]>(() => {
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const p of polygon) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }

    const numFloors = Math.floor(height / FLOOR_HEIGHT);
    const yLevels: number[] = [];
    for (let f = 0; f <= numFloors; f++) {
      const y = f * FLOOR_HEIGHT;
      if (y <= height) yLevels.push(y);
    }
    if (yLevels[yLevels.length - 1] < height) yLevels.push(height);

    const result: FloorRect[] = [];
    for (let i = 0; i < yLevels.length; i++) {
      const y = yLevels[i];
      const ceilingY = i < yLevels.length - 1 ? yLevels[i + 1] : y;
      let clippedMaxZ = maxZ;
      if (solarNorthZ != null && ceilingY > 9) {
        clippedMaxZ = Math.min(maxZ, solarNorthZ - (ceilingY - 9) / 2);
      }
      if (clippedMaxZ <= minZ) break;
      result.push({ y, floorNum: Math.round(y / FLOOR_HEIGHT) + 1, minX, maxX, minZ, maxZ: clippedMaxZ });
    }
    return result;
  }, [polygon, height, solarNorthZ]);

  // Wireframe
  const positions = useMemo(() => {
    if (floors.length === 0) return new Float32Array(0);
    const lines: number[] = [];

    for (const f of floors) {
      lines.push(f.minX, f.y, f.minZ, f.maxX, f.y, f.minZ);
      lines.push(f.maxX, f.y, f.minZ, f.maxX, f.y, f.maxZ);
      lines.push(f.maxX, f.y, f.maxZ, f.minX, f.y, f.maxZ);
      lines.push(f.minX, f.y, f.maxZ, f.minX, f.y, f.minZ);
    }

    for (let i = 0; i < floors.length - 1; i++) {
      const curr = floors[i];
      const next = floors[i + 1];
      lines.push(curr.minX, curr.y, curr.minZ, next.minX, next.y, next.minZ);
      lines.push(curr.maxX, curr.y, curr.minZ, next.maxX, next.y, next.minZ);

      const northChanged = Math.abs(curr.maxZ - next.maxZ) > 0.01;
      if (northChanged) {
        lines.push(curr.maxX, curr.y, curr.maxZ, curr.maxX, next.y, curr.maxZ);
        lines.push(curr.minX, curr.y, curr.maxZ, curr.minX, next.y, curr.maxZ);
        lines.push(curr.maxX, next.y, curr.maxZ, curr.maxX, next.y, next.maxZ);
        lines.push(curr.minX, next.y, curr.maxZ, curr.minX, next.y, next.maxZ);
        lines.push(curr.minX, next.y, curr.maxZ, curr.maxX, next.y, curr.maxZ);
      } else {
        lines.push(curr.maxX, curr.y, curr.maxZ, next.maxX, next.y, next.maxZ);
        lines.push(curr.minX, curr.y, curr.maxZ, next.minX, next.y, next.maxZ);
      }
    }
    return new Float32Array(lines);
  }, [floors]);

  useEffect(() => {
    if (lineRef.current) lineRef.current.computeLineDistances();
  }, [positions]);

  // Floor plate click/drag handlers (only bound when activeTool !== 'place')
  const handleFloorPointerDown = useCallback((e: ThreeEvent<PointerEvent>, floorNum: number) => {
    // Always stop propagation — prevents the ray from hitting floor plates behind this one
    e.stopPropagation();
    // Record screen position to distinguish orbit/pan from click
    pointerDownScreenRef.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
    // Only start grid drag on the current floor with select tool
    if (activeTool !== 'select' || floorNum !== currentFloor) return;
    movedRef.current = false;
    dragStartRef.current = {
      worldX: e.point.x,
      worldZ: e.point.z,
      offsetX: gridOffset.x,
      offsetZ: gridOffset.z,
    };
    _gridDragging = true;
    setIsDraggingGrid(true);
    document.body.style.cursor = 'move';
  }, [activeTool, currentFloor, gridOffset]);

  // Floor selection is handled by FloorNavigator UI panel (not 3D click)
  const handleFloorClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
  }, []);

  if (positions.length === 0) return null;

  return (
    <group>
      {/* Wireframe */}
      <lineSegments ref={lineRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <lineDashedMaterial color="#3b82f6" dashSize={0.5} gapSize={0.3} transparent opacity={0.5} />
      </lineSegments>

      {/* Floor plates — visual + grid drag only (floor selection via FloorNavigator UI) */}
      {/* In 'place' mode: no event handlers → rays pass through to GhostModule */}
      {floors.map((f, i) => {
        if (i === floors.length - 1 && f.y > 0) return null;
        const w = f.maxX - f.minX;
        const d = f.maxZ - f.minZ;
        const cx = (f.minX + f.maxX) / 2;
        const cz = (f.minZ + f.maxZ) / 2;
        const isCurrent = f.floorNum === currentFloor;
        const isPlacing = activeTool === 'place';

        return (
          <mesh
            key={f.floorNum}
            position={[cx, f.y + 0.002, cz]}
            rotation={[-Math.PI / 2, 0, 0]}
            {...(isCurrent && !isPlacing && !gridLocked && {
              onClick: (e: ThreeEvent<MouseEvent>) => handleFloorClick(e),
              onPointerDown: (e: ThreeEvent<PointerEvent>) => handleFloorPointerDown(e, f.floorNum),
              onPointerOver: (e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation();
                if (activeTool === 'select') {
                  document.body.style.cursor = 'move';
                }
              },
              onPointerOut: () => {
                if (!isDraggingGrid) document.body.style.cursor = '';
              },
            })}
          >
            <planeGeometry args={[w, d]} />
            <meshBasicMaterial
              color={isCurrent ? '#3b82f6' : '#93c5fd'}
              transparent
              opacity={isCurrent ? 0.15 : 0.04}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}
