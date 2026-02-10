'use client';

import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';

interface RegulationBoundaryProps {
  width: number;
  depth: number;
  height: number;
}

export function RegulationBoundary({ width, depth, height }: RegulationBoundaryProps) {
  const lineRef = useRef<THREE.LineSegments>(null);

  const positions = useMemo(() => {
    const hw = width / 2;
    const hd = depth / 2;
    const h = height;

    // 12 edges of the box
    const lines = [
      // Bottom face
      -hw, 0, -hd, hw, 0, -hd,
      hw, 0, -hd, hw, 0, hd,
      hw, 0, hd, -hw, 0, hd,
      -hw, 0, hd, -hw, 0, -hd,
      // Top face
      -hw, h, -hd, hw, h, -hd,
      hw, h, -hd, hw, h, hd,
      hw, h, hd, -hw, h, hd,
      -hw, h, hd, -hw, h, -hd,
      // Vertical edges
      -hw, 0, -hd, -hw, h, -hd,
      hw, 0, -hd, hw, h, -hd,
      hw, 0, hd, hw, h, hd,
      -hw, 0, hd, -hw, h, hd,
    ];

    return new Float32Array(lines);
  }, [width, depth, height]);

  // computeLineDistances is required for dashed materials
  useEffect(() => {
    if (lineRef.current) {
      lineRef.current.computeLineDistances();
    }
  }, [positions]);

  return (
    <group position={[0, 0, 0]}>
      {/* Wireframe boundary */}
      <lineSegments ref={lineRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
          />
        </bufferGeometry>
        <lineDashedMaterial
          color="#3b82f6"
          dashSize={0.5}
          gapSize={0.3}
          transparent
          opacity={0.6}
        />
      </lineSegments>

      {/* Semi-transparent fill for buildable zone */}
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial
          color="#3b82f6"
          transparent
          opacity={0.04}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
