'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import { MATERIALS } from '@/lib/constants/materials';
import { useBuilderStore } from '@/features/builder/store';

export function MaterialPicker() {
  const selectedPlacementIds = useBuilderStore((s) => s.selectedPlacementIds);
  const placements = useBuilderStore((s) => s.placements);
  const updatePlacementMaterial = useBuilderStore((s) => s.updatePlacementMaterial);

  const selectedPlacement = placements.find((p) => p.id === selectedPlacementIds[0]);
  const [customColor, setCustomColor] = useState(selectedPlacement?.customColor ?? '');

  if (selectedPlacementIds.length === 0 || !selectedPlacement) {
    return (
      <div className="px-4 py-3">
        <p className="text-xs text-slate-400">모듈을 선택하면 재질을 변경할 수 있습니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">재질 선택</h3>

      <div className="grid grid-cols-1 gap-1.5">
        {MATERIALS.map((mat) => {
          const isActive = selectedPlacement.materialId === mat.id;
          return (
            <button
              key={mat.id}
              onClick={() => selectedPlacementIds.forEach((id) => updatePlacementMaterial(id, mat.id))}
              className={cn(
                'flex items-center gap-2.5 rounded-md border px-3 py-2 text-left transition-all cursor-pointer',
                isActive
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 hover:border-slate-300',
              )}
            >
              <div
                className="h-5 w-5 flex-shrink-0 rounded-full border border-slate-200"
                style={{ backgroundColor: mat.color }}
              />
              <div className="min-w-0 flex-1">
                <span className="text-xs font-medium text-slate-800">{mat.nameKo}</span>
              </div>
              <span className="text-xs text-slate-400">x{mat.priceMultiplier}</span>
            </button>
          );
        })}
      </div>

      {/* Custom color override */}
      <div className="space-y-1.5 pt-2">
        <label className="text-xs font-medium text-slate-600">커스텀 색상</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={customColor || selectedPlacement.customColor || '#ffffff'}
            onChange={(e) => {
              setCustomColor(e.target.value);
              selectedPlacementIds.forEach((id) => {
                const p = placements.find((pl) => pl.id === id);
                updatePlacementMaterial(id, p?.materialId ?? 'wood', e.target.value);
              });
            }}
            className="h-8 w-8 cursor-pointer rounded border border-slate-200"
          />
          <span className="text-xs text-slate-500">
            {customColor || selectedPlacement.customColor || '기본 색상'}
          </span>
        </div>
      </div>
    </div>
  );
}
