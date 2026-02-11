'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import { useBuilderStore } from '@/features/builder/store';
import { getModuleById } from '@/lib/constants/modules';
import { GRID_SIZE } from '@/lib/constants/grid';
import {
  worldToGridSnapped,
  gridToWorld,
  floorToWorldY,
} from '@/features/builder/utils/gridUtils';
import {
  placementToOBB,
  checkOBBCollision,
  checkOBBInBounds,
} from '@/features/builder/utils/obbCollision';
import type { LocalPoint } from '@/features/builder/utils/obbCollision';
import type { ModulePlacement } from '@/types/builder';

interface ModuleDraggerProps {
  buildablePolygon?: LocalPoint[] | null;
}

/** Timestamp of last drag end — used to suppress click-deselect after drag */
let _dragEndTime = 0;
export function recentlyDragged(): boolean {
  return Date.now() - _dragEndTime < 300;
}

export function ModuleDragger({ buildablePolygon }: ModuleDraggerProps) {
  const draggingId = useBuilderStore((s) => s.draggingPlacementId);
  const dragOffset = useBuilderStore((s) => s.dragOffset);
  const placements = useBuilderStore((s) => s.placements);
  const selectedIds = useBuilderStore((s) => s.selectedPlacementIds);
  const movePlacements = useBuilderStore((s) => s.movePlacements);
  const endDrag = useBuilderStore((s) => s.endDrag);
  const gridOffset = useBuilderStore((s) => s.gridOffset);
  const gridSnap = useBuilderStore((s) => s.gridSnap);
  const terrainBaseY = useBuilderStore((s) => s.terrainBaseY);
  const showToast = useBuilderStore((s) => s.showToast);

  // Anchor module (the one the user clicked to start the drag)
  const anchorPlacement = draggingId ? placements.find((p) => p.id === draggingId) : null;
  const anchorModuleDef = anchorPlacement ? getModuleById(anchorPlacement.moduleId) : null;

  // All modules being dragged (all selected if anchor is selected, otherwise just anchor)
  const draggedIds = useMemo(() => {
    if (!draggingId) return [] as string[];
    return selectedIds.includes(draggingId) ? selectedIds : [draggingId];
  }, [draggingId, selectedIds]);

  const draggedPlacements = useMemo(() => {
    if (draggedIds.length === 0) return [] as ModulePlacement[];
    const idSet = new Set(draggedIds);
    return placements.filter((p) => idSet.has(p.id));
  }, [placements, draggedIds]);

  // Refs for values needed in window event handlers (avoids stale closures)
  const dragDeltaRef = useRef<{ deltaX: number; deltaZ: number } | null>(null);
  const collisionRef = useRef(false);
  const oobRef = useRef(false);
  const draggedPlacementsRef = useRef(draggedPlacements);
  draggedPlacementsRef.current = draggedPlacements;

  const [ghostState, setGhostState] = useState<{
    deltaX: number;
    deltaZ: number;
    collision: boolean;
    outOfBounds: boolean;
  } | null>(null);

  const floorY = anchorPlacement ? floorToWorldY(anchorPlacement.floor) : 0;

  // Reusable Three.js objects (avoid GC pressure in frame loop)
  const _plane = useMemo(() => new THREE.Plane(), []);
  const _target = useMemo(() => new THREE.Vector3(), []);

  // Set of IDs being dragged (for exclusion in collision checks)
  const excludeIdSet = useMemo(() => new Set(draggedIds), [draggedIds]);

  // Disable orbit controls while dragging
  const controls = useThree((s) => s.controls);
  useEffect(() => {
    if (!draggingId || !controls) return;
    (controls as any).enabled = false;
    return () => {
      (controls as any).enabled = true;
    };
  }, [draggingId, controls]);

  // Track pointer position every frame via raycasting against a logical ground plane
  useFrame((state) => {
    if (!draggingId || !anchorPlacement || !anchorModuleDef) return;

    _plane.set(new THREE.Vector3(0, 1, 0), -(floorY + terrainBaseY));
    state.raycaster.setFromCamera(state.pointer, state.camera);
    if (!state.raycaster.ray.intersectPlane(_plane, _target)) return;

    // Get new grid position for the anchor module
    const grid = worldToGridSnapped(
      _target.x - (dragOffset?.x ?? 0),
      -_target.z - (dragOffset?.z ?? 0),
      gridOffset.x,
      gridOffset.z,
      gridSnap,
    );

    // Compute delta from anchor's original position
    const deltaX = grid.gridX - anchorPlacement.gridX;
    const deltaZ = grid.gridZ - anchorPlacement.gridZ;
    dragDeltaRef.current = { deltaX, deltaZ };

    // Check collision and bounds for ALL dragged modules at new positions (OBB)
    let blocked = false;
    let oob = false;
    for (const p of draggedPlacementsRef.current) {
      const mod = getModuleById(p.moduleId);
      if (!mod) continue;
      const newGX = p.gridX + deltaX;
      const newGZ = p.gridZ + deltaZ;

      const obb = placementToOBB(
        newGX, newGZ, mod.gridWidth, mod.gridDepth, p.rotation,
        gridOffset.x, gridOffset.z,
      );

      const result = checkOBBCollision(
        obb, p.floor, placements, getModuleById,
        gridOffset.x, gridOffset.z, excludeIdSet,
      );
      if (result.hasCollision) { blocked = true; break; }

      if (buildablePolygon && buildablePolygon.length >= 3) {
        if (!checkOBBInBounds(obb, buildablePolygon)) {
          blocked = true; oob = true; break;
        }
      }
    }

    collisionRef.current = blocked;
    oobRef.current = oob;

    // Only trigger re-render when delta or collision state changes
    setGhostState((prev) => {
      if (prev && prev.deltaX === deltaX && prev.deltaZ === deltaZ && prev.collision === blocked && prev.outOfBounds === oob)
        return prev;
      return { deltaX, deltaZ, collision: blocked, outOfBounds: oob };
    });
  });

  // Window-level listeners for committing move (pointerUp) and cancelling (Escape)
  useEffect(() => {
    if (!draggingId) return;

    const commit = () => {
      const delta = dragDeltaRef.current;
      if (delta) {
        if (collisionRef.current) {
          showToast(oobRef.current ? '건축 영역 밖입니다' : '이동할 수 없는 위치입니다');
        } else if (delta.deltaX !== 0 || delta.deltaZ !== 0) {
          const moves = draggedPlacementsRef.current.map((p) => ({
            id: p.id,
            gridX: p.gridX + delta.deltaX,
            gridZ: p.gridZ + delta.deltaZ,
          }));
          movePlacements(moves);
        }
      }
      _dragEndTime = Date.now();
      endDrag();
      dragDeltaRef.current = null;
      setGhostState(null);
      document.body.style.cursor = 'default';
    };

    const cancel = () => {
      _dragEndTime = Date.now();
      endDrag();
      dragDeltaRef.current = null;
      setGhostState(null);
      document.body.style.cursor = 'default';
    };

    const handleUp = () => commit();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };

    window.addEventListener('pointerup', handleUp);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('keydown', handleKey);
    };
  }, [draggingId, movePlacements, endDrag, showToast]);

  // Don't render anything if not dragging or no ghost state yet
  if (!ghostState || draggedPlacements.length === 0) return null;

  const color = ghostState.collision ? '#ef4444' : '#3b82f6';
  const { deltaX, deltaZ } = ghostState;

  return (
    <>
      {draggedPlacements.map((p) => {
        const mod = getModuleById(p.moduleId);
        if (!mod) return null;
        const realWidth = mod.gridWidth * GRID_SIZE;
        const realDepth = mod.gridDepth * GRID_SIZE;
        const realHeight = mod.height;
        const pFloorY = floorToWorldY(p.floor);
        const wp = gridToWorld(p.gridX + deltaX, p.gridZ + deltaZ, gridOffset.x, gridOffset.z);
        const rotY = (p.rotation * Math.PI) / 180;
        const cosR = Math.cos(rotY);
        const sinR = Math.sin(rotY);
        const localCx = realWidth / 2;
        const localCz = realDepth / 2;
        return (
          <mesh
            key={p.id}
            position={[
              wp.x + localCx * cosR - localCz * sinR,
              pFloorY + realHeight / 2,
              wp.z + localCx * sinR + localCz * cosR,
            ]}
            rotation={[0, rotY, 0]}
          >
            <boxGeometry args={[realWidth, realHeight, realDepth]} />
            <meshStandardMaterial color={color} transparent opacity={0.5} />
            <Edges linewidth={1} color={color} />
          </mesh>
        );
      })}
    </>
  );
}
