'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import type { SurroundingRoad } from '@/types/land';
import { wgs84ToLocal } from '@/lib/geo/coordTransform';

interface SurroundingRoadsProps {
  roads: SurroundingRoad[];
  centroidLng: number;
  centroidLat: number;
}

const ROAD_COLOR = '#9ca3af';
const ROAD_Y = 0.02;
const DEFAULT_ROAD_WIDTH = 3;

function lineToRibbon(
  points: { x: number; z: number }[],
  halfWidth: number,
): THREE.Shape | null {
  if (points.length < 2) return null;

  const leftPts: { x: number; z: number }[] = [];
  const rightPts: { x: number; z: number }[] = [];

  for (let i = 0; i < points.length; i++) {
    let dx: number, dz: number;

    if (i === 0) {
      dx = points[1].x - points[0].x;
      dz = points[1].z - points[0].z;
    } else if (i === points.length - 1) {
      dx = points[i].x - points[i - 1].x;
      dz = points[i].z - points[i - 1].z;
    } else {
      dx = points[i + 1].x - points[i - 1].x;
      dz = points[i + 1].z - points[i - 1].z;
    }

    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.001) continue;

    const nx = -dz / len;
    const nz = dx / len;

    leftPts.push({
      x: points[i].x + nx * halfWidth,
      z: points[i].z + nz * halfWidth,
    });
    rightPts.push({
      x: points[i].x - nx * halfWidth,
      z: points[i].z - nz * halfWidth,
    });
  }

  if (leftPts.length < 2) return null;

  const shape = new THREE.Shape();
  shape.moveTo(leftPts[0].x, -leftPts[0].z);
  for (let i = 1; i < leftPts.length; i++) {
    shape.lineTo(leftPts[i].x, -leftPts[i].z);
  }
  for (let i = rightPts.length - 1; i >= 0; i--) {
    shape.lineTo(rightPts[i].x, -rightPts[i].z);
  }
  shape.closePath();

  return shape;
}

export function SurroundingRoads({
  roads,
  centroidLng,
  centroidLat,
}: SurroundingRoadsProps) {
  const segments = useMemo(() => {
    const result: { id: string; shape: THREE.Shape }[] = [];

    for (const road of roads) {
      const halfWidth = (road.width ?? DEFAULT_ROAD_WIDTH) / 2;

      let lineStrings: number[][][];
      if (road.geometry.type === 'MultiLineString') {
        lineStrings = road.geometry.coordinates as number[][][];
      } else {
        lineStrings = [road.geometry.coordinates as number[][]];
      }

      for (let li = 0; li < lineStrings.length; li++) {
        const coords = lineStrings[li];
        if (!coords || coords.length < 2) continue;

        const localPts = coords.map(([lng, lat]) =>
          wgs84ToLocal(lng, lat, centroidLng, centroidLat),
        );

        const shape = lineToRibbon(localPts, halfWidth);
        if (!shape) continue;

        result.push({ id: `${road.id}-${li}`, shape });
      }
    }

    return result;
  }, [roads, centroidLng, centroidLat]);

  if (segments.length === 0) return null;

  return (
    <group>
      {segments.map((s) => (
        <mesh
          key={s.id}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, ROAD_Y, 0]}
        >
          <shapeGeometry args={[s.shape]} />
          <meshBasicMaterial
            color={ROAD_COLOR}
            transparent
            opacity={0.5}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
