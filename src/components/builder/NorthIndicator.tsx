'use client';

import { useMemo } from 'react';
import * as THREE from 'three';

interface NorthIndicatorProps {
  position: [number, number, number];
}

export function NorthIndicator({ position }: NorthIndicatorProps) {
  // Shape Y → world -Z after rotation [-PI/2,0,0]
  // Draw in -Y to point north (+Z in world)

  const barShape = useMemo(() => {
    const s = new THREE.Shape();
    const hw = 0.06; // half-width of bar
    const r = 0.72;  // match circle inner radius
    // Bar from center to circle edge
    s.moveTo(-hw, 0);
    s.lineTo(-hw, -r);
    s.lineTo(hw, -r);
    s.lineTo(hw, 0);
    s.closePath();
    return s;
  }, []);

  return (
    <group position={position}>
      {/* Bar pointing north */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <shapeGeometry args={[barShape]} />
        <meshBasicMaterial color="#1e293b" side={THREE.DoubleSide} />
      </mesh>

      {/* Circle outline */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <ringGeometry args={[0.72, 0.76, 32]} />
        <meshBasicMaterial color="#1e293b" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
