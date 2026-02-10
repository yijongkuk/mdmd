'use client';

import { useMemo } from 'react';
import { calculateRegulations, ParcelInput, RegulationResult } from './engine';
import {
  checkCompliance,
  ComplianceStatus,
  PlacementSummary,
} from './complianceChecker';

export function useRegulations(
  parcel: ParcelInput | null,
): RegulationResult | null {
  return useMemo(() => {
    if (!parcel) return null;
    return calculateRegulations(parcel);
  }, [parcel?.area, parcel?.zoneType, parcel?.width, parcel?.depth]);
}

export function useComplianceCheck(
  summary: PlacementSummary | null,
  regulation: RegulationResult | null,
): ComplianceStatus | null {
  return useMemo(() => {
    if (!summary || !regulation) return null;
    return checkCompliance(summary, regulation);
  }, [summary, regulation]);
}
