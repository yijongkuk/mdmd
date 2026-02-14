'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useBuilderStore } from '@/features/builder/store';
import { recentlyClickedModule } from './PlacedModule';
import { recentlyDragged } from './ModuleDragger';
import { isGridDragging } from './BuildableVolume';
import { getModuleById } from '@/lib/constants/modules';
import {
  floorToWorldY,
} from '@/features/builder/utils/gridUtils';
import { placementToOBB, obbCorners } from '@/features/builder/utils/obbCollision';

/** Timestamp of last box select end — used to suppress click-deselect */
let _boxSelectEndTime = 0;
export function recentlyBoxSelected(): boolean {
  return Date.now() - _boxSelectEndTime < 300;
}

interface BoxSelectProps {
  parcelOffset?: { x: number; z: number };
}

export function BoxSelect({ parcelOffset = { x: 0, z: 0 } }: BoxSelectProps) {
  const { camera, gl } = useThree();
  const controls = useThree((s) => s.controls);

  const selectMultiple = useBuilderStore((s) => s.selectMultiple);
  const setBoxSelectRect = useBuilderStore((s) => s.setBoxSelectRect);

  // Use refs for latest values (avoid stale closures in native event handlers)
  const latestRef = useRef({
    camera,
    controls,
    parcelOffset,
    activeTool: 'select' as string,
    placements: [] as any[],
    currentFloor: 1,
    gridOffset: { x: 0, z: 0 },
    terrainBaseY: 0,
    draggingPlacementId: null as string | null,
    viewAllFloors: false,
  });

  // Subscribe to store changes and keep ref in sync
  useEffect(() => {
    const unsub = useBuilderStore.subscribe((state) => {
      latestRef.current.activeTool = state.activeTool;
      latestRef.current.placements = state.placements;
      latestRef.current.currentFloor = state.currentFloor;
      latestRef.current.gridOffset = state.gridOffset;
      latestRef.current.terrainBaseY = state.terrainBaseY;
      latestRef.current.draggingPlacementId = state.draggingPlacementId;
      latestRef.current.viewAllFloors = state.viewAllFloors;
    });
    // Initialize with current state
    const s = useBuilderStore.getState();
    latestRef.current.activeTool = s.activeTool;
    latestRef.current.placements = s.placements;
    latestRef.current.currentFloor = s.currentFloor;
    latestRef.current.gridOffset = s.gridOffset;
    latestRef.current.terrainBaseY = s.terrainBaseY;
    latestRef.current.draggingPlacementId = s.draggingPlacementId;
    latestRef.current.viewAllFloors = s.viewAllFloors;
    return unsub;
  }, []);

  // Keep camera/controls/parcelOffset refs up to date
  latestRef.current.camera = camera;
  latestRef.current.controls = controls;
  latestRef.current.parcelOffset = parcelOffset;

  const stateRef = useRef({
    isTracking: false,
    isBoxSelecting: false,
    startX: 0,
    startY: 0,
    isTouch: false,
    longPressTimer: null as ReturnType<typeof setTimeout> | null,
    longPressReady: false,
  });

  /** 터치 롱프레스 대기 시간 (ms) */
  const LONG_PRESS_MS = 1500;

  /** 롱프레스 타이머 안전 취소 */
  const cancelLongPress = () => {
    const s = stateRef.current;
    if (s.longPressTimer) {
      clearTimeout(s.longPressTimer);
      s.longPressTimer = null;
    }
  };

  useEffect(() => {
    const el = gl.domElement;

    // ── 터치 전용: touchstart/touchmove/touchend로 손가락 수 추적 ──
    const onTouchStart = (e: TouchEvent) => {
      // 두 손가락 이상 → 롱프레스 즉시 취소 (핀치줌/팬 제스처)
      if (e.touches.length > 1) {
        cancelLongPress();
        return;
      }
      // 한 손가락이고 select 모드일 때만 롱프레스 시작
      if (latestRef.current.activeTool !== 'select') return;
      if (latestRef.current.draggingPlacementId || isGridDragging()) return;

      const touch = e.touches[0];
      const startX = touch.clientX;
      const startY = touch.clientY;

      const timer = setTimeout(() => {
        if (isGridDragging()) return;
        stateRef.current.longPressReady = true;
        stateRef.current.isTracking = true;
        // OrbitControls 비활성화 — 박스 선택 우선
        const ctrl = latestRef.current.controls;
        if (ctrl) (ctrl as any).enabled = false;
        // 토스트로 모드 전환 알림
        useBuilderStore.getState().showToast('영역 선택 모드', 'info');
      }, LONG_PRESS_MS);

      stateRef.current = {
        isTracking: false,
        isBoxSelecting: false,
        startX,
        startY,
        isTouch: true,
        longPressTimer: timer,
        longPressReady: false,
      };
    };

    const onTouchMove = (e: TouchEvent) => {
      const s = stateRef.current;
      // 멀티터치 진입 → 즉시 취소
      if (e.touches.length > 1) {
        cancelLongPress();
        return;
      }
      // 롱프레스 대기 중 손가락 이동 → 타이머 취소 (5px 이상)
      if (s.longPressTimer && !s.longPressReady && e.touches.length === 1) {
        const t = e.touches[0];
        const dx = t.clientX - s.startX;
        const dy = t.clientY - s.startY;
        if (dx * dx + dy * dy > 25) {
          cancelLongPress();
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      // 모든 손가락 떼기 전에 롱프레스 대기 중이면 취소
      if (!stateRef.current.longPressReady) {
        cancelLongPress();
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (latestRef.current.activeTool !== 'select') return;
      if (e.button !== 0) return;
      // 터치는 touchstart에서 처리 — pointerdown 무시
      if (e.pointerType === 'touch') return;
      // 모듈 드래그 중이면 박스 선택 시작하지 않음
      if (latestRef.current.draggingPlacementId || isGridDragging()) return;

      // 마우스: 기존 로직
      const startX = e.clientX;
      const startY = e.clientY;
      queueMicrotask(() => {
        if (isGridDragging()) return;
        stateRef.current = {
          isTracking: true,
          isBoxSelecting: false,
          startX,
          startY,
          isTouch: false,
          longPressTimer: null,
          longPressReady: false,
        };
      });
    };

    const onPointerMove = (e: PointerEvent) => {
      const s = stateRef.current;

      if (!s.isTracking) return;
      if (latestRef.current.activeTool !== 'select') {
        s.isTracking = false;
        return;
      }
      // 모듈 드래그 또는 그리드 이동 중이면 박스 선택 중단 + 사각형 제거
      if (latestRef.current.draggingPlacementId || isGridDragging()) {
        if (s.isBoxSelecting) {
          setBoxSelectRect(null);
          const ctrl = latestRef.current.controls;
          if (ctrl) (ctrl as any).enabled = true;
        }
        s.isTracking = false;
        s.isBoxSelecting = false;
        return;
      }

      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;

      if (!s.isBoxSelecting && dx * dx + dy * dy > 25) {
        s.isBoxSelecting = true;
        if (!s.isTouch) {
          // 마우스만: 첫 박스선택 진입 시 OrbitControls 비활성화 (터치는 롱프레스에서 이미 처리)
          const ctrl = latestRef.current.controls;
          if (ctrl) (ctrl as any).enabled = false;
        }
      }

      if (s.isBoxSelecting) {
        const rect = el.getBoundingClientRect();
        const crossing = e.clientX < s.startX; // right-to-left = crossing mode
        setBoxSelectRect({
          x1: Math.min(s.startX, e.clientX) - rect.left,
          y1: Math.min(s.startY, e.clientY) - rect.top,
          x2: Math.max(s.startX, e.clientX) - rect.left,
          y2: Math.max(s.startY, e.clientY) - rect.top,
          crossing,
        });
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const s = stateRef.current;

      // 터치 롱프레스 타이머 정리
      cancelLongPress();

      if (s.isBoxSelecting) {
        const {
          placements,
          currentFloor,
          gridOffset,
          terrainBaseY,
          parcelOffset: po,
          camera: cam,
          controls: ctrl,
        } = latestRef.current;

        const elRect = el.getBoundingClientRect();
        const crossing = e.clientX < s.startX; // right-to-left = crossing mode
        const selRect = {
          x1: Math.min(s.startX, e.clientX) - elRect.left,
          y1: Math.min(s.startY, e.clientY) - elRect.top,
          x2: Math.max(s.startX, e.clientX) - elRect.left,
          y2: Math.max(s.startY, e.clientY) - elRect.top,
        };

        // Project each module's 8 corners to screen → screen-space bounding box.
        // Window (L→R): module bbox must be FULLY inside selection rect
        // Crossing (R→L): module bbox only needs to OVERLAP selection rect
        const selectedIds: string[] = [];
        const vec = new THREE.Vector3();

        const viewAll = latestRef.current.viewAllFloors;
        for (const p of placements) {
          if (!viewAll && p.floor !== currentFloor) continue;
          const mod = getModuleById(p.moduleId);
          if (!mod) continue;

          const obb = placementToOBB(
            p.gridX, p.gridZ, mod.gridWidth, mod.gridDepth,
            p.rotation, gridOffset.x, gridOffset.z,
          );
          const baseCorners = obbCorners(obb); // 4 XZ corners
          const yMin = floorToWorldY(p.floor) + terrainBaseY;
          const yMax = yMin + mod.height;

          // Project all 8 corners (4 base × 2 heights) → find screen-space bounding box
          let sxMin = Infinity, sxMax = -Infinity;
          let syMin = Infinity, syMax = -Infinity;
          for (const c of baseCorners) {
            for (const cy of [yMin, yMax]) {
              // Scene-space: X = c.x + po.x, Z = -(c.z + po.z) (Z mirror)
              vec.set(c.x + po.x, cy, -(c.z + po.z)).project(cam);
              const sx = (vec.x * 0.5 + 0.5) * elRect.width;
              const sy = (-vec.y * 0.5 + 0.5) * elRect.height;
              if (sx < sxMin) sxMin = sx;
              if (sx > sxMax) sxMax = sx;
              if (sy < syMin) syMin = sy;
              if (sy > syMax) syMax = sy;
            }
          }

          const hit = crossing
            // Crossing (R→L): any overlap between rects
            ? sxMax >= selRect.x1 && sxMin <= selRect.x2 &&
              syMax >= selRect.y1 && syMin <= selRect.y2
            // Window (L→R): module fully inside selection rect
            : sxMin >= selRect.x1 && sxMax <= selRect.x2 &&
              syMin >= selRect.y1 && syMax <= selRect.y2;

          if (hit) {
            selectedIds.push(p.id);
          }
        }

        // Shift: add to selection, Ctrl: remove from selection, plain: replace
        if (selectedIds.length > 0) {
          const existing = useBuilderStore.getState().selectedPlacementIds;
          if (e.shiftKey) {
            // Add box-selected to existing selection
            const merged = [...new Set([...existing, ...selectedIds])];
            selectMultiple(merged);
          } else if (e.ctrlKey || e.metaKey) {
            // Remove box-selected from existing selection
            const idSet = new Set(selectedIds);
            const remaining = existing.filter((id) => !idSet.has(id));
            selectMultiple(remaining);
          } else {
            selectMultiple(selectedIds);
          }
        }

        _boxSelectEndTime = Date.now();
        setBoxSelectRect(null);
        if (ctrl) (ctrl as any).enabled = true;
      }

      // Empty-space click: deselect all (only when no modifier keys held)
      if (
        !s.isBoxSelecting &&
        s.isTracking &&
        e.button === 0 &&
        !e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !recentlyClickedModule() &&
        !recentlyDragged()
      ) {
        const dx = e.clientX - s.startX;
        const dy = e.clientY - s.startY;
        if (dx * dx + dy * dy <= 25) {
          useBuilderStore.getState().selectPlacement(null);
        }
      }

      stateRef.current = {
        isTracking: false,
        isBoxSelecting: false,
        startX: 0,
        startY: 0,
        isTouch: false,
        longPressTimer: null,
        longPressReady: false,
      };
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      // 롱프레스 타이머 정리
      if (stateRef.current.longPressTimer) {
        clearTimeout(stateRef.current.longPressTimer);
      }
      // Restore controls if component unmounts during box select
      const ctrl = latestRef.current.controls;
      if (ctrl && !(ctrl as any).enabled) {
        (ctrl as any).enabled = true;
      }
      setBoxSelectRect(null);
    };
  }, [gl, selectMultiple, setBoxSelectRect]);

  return null;
}
