'use client';

import { useEffect, useRef } from 'react';
import { ModulePlacement } from '@/types/builder';
import { generateFloorPlan, renderFloorPlanCanvas } from '@/features/builder/services/blueprintGenerator';

interface FloorPlanViewProps {
  placements: ModulePlacement[];
  floor: number;
  className?: string;
}

export function FloorPlanView({ placements, floor, className }: FloorPlanViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const floorPlan = generateFloorPlan(placements, floor);
    const canvas = renderFloorPlanCanvas(floorPlan, {
      cellPixelSize: 20,
      showLabels: true,
      showDimensions: true,
    });

    canvas.style.maxWidth = '100%';
    canvas.style.height = 'auto';

    // Clear previous canvas and add new one
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(canvas);
  }, [placements, floor]);

  const floorPlacements = placements.filter((p) => p.floor === floor);

  if (floorPlacements.length === 0) {
    return (
      <div className={className}>
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-400">
          {floor}층에 배치된 모듈이 없습니다
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div ref={containerRef} className="flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2" />
    </div>
  );
}
