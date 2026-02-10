'use client';

import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { LocalPoint } from '@/lib/geo/coordTransform';

interface RegulationBoundaryPolygonProps {
  polygon: LocalPoint[];
}

/** 대지안의 공지 — green dashed outline on ground plane */
export function RegulationBoundaryPolygon({ polygon }: RegulationBoundaryPolygonProps) {
  const lineRef = useRef<THREE.LineLoop>(null);

  const positions = useMemo(() => {
    const arr: number[] = [];
    for (const p of polygon) {
      arr.push(p.x, 0, p.z);
    }
    return new Float32Array(arr);
  }, [polygon]);

  useEffect(() => {
    if (lineRef.current) {
      lineRef.current.computeLineDistances();
    }
  }, [positions]);

  return (
    <lineLoop ref={lineRef} position={[0, 0.005, 0]}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <lineDashedMaterial
        color="#22c55e"
        dashSize={0.3}
        gapSize={0.2}
        transparent
        opacity={0.7}
      />
    </lineLoop>
  );
}
