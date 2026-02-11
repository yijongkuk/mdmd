'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ThreeEvent } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import { useBuilderStore } from '@/features/builder/store';
import { getModuleById } from '@/lib/constants/modules';
import { getMeshData } from '@/lib/speckle/customModules';
import { GRID_SIZE, ROTATION_STEP } from '@/lib/constants/grid';
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

interface GhostModuleProps {
  parcelOffset?: { x: number; z: number };
  buildablePolygon?: LocalPoint[] | null;
}

export function GhostModule({ parcelOffset = { x: 0, z: 0 }, buildablePolygon }: GhostModuleProps) {
  const activeTool = useBuilderStore((s) => s.activeTool);
  const selectedModuleDefId = useBuilderStore((s) => s.selectedModuleDefId);
  const currentFloor = useBuilderStore((s) => s.currentFloor);
  const placements = useBuilderStore((s) => s.placements);
  const addPlacement = useBuilderStore((s) => s.addPlacement);
  const gridOffset = useBuilderStore((s) => s.gridOffset);
  const gridSnap = useBuilderStore((s) => s.gridSnap);
  const showToast = useBuilderStore((s) => s.showToast);

  const [ghostPos, setGhostPos] = useState<{ gridX: number; gridZ: number } | null>(null);
  const [hasCollision, setHasCollision] = useState(false);
  const [outOfBounds, setOutOfBounds] = useState(false);
  const [ghostRotation, setGhostRotation] = useState<number>(0);
  // Track pointerDown screen position to distinguish click vs drag (orbit)
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);

  const moduleDef = selectedModuleDefId ? getModuleById(selectedModuleDefId) : undefined;

  // Reset ghost rotation when switching modules
  useEffect(() => {
    setGhostRotation(0);
    setGhostPos(null);
  }, [selectedModuleDefId]);

  // Listen for R key to rotate ghost before placing
  useEffect(() => {
    if (activeTool !== 'place' || !moduleDef) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) return;

      if ((e.key.toLowerCase() === 'r' || e.key === ' ') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const step = e.key === ' ' ? ROTATION_STEP : -ROTATION_STEP;
        setGhostRotation((prev) => (prev + step + 360) % 360);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, moduleDef]);

  // Helper: compute corner gridX/gridZ from center gridX/gridZ
  const centerToCorner = useCallback(
    (centerGX: number, centerGZ: number, rot: number) => {
      if (!moduleDef) return { gridX: centerGX, gridZ: centerGZ };
      const hw = moduleDef.gridWidth / 2;
      const hd = moduleDef.gridDepth / 2;
      const rad = (rot * Math.PI) / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      return {
        gridX: centerGX - (hw * cos - hd * sin),
        gridZ: centerGZ - (hw * sin + hd * cos),
      };
    },
    [moduleDef],
  );

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (activeTool !== 'place' || !moduleDef) return;
      e.stopPropagation();

      const point = e.point;
      // Convert world-space hit → local (parcelOffset group) space
      const localX = point.x - parcelOffset.x;
      const localZ = -point.z - parcelOffset.z;

      // ghostPos = module CENTER in grid coordinates
      const grid = worldToGridSnapped(localX, localZ, gridOffset.x, gridOffset.z, gridSnap);
      setGhostPos({ gridX: grid.gridX, gridZ: grid.gridZ });

      // Compute corner for OBB collision
      const corner = centerToCorner(grid.gridX, grid.gridZ, ghostRotation);
      const obb = placementToOBB(
        corner.gridX, corner.gridZ,
        moduleDef.gridWidth, moduleDef.gridDepth,
        ghostRotation, gridOffset.x, gridOffset.z,
      );

      const result = checkOBBCollision(
        obb, currentFloor, placements, getModuleById,
        gridOffset.x, gridOffset.z,
      );

      // Check if module extends outside the buildable polygon
      let oob = false;
      if (buildablePolygon && buildablePolygon.length >= 3) {
        oob = !checkOBBInBounds(obb, buildablePolygon);
      }

      setOutOfBounds(oob);
      setHasCollision(result.hasCollision || oob);
    },
    [activeTool, moduleDef, currentFloor, placements, ghostRotation, gridOffset, gridSnap, parcelOffset, buildablePolygon, centerToCorner],
  );

  const handlePointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (activeTool !== 'place') return;
      pointerDownRef.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
    },
    [activeTool],
  );

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (activeTool !== 'place' || !moduleDef || !ghostPos) return;
      // Distinguish click from drag (orbit) — 5px threshold
      const start = pointerDownRef.current;
      if (start) {
        const dx = e.nativeEvent.clientX - start.x;
        const dy = e.nativeEvent.clientY - start.y;
        if (dx * dx + dy * dy > 25) return;
      }
      // Always stop propagation to prevent exiting place mode
      e.stopPropagation();

      if (hasCollision) {
        showToast(outOfBounds ? '건축 영역 밖입니다' : '설치할 수 없는 위치입니다');
        return;
      }

      // Convert center → corner for storage
      const corner = centerToCorner(ghostPos.gridX, ghostPos.gridZ, ghostRotation);
      addPlacement({
        moduleId: moduleDef.id,
        gridX: corner.gridX,
        gridY: 0,
        gridZ: corner.gridZ,
        rotation: ghostRotation,
        floor: currentFloor,
      });
    },
    [activeTool, moduleDef, ghostPos, hasCollision, outOfBounds, currentFloor, addPlacement, ghostRotation, showToast, centerToCorner],
  );

  if (activeTool !== 'place' || !moduleDef) return null;

  const worldY = floorToWorldY(currentFloor);
  const realWidth = moduleDef.gridWidth * GRID_SIZE;
  const realDepth = moduleDef.gridDepth * GRID_SIZE;
  const realHeight = moduleDef.height;

  const ghostColor = hasCollision ? '#ef4444' : '#22c55e';

  // Speckle 커스텀 메시용 BufferGeometry (PlacedModule과 동일 로직)
  const customGeometry = moduleDef.speckleRef ? (() => {
    const meshData = getMeshData(moduleDef.id);
    if (!meshData || meshData.meshes.length === 0) return null;

    const totalVertLen = meshData.meshes.reduce((s, m) => s + m.vertices.length, 0);
    const totalIdxLen = meshData.meshes.reduce((s, m) => s + m.indices.length, 0);
    const positions = new Float32Array(totalVertLen);
    const indices = new Uint32Array(totalIdxLen);

    const cx = meshData.boundingBox.size[0] / 2;
    const cy = meshData.boundingBox.size[1] / 2;
    const cz = meshData.boundingBox.size[2] / 2;

    let vOff = 0, iOff = 0, vCount = 0;
    for (const part of meshData.meshes) {
      for (let i = 0; i < part.vertices.length; i += 3) {
        positions[vOff + i] = part.vertices[i] - cx;
        positions[vOff + i + 1] = part.vertices[i + 1] - cy;
        positions[vOff + i + 2] = part.vertices[i + 2] - cz;
      }
      for (let i = 0; i < part.indices.length; i++) {
        indices[iOff + i] = part.indices[i] + vCount;
      }
      vOff += part.vertices.length;
      iOff += part.indices.length;
      vCount += part.vertices.length / 3;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setIndex(new THREE.BufferAttribute(indices, 1));
    geom.computeVertexNormals();
    return geom;
  })() : null;

  // Real Y-axis rotation for all modules (BoxGeometry + Speckle)
  const rotationY = (ghostRotation * Math.PI) / 180;

  return (
    <>
      {/* Transparent ground plane for raycasting (must NOT use visible={false}) */}
      {/* Position at floor level only — parent group already adds terrainBaseY */}
      <mesh
        position={[0, worldY, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onClick={handleClick}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Ghost preview — ghostPos is the CENTER */}
      {ghostPos && (
        <group>
          {(() => {
            // ghostPos = center in grid coords → world center directly
            const wp = gridToWorld(ghostPos.gridX, ghostPos.gridZ, gridOffset.x, gridOffset.z);
            const posX = wp.x;
            const posY = worldY + realHeight / 2;
            const posZ = wp.z;
            return (
              <mesh
                position={[posX, posY, posZ]}
                rotation={[0, rotationY, 0]}
              >
                {customGeometry ? (
                  <primitive object={customGeometry} attach="geometry" />
                ) : (
                  <boxGeometry args={[realWidth, realHeight, realDepth]} />
                )}
                <meshStandardMaterial
                  color={ghostColor}
                  transparent
                  opacity={0.5}
                />
                {!customGeometry && <Edges linewidth={1} color={ghostColor} />}
              </mesh>
            );
          })()}
        </group>
      )}
    </>
  );
}
