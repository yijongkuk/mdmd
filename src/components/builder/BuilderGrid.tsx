'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { GRID_SIZE, GRID_COLOR, GRID_MAJOR_COLOR } from '@/lib/constants/grid';
import { floorToWorldY } from '@/features/builder/utils/gridUtils';

interface BuilderGridProps {
  floor: number;
  size?: number; // total grid extent in meters
}

export function BuilderGrid({ floor, size = 30 }: BuilderGridProps) {
  const y = floorToWorldY(floor);
  const halfSize = size / 2;
  const cellCount = Math.ceil(size / GRID_SIZE);

  const { minorPositions, majorPositions } = useMemo(() => {
    const minor: number[] = [];
    const major: number[] = [];

    for (let i = 0; i <= cellCount; i++) {
      const pos = -halfSize + i * GRID_SIZE;
      const isMajor = i % 6 === 0;

      if (isMajor) {
        // X-axis line (along Z)
        major.push(pos, 0, -halfSize, pos, 0, halfSize);
        // Z-axis line (along X)
        major.push(-halfSize, 0, pos, halfSize, 0, pos);
      } else {
        minor.push(pos, 0, -halfSize, pos, 0, halfSize);
        minor.push(-halfSize, 0, pos, halfSize, 0, pos);
      }
    }

    return {
      minorPositions: new Float32Array(minor),
      majorPositions: new Float32Array(major),
    };
  }, [cellCount, halfSize]);

  return (
    <group position={[0, y + 0.001, 0]}>
      {/* Minor grid lines */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[minorPositions, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color={GRID_COLOR} transparent opacity={0.6} />
      </lineSegments>

      {/* Major grid lines */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[majorPositions, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color={GRID_MAJOR_COLOR} transparent opacity={0.8} />
      </lineSegments>
    </group>
  );
}
