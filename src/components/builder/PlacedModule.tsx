'use client';

import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { ThreeEvent, useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import { ModulePlacement, ModuleDefinition } from '@/types/builder';
import { getMaterialById } from '@/lib/constants/materials';
import { gridToWorld, floorToWorldY } from '@/features/builder/utils/gridUtils';
import { GRID_SIZE } from '@/lib/constants/grid';
import { useBuilderStore } from '@/features/builder/store';
import { getMeshData } from '@/lib/speckle/customModules';

/** Timestamp flag — lets canvas-level handlers know a module was just clicked */
let _modulePointerDownTime = 0;
export function recentlyClickedModule(): boolean {
  return Date.now() - _modulePointerDownTime < 300;
}

interface PlacedModuleProps {
  placement: ModulePlacement;
  module: ModuleDefinition;
  isSelected: boolean;
  isCurrentFloor: boolean;
}

export function PlacedModule({ placement, module, isSelected, isCurrentFloor }: PlacedModuleProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const edgesGroupRef = useRef<THREE.Group>(null);
  const activeTool = useBuilderStore((s) => s.activeTool);
  const selectPlacement = useBuilderStore((s) => s.selectPlacement);
  const removePlacement = useBuilderStore((s) => s.removePlacement);
  const rotatePlacement = useBuilderStore((s) => s.rotatePlacement);
  const startDrag = useBuilderStore((s) => s.startDrag);
  const draggingPlacementId = useBuilderStore((s) => s.draggingPlacementId);
  const selectedPlacementIds = useBuilderStore((s) => s.selectedPlacementIds);
  const gridOffset = useBuilderStore((s) => s.gridOffset);
  const terrainBaseY = useBuilderStore((s) => s.terrainBaseY);
  // Module is being dragged: it's the anchor, or it's selected while another selected module is the anchor
  const isDragging = draggingPlacementId === placement.id
    || (!!draggingPlacementId && isSelected && selectedPlacementIds.includes(draggingPlacementId));

  // Calculate world position — real Y-axis rotation for all modules
  const worldPos = gridToWorld(placement.gridX, placement.gridZ, gridOffset.x, gridOffset.z);
  const worldY = floorToWorldY(placement.floor);

  // Original (unrotated) dimensions
  const realWidth = module.gridWidth * GRID_SIZE;
  const realDepth = module.gridDepth * GRID_SIZE;
  const realHeight = module.height;

  // Rotation around Y axis
  const rotationY = (placement.rotation * Math.PI) / 180;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);

  // Unrotated local center → rotate around grid origin
  const localCx = realWidth / 2;
  const localCz = realDepth / 2;
  const posX = worldPos.x + localCx * cos - localCz * sin;
  const posY = worldY + realHeight / 2;
  const posZ = worldPos.z + localCx * sin + localCz * cos;

  // Determine base color (from module definition / material — doesn't change with selection)
  let baseColor = module.color;
  if (placement.customColor) {
    baseColor = placement.customColor;
  } else if (placement.materialId) {
    const mat = getMaterialById(placement.materialId);
    if (mat) baseColor = mat.color;
  }

  // Material properties from applied material
  const appliedMat = placement.materialId ? getMaterialById(placement.materialId) : undefined;
  const roughness = appliedMat?.roughness ?? 0.6;
  const metalness = appliedMat?.metalness ?? 0.0;

  // Speckle 커스텀 메시 — BufferGeometry 생성 (centered at origin)
  const customGeometry = useMemo(() => {
    if (!module.speckleRef) return null;
    const meshData = getMeshData(module.id);
    if (!meshData || meshData.meshes.length === 0) return null;

    const totalVertLen = meshData.meshes.reduce((s, m) => s + m.vertices.length, 0);
    const totalIdxLen = meshData.meshes.reduce((s, m) => s + m.indices.length, 0);
    const positions = new Float32Array(totalVertLen);
    const indices = new Uint32Array(totalIdxLen);

    // Center offset: mesh vertices start at (0,0,0), center to match BoxGeometry
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
  }, [module.id, module.speckleRef]);

  // Imperative visual sync — reads Zustand store directly every GL frame.
  // Bypasses React's async scheduling so selection/drag changes appear instantly,
  // even without camera movement.
  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const state = useBuilderStore.getState();
    const sel = state.selectedPlacementIds.includes(placement.id);
    const dragId = state.draggingPlacementId;
    const drg = dragId === placement.id
      || (!!dragId && sel && state.selectedPlacementIds.includes(dragId));
    const curFloor = placement.floor === state.currentFloor;

    const mat = mesh.material as THREE.MeshStandardMaterial;

    // Selection highlight only on current floor
    const showSel = sel && curFloor;

    // Color
    if (drg) mat.color.set('#9ca3af');
    else if (showSel) mat.color.set('#93c5fd');
    else mat.color.set(baseColor);

    // Opacity
    const op = drg ? 0.25 : curFloor ? (showSel ? 0.9 : 1.0) : 0.12;
    mat.opacity = op;

    // Emissive
    mat.emissive.set(showSel && !drg ? '#3b82f6' : '#000000');
    mat.emissiveIntensity = showSel && !drg ? 0.3 : 0;

    // Surface
    mat.roughness = drg ? 0.8 : roughness;
    mat.metalness = drg ? 0 : metalness;

    // Edges visibility
    if (edgesGroupRef.current) {
      edgesGroupRef.current.visible = showSel && !drg;
    }
  });

  // All interactions via onPointerDown + native pointerup.
  // No onClick/onPointerOver/onPointerOut — removing them eliminates
  // R3F's per-mouse-move raycasting across all meshes (main perf bottleneck).
  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (activeTool === 'place' || !isCurrentFloor) return;
    e.stopPropagation();
    _modulePointerDownTime = Date.now();

    const startX = e.nativeEvent.clientX;
    const startY = e.nativeEvent.clientY;
    const id = placement.id;
    const tool = activeTool;
    const isShift = e.nativeEvent.shiftKey;
    const isCtrl = e.nativeEvent.ctrlKey || e.nativeEvent.metaKey;

    // For selected modules in select mode (no modifier): start drag
    if (tool === 'select' && isSelected && !isShift && !isCtrl && !isDragging) {
      const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(worldY + terrainBaseY));
      const floorHit = new THREE.Vector3();
      e.ray.intersectPlane(floorPlane, floorHit);
      const offsetX = floorHit.x - worldPos.x;
      const offsetZ = -floorHit.z - worldPos.z;
      startDrag(id, offsetX, offsetZ);
      document.body.style.cursor = 'grabbing';
    }

    // Register native pointerup for instant action (bypasses R3F raycast)
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointerup', onUp);
      // Check click vs drag (5px threshold)
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (dx * dx + dy * dy > 25) return;

      if (isShift && tool === 'select') {
        selectPlacement(id, 'add');
      } else if (isCtrl && tool === 'select') {
        selectPlacement(id, 'remove');
      } else if (tool === 'select') {
        selectPlacement(id);
      }
    };
    window.addEventListener('pointerup', onUp, { once: true });
  };

  // Non-current floor modules: no event handlers → rays pass through
  return (
    <mesh
      ref={meshRef}
      position={[posX, posY, posZ]}
      rotation={[0, rotationY, 0]}
      {...(isCurrentFloor && {
        onPointerDown: handlePointerDown,
      })}
    >
      {customGeometry ? (
        <primitive object={customGeometry} attach="geometry" />
      ) : (
        <boxGeometry args={[realWidth, realHeight, realDepth]} />
      )}
      <meshStandardMaterial
        color={baseColor}
        transparent
        opacity={1.0}
        roughness={roughness}
        metalness={metalness}
        depthWrite
      />
      <group ref={edgesGroupRef} visible={false}>
        <Edges linewidth={2} color="#2563eb" />
      </group>
    </mesh>
  );
}
