'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import { useBuilderStore } from '@/features/builder/store';
import { getModuleById } from '@/lib/constants/modules';
import { getMaterialById } from '@/lib/constants/materials';
import { formatWon, formatArea, formatPercent } from '@/lib/utils/format';
import { GRID_SIZE, FLOOR_HEIGHT } from '@/lib/constants/grid';
import type { ComplianceLevel } from '@/features/regulations/complianceChecker';

interface ComplianceMetric {
  label: string;
  current: number;
  max: number;
  unit: string;
  level: ComplianceLevel;
}

interface CostStatusBarProps {
  parcelArea?: number;
  maxCoverageRatio?: number;
  maxFloorAreaRatio?: number;
  maxHeight?: number;
}

function levelColor(level: ComplianceLevel): string {
  switch (level) {
    case 'OK':
      return 'text-green-600';
    case 'WARNING':
      return 'text-yellow-600';
    case 'VIOLATION':
      return 'text-red-600';
  }
}

function levelBg(level: ComplianceLevel): string {
  switch (level) {
    case 'OK':
      return 'bg-green-100';
    case 'WARNING':
      return 'bg-yellow-100';
    case 'VIOLATION':
      return 'bg-red-100';
  }
}

function levelDot(level: ComplianceLevel): string {
  switch (level) {
    case 'OK':
      return 'bg-green-500';
    case 'WARNING':
      return 'bg-yellow-500';
    case 'VIOLATION':
      return 'bg-red-500';
  }
}

function getLevel(current: number, max: number): ComplianceLevel {
  if (max <= 0) return 'OK';
  const ratio = current / max;
  if (ratio > 1) return 'VIOLATION';
  if (ratio >= 0.9) return 'WARNING';
  return 'OK';
}

export function CostStatusBar({
  parcelArea = 200,
  maxCoverageRatio = 60,
  maxFloorAreaRatio = 200,
  maxHeight = 15,
}: CostStatusBarProps) {
  const placements = useBuilderStore((s) => s.placements);

  const stats = useMemo(() => {
    let totalModules = placements.length;
    let totalArea = 0;
    let totalCost = 0;
    let totalFootprintArea = 0;
    let totalFloorArea = 0;
    let currentMaxHeight = 0;

    // Track unique footprint per floor to avoid double-counting
    const floorFootprints = new Map<number, number>();

    for (const p of placements) {
      const mod = getModuleById(p.moduleId);
      if (!mod) continue;

      const area = mod.width * mod.depth;
      totalArea += area;

      const mat = p.materialId ? getMaterialById(p.materialId) : undefined;
      const multiplier = mat?.priceMultiplier ?? 1;
      totalCost += mod.basePrice * multiplier;

      // Floor area accumulates for all floors
      totalFloorArea += area;

      // Footprint: accumulate per floor, then take max
      const existing = floorFootprints.get(p.floor) ?? 0;
      floorFootprints.set(p.floor, existing + area);

      // Height
      const moduleTop = (p.floor - 1) * FLOOR_HEIGHT + mod.height;
      if (moduleTop > currentMaxHeight) currentMaxHeight = moduleTop;
    }

    // Total footprint is the max footprint of any single floor
    for (const [, area] of floorFootprints) {
      if (area > totalFootprintArea) totalFootprintArea = area;
    }

    // Calculate ratios
    const coverageRatio = parcelArea > 0 ? (totalFootprintArea / parcelArea) * 100 : 0;
    const floorAreaRatio = parcelArea > 0 ? (totalFloorArea / parcelArea) * 100 : 0;

    return {
      totalModules,
      totalArea,
      totalCost,
      coverageRatio,
      floorAreaRatio,
      currentMaxHeight,
    };
  }, [placements, parcelArea]);

  const metrics: ComplianceMetric[] = [
    {
      label: '건폐율',
      current: stats.coverageRatio,
      max: maxCoverageRatio,
      unit: '%',
      level: getLevel(stats.coverageRatio, maxCoverageRatio),
    },
    {
      label: '용적률',
      current: stats.floorAreaRatio,
      max: maxFloorAreaRatio,
      unit: '%',
      level: getLevel(stats.floorAreaRatio, maxFloorAreaRatio),
    },
    {
      label: '높이',
      current: stats.currentMaxHeight,
      max: maxHeight,
      unit: 'm',
      level: getLevel(stats.currentMaxHeight, maxHeight),
    },
  ];

  return (
    <div className="flex items-center gap-6 border-t border-slate-200 bg-white px-4 py-2">
      {/* Module count */}
      <div className="flex items-center gap-1.5 text-sm">
        <span className="text-slate-500">모듈</span>
        <span className="font-medium text-slate-900">{stats.totalModules}개</span>
      </div>

      {/* Total area */}
      <div className="flex items-center gap-1.5 text-sm">
        <span className="text-slate-500">면적</span>
        <span className="font-medium text-slate-900">{formatArea(stats.totalArea)}</span>
      </div>

      {/* Total cost */}
      <div className="flex items-center gap-1.5 text-sm">
        <span className="text-slate-500">비용</span>
        <span className="font-semibold text-slate-900">{formatWon(stats.totalCost)}</span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Compliance metrics */}
      {metrics.map((m) => (
        <div key={m.label} className="flex items-center gap-1.5">
          <div className={cn('h-2 w-2 rounded-full', levelDot(m.level))} />
          <span className="text-xs text-slate-500">{m.label}</span>
          <span className={cn('text-xs font-medium', levelColor(m.level))}>
            {m.current.toFixed(1)}{m.unit}
          </span>
          <span className="text-xs text-slate-400">/ {m.max}{m.unit}</span>
        </div>
      ))}
    </div>
  );
}
