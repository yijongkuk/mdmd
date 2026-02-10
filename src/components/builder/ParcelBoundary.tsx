'use client';

import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { LocalPoint } from '@/lib/geo/coordTransform';
import {
  PARCEL_BOUNDARY_COLOR,
  PARCEL_FILL_OPACITY,
  PARCEL_DASH_SIZE,
  PARCEL_GAP_SIZE,
} from '@/lib/constants/grid';

interface ParcelBoundaryProps {
  polygon: LocalPoint[];
}

export function ParcelBoundary({ polygon }: ParcelBoundaryProps) {
  const lineRef = useRef<THREE.LineLoop>(null);

  const positions = useMemo(() => {
    const arr: number[] = [];
    for (const p of polygon) {
      arr.push(p.x, 0, p.z);
    }
    return new Float32Array(arr);
  }, [polygon]);

  const shape = useMemo(() => {
    const s = new THREE.Shape();
    if (polygon.length < 3) return s;
    // Negate Z because rotation [-PI/2, 0, 0] maps shape Y to world -Z
    s.moveTo(polygon[0].x, -polygon[0].z);
    for (let i = 1; i < polygon.length; i++) {
      s.lineTo(polygon[i].x, -polygon[i].z);
    }
    s.closePath();
    return s;
  }, [polygon]);

  // computeLineDistances required for dashed material
  useEffect(() => {
    if (lineRef.current) {
      lineRef.current.computeLineDistances();
    }
  }, [positions]);

  return (
    <group>
      {/* Dashed boundary outline */}
      <lineLoop ref={lineRef} position={[0, 0.01, 0]}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
          />
        </bufferGeometry>
        <lineDashedMaterial
          color={PARCEL_BOUNDARY_COLOR}
          dashSize={PARCEL_DASH_SIZE}
          gapSize={PARCEL_GAP_SIZE}
          transparent
          opacity={0.8}
        />
      </lineLoop>

      {/* Semi-transparent fill */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <shapeGeometry args={[shape]} />
        <meshBasicMaterial
          color={PARCEL_BOUNDARY_COLOR}
          transparent
          opacity={PARCEL_FILL_OPACITY}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
