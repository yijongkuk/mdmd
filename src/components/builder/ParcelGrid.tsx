'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { GRID_SIZE, GRID_COLOR, GRID_MAJOR_COLOR } from '@/lib/constants/grid';
import { floorToWorldY } from '@/features/builder/utils/gridUtils';
import type { LocalPoint } from '@/lib/geo/coordTransform';
import { polygonBounds, clipHorizontalLine, clipVerticalLine } from '@/lib/geo/polygonClip';

interface ParcelGridProps {
  polygon: LocalPoint[];
  floor: number;
  offset?: { x: number; z: number };
}

export function ParcelGrid({ polygon, floor, offset }: ParcelGridProps) {
  const y = floorToWorldY(floor);
  const ox = offset?.x ?? 0;
  const oz = offset?.z ?? 0;

  const { minorPositions, majorPositions } = useMemo(() => {
    const bounds = polygonBounds(polygon);
    const minor: number[] = [];
    const major: number[] = [];

    // Align grid to GRID_SIZE intervals from offset origin
    const startX = Math.floor((bounds.minX - ox) / GRID_SIZE) * GRID_SIZE + ox;
    const endX = Math.ceil((bounds.maxX - ox) / GRID_SIZE) * GRID_SIZE + ox;
    const startZ = Math.floor((bounds.minZ - oz) / GRID_SIZE) * GRID_SIZE + oz;
    const endZ = Math.ceil((bounds.maxZ - oz) / GRID_SIZE) * GRID_SIZE + oz;

    // Vertical lines (constant x, varying z)
    for (let x = startX; x <= endX; x += GRID_SIZE) {
      const gridIndex = Math.round((x - ox) / GRID_SIZE);
      const isMajor = gridIndex % 6 === 0;
      const segments = clipVerticalLine(x, bounds.minZ, bounds.maxZ, polygon);
      const target = isMajor ? major : minor;
      for (const [z1, z2] of segments) {
        target.push(x, 0, z1, x, 0, z2);
      }
    }

    // Horizontal lines (constant z, varying x)
    for (let z = startZ; z <= endZ; z += GRID_SIZE) {
      const gridIndex = Math.round((z - oz) / GRID_SIZE);
      const isMajor = gridIndex % 6 === 0;
      const segments = clipHorizontalLine(z, bounds.minX, bounds.maxX, polygon);
      const target = isMajor ? major : minor;
      for (const [x1, x2] of segments) {
        target.push(x1, 0, z, x2, 0, z);
      }
    }

    return {
      minorPositions: new Float32Array(minor),
      majorPositions: new Float32Array(major),
    };
  }, [polygon, ox, oz]);

  return (
    <group position={[0, y + 0.001, 0]}>
      {/* Minor grid lines */}
      {minorPositions.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[minorPositions, 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color={GRID_COLOR} transparent opacity={0.6} />
        </lineSegments>
      )}

      {/* Major grid lines */}
      {majorPositions.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[majorPositions, 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color={GRID_MAJOR_COLOR} transparent opacity={0.8} />
        </lineSegments>
      )}
    </group>
  );
}
