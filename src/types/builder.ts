export type ModuleCategory = 'STRUCTURAL' | 'FUNCTIONAL' | 'DESIGN';

export const MODULE_CATEGORIES: ModuleCategory[] = ['STRUCTURAL', 'FUNCTIONAL', 'DESIGN'];

export const MODULE_CATEGORY_LABELS: Record<ModuleCategory, string> = {
  STRUCTURAL: '구조 모듈',
  FUNCTIONAL: '기능 모듈',
  DESIGN: '디자인 모듈',
};

export interface ConnectionPoint {
  position: [number, number, number];
  direction: [number, number, number];
  type: 'wall' | 'floor' | 'ceiling' | 'door' | 'window';
}

export interface ModuleDefinition {
  id: string;
  name: string;
  nameKo: string;
  category: ModuleCategory;
  description?: string;
  width: number;
  depth: number;
  height: number;
  gridWidth: number;
  gridDepth: number;
  gridHeight: number;
  modelUrl?: string;
  thumbnailUrl?: string;
  connectionPoints?: ConnectionPoint[];
  baseMaterialId?: string;
  basePrice: number;
  color: string;
  /** Speckle에서 가져온 모듈인 경우 참조 정보 */
  speckleRef?: { streamId: string; objectId: string; commitId?: string };
}

export type BuilderTool = 'select' | 'place' | 'move';

export interface GridPosition {
  gridX: number;
  gridY: number;
  gridZ: number;
}

export interface ModulePlacement {
  id: string;
  moduleId: string;
  gridX: number;
  gridY: number;
  gridZ: number;
  rotation: 0 | 90 | 180 | 270;
  floor: number;
  materialId?: string;
  customColor?: string;
}

export interface BuilderState {
  projectId: string | null;
  placements: ModulePlacement[];
  activeTool: BuilderTool;
  selectedModuleDefId: string | null;
  selectedPlacementIds: string[];
  currentFloor: number;
  visibleFloors: number[];
  undoStack: ModulePlacement[][];
  redoStack: ModulePlacement[][];
}

export interface PlacementValidation {
  valid: boolean;
  reason?: string;
  conflictingIds?: string[];
}
