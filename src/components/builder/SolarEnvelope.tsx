'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import type { LocalPoint } from '@/lib/geo/coordTransform';
import { polygonBounds, clipHorizontalLine } from '@/lib/geo/polygonClip';
import { solarMaxHeight } from '@/lib/geo/solarAccess';

interface SolarEnvelopeProps {
  polygon: LocalPoint[]; // regulation polygon (setback-inset)
  maxHeight: number;
}

export function SolarEnvelope({ polygon, maxHeight }: SolarEnvelopeProps) {
  const { geometry, edgePositions } = useMemo(() => {
    if (maxHeight <= 9) return { geometry: null, edgePositions: null };

    const bounds = polygonBounds(polygon);
    const northZ = bounds.maxZ; // North edge of regulation polygon
    const step = 0.3;

    // Distance south where slope reaches maxHeight: d = (maxHeight - 9) / 2
    const dMax = (maxHeight - 9) / 2;
    const southLimit = Math.max(northZ - dMax, bounds.minZ);

    // Sample cross-sections from north edge going south (only the sloped zone)
    const sections: Array<{ z: number; h: number; xMin: number; xMax: number }> = [];

    for (let z = northZ; z >= southLimit - step; z -= step) {
      const d = northZ - z;
      const h = Math.min(solarMaxHeight(d), maxHeight);
      const segs = clipHorizontalLine(z, bounds.minX, bounds.maxX, polygon);
      if (segs.length > 0) {
        sections.push({ z, h, xMin: segs[0][0], xMax: segs[segs.length - 1][1] });
      }
    }

    if (sections.length < 2) return { geometry: null, edgePositions: null };

    // Build triangle-strip mesh
    const vertices: number[] = [];
    const indices: number[] = [];

    for (const s of sections) {
      vertices.push(s.xMin, s.h, s.z);
      vertices.push(s.xMax, s.h, s.z);
    }

    for (let i = 0; i < sections.length - 1; i++) {
      const v0 = i * 2;
      const v1 = i * 2 + 1;
      const v2 = (i + 1) * 2;
      const v3 = (i + 1) * 2 + 1;
      indices.push(v0, v2, v1);
      indices.push(v1, v2, v3);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    // Profile edge lines
    const edges: number[] = [];
    for (let i = 0; i < sections.length - 1; i++) {
      const s1 = sections[i];
      const s2 = sections[i + 1];
      edges.push(s1.xMin, s1.h, s1.z, s2.xMin, s2.h, s2.z);
      edges.push(s1.xMax, s1.h, s1.z, s2.xMax, s2.h, s2.z);
    }
    // North edge line (at 9m)
    const first = sections[0];
    edges.push(first.xMin, first.h, first.z, first.xMax, first.h, first.z);

    return { geometry: geom, edgePositions: new Float32Array(edges) };
  }, [polygon, maxHeight]);

  if (!geometry || !edgePositions) return null;

  return (
    <group>
      {/* Sloped surface */}
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color="#f59e0b"
          transparent
          opacity={0.08}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Profile edge lines */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[edgePositions, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#f59e0b" transparent opacity={0.4} />
      </lineSegments>
    </group>
  );
}
