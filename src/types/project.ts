import { ModulePlacement } from './builder';

export interface Project {
  id: string;
  name: string;
  description?: string;
  parcelPnu?: string;
  gridSizeM: number;
  totalModules: number;
  totalArea: number;
  totalCost: number;
  placements: ModulePlacement[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description?: string;
  parcelPnu?: string;
  totalModules: number;
  totalArea: number;
  totalCost: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectExport {
  version: string;
  exportedAt: string;
  project: Project;
}
