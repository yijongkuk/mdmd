'use client';

import { useState, useCallback } from 'react';
import { Pencil, X, Check, RotateCcw } from 'lucide-react';
import { useBuilderStore } from '@/features/builder/store';

interface RegulationOverridePanelProps {
  maxCoverageRatio: number;
  maxFloorAreaRatio: number;
  regulationSource?: 'statutory' | 'municipal';
  municipalityName?: string;
}

export function RegulationOverridePanel({
  maxCoverageRatio,
  maxFloorAreaRatio,
  regulationSource,
  municipalityName,
}: RegulationOverridePanelProps) {
  const overrides = useBuilderStore((s) => s.regulationOverrides);
  const setOverride = useBuilderStore((s) => s.setRegulationOverride);
  const resetOverrides = useBuilderStore((s) => s.resetRegulationOverrides);

  const [editing, setEditing] = useState(false);
  const [draftCoverage, setDraftCoverage] = useState('');
  const [draftFAR, setDraftFAR] = useState('');

  const effectiveCoverage = overrides?.maxCoverageRatio ?? maxCoverageRatio;
  const effectiveFAR = overrides?.maxFloorAreaRatio ?? maxFloorAreaRatio;
  const isCustom = overrides != null;

  const startEdit = useCallback(() => {
    setDraftCoverage(String(effectiveCoverage));
    setDraftFAR(String(effectiveFAR));
    setEditing(true);
  }, [effectiveCoverage, effectiveFAR]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
  }, []);

  const confirmEdit = useCallback(() => {
    const cov = Number(draftCoverage);
    const far = Number(draftFAR);
    if (cov > 0 && cov <= 100) setOverride('maxCoverageRatio', cov);
    if (far > 0 && far <= 3000) setOverride('maxFloorAreaRatio', far);
    setEditing(false);
  }, [draftCoverage, draftFAR, setOverride]);

  const handleReset = useCallback(() => {
    resetOverrides();
    setEditing(false);
  }, [resetOverrides]);

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5 text-blue-700">
        <span className="text-blue-600">건폐율</span>
        <input
          type="number"
          value={draftCoverage}
          onChange={(e) => setDraftCoverage(e.target.value)}
          className="w-14 rounded border border-blue-300 bg-white px-1.5 py-0.5 text-center text-sm text-blue-900 focus:border-blue-500 focus:outline-none"
          min={1}
          max={100}
          onKeyDown={(e) => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') cancelEdit(); }}
        />
        <span className="text-blue-600">% / 용적률</span>
        <input
          type="number"
          value={draftFAR}
          onChange={(e) => setDraftFAR(e.target.value)}
          className="w-16 rounded border border-blue-300 bg-white px-1.5 py-0.5 text-center text-sm text-blue-900 focus:border-blue-500 focus:outline-none"
          min={1}
          max={3000}
          onKeyDown={(e) => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') cancelEdit(); }}
        />
        <span className="text-blue-600">%</span>
        <button onClick={confirmEdit} className="cursor-pointer rounded p-0.5 text-green-600 hover:bg-green-100">
          <Check className="h-3.5 w-3.5" />
        </button>
        <button onClick={cancelEdit} className="cursor-pointer rounded p-0.5 text-red-500 hover:bg-red-100">
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }

  const sourceLabel = isCustom
    ? null
    : regulationSource === 'municipal' && municipalityName
      ? ` (${municipalityName} 조례)`
      : null;

  return (
    <span className="inline-flex items-center gap-1 text-blue-700">
      <span>
        건폐율 {effectiveCoverage}% / 용적률 {effectiveFAR}%
      </span>
      {sourceLabel && <span className="text-blue-500">{sourceLabel}</span>}
      {isCustom && (
        <span className="ml-1 rounded-sm bg-amber-100 px-1 py-px text-xs font-medium text-amber-700">
          커스텀
        </span>
      )}
      <button onClick={startEdit} className="cursor-pointer rounded p-0.5 text-blue-500 hover:bg-blue-100" title="건폐율/용적률 수정">
        <Pencil className="h-3.5 w-3.5" />
      </button>
      {isCustom && (
        <button onClick={handleReset} className="cursor-pointer rounded p-0.5 text-blue-500 hover:bg-blue-100" title="원래 값으로 복원">
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}
