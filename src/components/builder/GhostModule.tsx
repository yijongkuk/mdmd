'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ThreeEvent } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import { useBuilderStore } from '@/features/builder/store';
import { getModuleById } from '@/lib/constants/modules';
import { getMeshData } from '@/lib/speckle/customModules';
import { GRID_SIZE } from '@/lib/constants/grid';
import {
  worldToGrid,
  gridToWorld,
  floorToWorldY,
  getRotatedDimensions,
} from '@/features/builder/utils/gridUtils';
import {
  createOccupancyMap,
  checkCollision,
  checkOutOfBounds,
} from '@/features/builder/utils/collisionDetection';
import type { LocalPoint } from '@/lib/geo/coordTransform';

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
  const showToast = useBuilderStore((s) => s.showToast);
  // Note: terrainBaseY not needed — parent group already provides it

  const [ghostPos, setGhostPos] = useState<{ gridX: number; gridZ: number } | null>(null);
  const [hasCollision, setHasCollision] = useState(false);
  const [ghostRotation, setGhostRotation] = useState<0 | 90 | 180 | 270>(0);
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
        setGhostRotation((prev) => ((prev + 90) % 360) as 0 | 90 | 180 | 270);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, moduleDef]);

  const occupancyMap = useMemo(
    () => createOccupancyMap(placements, getModuleById),
    [placements],
  );

  // Convert buildable polygon bounds to grid coordinate bounds
  const buildableGridBounds = useMemo(() => {
    if (!buildablePolygon || buildablePolygon.length < 3) return null;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of buildablePolygon) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    return {
      minGridX: Math.ceil((minX - gridOffset.x) / GRID_SIZE),
      maxGridX: Math.floor((maxX - gridOffset.x) / GRID_SIZE) - 1,
      minGridZ: Math.ceil((minZ - gridOffset.z) / GRID_SIZE),
      maxGridZ: Math.floor((maxZ - gridOffset.z) / GRID_SIZE) - 1,
    };
  }, [buildablePolygon, gridOffset]);

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (activeTool !== 'place' || !moduleDef) return;
      e.stopPropagation();

      const point = e.point;
      // Convert world-space hit → local (parcelOffset group) space
      // X: subtract parcelOffset (scale X = 1)
      // Z: negate (scale Z = -1) then subtract parcelOffset
      const localX = point.x - parcelOffset.x;
      const localZ = -point.z - parcelOffset.z;
      const grid = worldToGrid(localX, localZ, gridOffset.x, gridOffset.z);

      setGhostPos({ gridX: grid.gridX, gridZ: grid.gridZ });

      const result = checkCollision(
        occupancyMap,
        grid.gridX,
        grid.gridZ,
        currentFloor,
        moduleDef.gridWidth,
        moduleDef.gridDepth,
        ghostRotation,
      );

      // Check if module extends outside the buildable area
      let outOfBounds = false;
      if (buildableGridBounds) {
        outOfBounds = checkOutOfBounds(
          grid.gridX,
          grid.gridZ,
          moduleDef.gridWidth,
          moduleDef.gridDepth,
          ghostRotation,
          buildableGridBounds,
        );
      }

      setHasCollision(result.hasCollision || outOfBounds);
    },
    [activeTool, moduleDef, currentFloor, occupancyMap, ghostRotation, gridOffset, parcelOffset, buildableGridBounds],
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
        showToast('설치할 수 없는 위치입니다');
        return;
      }

      addPlacement({
        moduleId: moduleDef.id,
        gridX: ghostPos.gridX,
        gridY: 0,
        gridZ: ghostPos.gridZ,
        rotation: ghostRotation,
        floor: currentFloor,
      });
    },
    [activeTool, moduleDef, ghostPos, hasCollision, currentFloor, addPlacement, ghostRotation, showToast],
  );

  if (activeTool !== 'place' || !moduleDef) return null;

  const worldY = floorToWorldY(currentFloor);
  const { width: rotW, depth: rotD } = getRotatedDimensions(
    moduleDef.gridWidth,
    moduleDef.gridDepth,
    ghostRotation,
  );
  const realWidth = rotW * GRID_SIZE;
  const realDepth = rotD * GRID_SIZE;
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

  // Speckle 모듈은 실제 Y축 회전 적용 (BoxGeometry는 dimension swap으로 처리)
  const rotationY = moduleDef.speckleRef ? (ghostRotation * Math.PI) / 180 : 0;

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

      {/* Ghost preview */}
      {ghostPos && (
        <group>
          {(() => {
            const wp = gridToWorld(ghostPos.gridX, ghostPos.gridZ, gridOffset.x, gridOffset.z);
            const posX = wp.x + realWidth / 2;
            const posY = worldY + realHeight / 2;
            const posZ = wp.z + realDepth / 2;
            return (
              <mesh
                position={[posX, posY, posZ]}
                rotation={rotationY ? [0, rotationY, 0] : undefined}
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
