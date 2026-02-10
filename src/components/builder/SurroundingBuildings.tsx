'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import type { SurroundingBuilding } from '@/types/land';
import { geoJsonRingToLocal } from '@/lib/geo/coordTransform';

interface SurroundingBuildingsProps {
  buildings: SurroundingBuilding[];
  centroidLng: number;
  centroidLat: number;
}

const BUILDING_COLOR = '#d1d5db';
const BUILDING_OPACITY = 0.6;
const DEFAULT_FLOORS = 3;
const FLOOR_HEIGHT = 3; // meters

export function SurroundingBuildings({
  buildings,
  centroidLng,
  centroidLat,
}: SurroundingBuildingsProps) {
  const meshes = useMemo(() => {
    return buildings
      .map((bldg) => {
        const ring = bldg.geometry?.coordinates?.[0];
        if (!ring || ring.length < 4) return null;

        const localPts = geoJsonRingToLocal(ring, centroidLng, centroidLat);
        if (localPts.length < 3) return null;

        const shape = new THREE.Shape();
        shape.moveTo(localPts[0].x, -localPts[0].z);
        for (let i = 1; i < localPts.length; i++) {
          shape.lineTo(localPts[i].x, -localPts[i].z);
        }
        shape.closePath();

        const height = bldg.height ?? (bldg.floors ?? DEFAULT_FLOORS) * FLOOR_HEIGHT;

        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: height,
          bevelEnabled: false,
        });

        return { id: bldg.id, geometry, height };
      })
      .filter(Boolean) as { id: string; geometry: THREE.ExtrudeGeometry; height: number }[];
  }, [buildings, centroidLng, centroidLat]);

  if (meshes.length === 0) return null;

  return (
    <group>
      {meshes.map((m) => (
        <mesh
          key={m.id}
          geometry={m.geometry}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0, 0]}
        >
          <meshStandardMaterial
            color={BUILDING_COLOR}
            transparent
            opacity={BUILDING_OPACITY}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
