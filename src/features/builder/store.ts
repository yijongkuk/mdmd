import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { ModulePlacement, BuilderTool } from '@/types/builder';
import { ROTATION_STEP } from '@/lib/constants/grid';
import { getModuleById } from '@/lib/constants/modules';

const MAX_UNDO_STEPS = 50;

export interface FloorAreaInfo {
  floor: number;   // 1-based floor number
  area: number;    // m²
  width: number;   // m (east-west)
  depth: number;   // m (north-south, may vary due to solar clipping)
}

interface BuilderStore {
  // State
  projectId: string | null;
  projectName: string;
  maxFloors: number;
  placements: ModulePlacement[];
  activeTool: BuilderTool;
  selectedModuleDefId: string | null;
  selectedPlacementIds: string[];
  currentFloor: number;
  visibleFloors: number[];
  draggingPlacementId: string | null;
  dragOffset: { x: number; z: number } | null;
  floorAreas: FloorAreaInfo[];
  gridOffset: { x: number; z: number };
  terrainBaseY: number;
  showSurrounding: boolean;
  showSatellite: boolean;
  viewAllFloors: boolean;
  gridSnap: boolean;
  gridLocked: boolean;
  toastMessage: string | null;
  toastType: 'info' | 'error';
  boxSelectRect: { x1: number; y1: number; x2: number; y2: number; crossing: boolean } | null;
  clipboard: Omit<ModulePlacement, 'id' | 'floor'>[] | null;
  parcelCenter: { lat: number; lng: number } | null;

  // Undo/Redo
  undoStack: ModulePlacement[][];
  redoStack: ModulePlacement[][];

  // Actions
  setProjectId: (id: string) => void;
  setProjectName: (name: string) => void;
  setMaxFloors: (n: number) => void;
  setActiveTool: (tool: BuilderTool) => void;
  selectModuleDef: (id: string | null) => void;
  selectPlacement: (id: string | null, mode?: 'replace' | 'add' | 'remove') => void;
  setCurrentFloor: (floor: number) => void;
  toggleFloorVisibility: (floor: number) => void;

  addPlacement: (placement: Omit<ModulePlacement, 'id'>) => void;
  removePlacement: (id: string) => void;
  movePlacement: (id: string, gridX: number, gridY: number, gridZ: number) => void;
  movePlacements: (moves: Array<{ id: string; gridX: number; gridZ: number }>) => void;
  rotatePlacement: (id: string, direction?: 1 | -1) => void;
  updatePlacementMaterial: (id: string, materialId: string, customColor?: string) => void;
  startDrag: (id: string, offsetX: number, offsetZ: number) => void;
  endDrag: () => void;

  undo: () => void;
  redo: () => void;

  setGridOffset: (offset: { x: number; z: number }) => void;
  setFloorAreas: (areas: FloorAreaInfo[]) => void;
  setTerrainBaseY: (y: number) => void;
  toggleViewAllFloors: () => void;
  toggleSurrounding: () => void;
  toggleSatellite: () => void;
  toggleGridSnap: () => void;
  toggleGridLock: () => void;
  showToast: (message: string, type?: 'info' | 'error') => void;
  setBoxSelectRect: (rect: { x1: number; y1: number; x2: number; y2: number; crossing: boolean } | null) => void;
  selectMultiple: (ids: string[]) => void;
  copyPlacements: () => void;
  pastePlacements: () => void;
  loadPlacements: (placements: ModulePlacement[]) => void;
  clearAll: () => void;
  setParcelCenter: (center: { lat: number; lng: number } | null) => void;
}

function pushUndo(undoStack: ModulePlacement[][], snapshot: ModulePlacement[]): ModulePlacement[][] {
  const next = [...undoStack, snapshot];
  if (next.length > MAX_UNDO_STEPS) {
    return next.slice(next.length - MAX_UNDO_STEPS);
  }
  return next;
}

export const useBuilderStore = create<BuilderStore>((set) => ({
  // Initial state
  projectId: null,
  projectName: '새 프로젝트',
  maxFloors: 5,
  placements: [],
  activeTool: 'select',
  selectedModuleDefId: null,
  selectedPlacementIds: [],
  currentFloor: 1,
  visibleFloors: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  draggingPlacementId: null,
  dragOffset: null,
  floorAreas: [],
  gridOffset: { x: 0, z: 0 },
  terrainBaseY: 0,
  showSurrounding: true,
  showSatellite: false,
  viewAllFloors: false,
  gridSnap: true,
  gridLocked: true,
  toastMessage: null,
  toastType: 'info' as const,
  boxSelectRect: null,
  clipboard: null,
  parcelCenter: null,
  undoStack: [],
  redoStack: [],

  setProjectId: (id) => set({ projectId: id }),
  setProjectName: (name) => set({ projectName: name }),
  setMaxFloors: (n) => set((state) => {
    // 모든 층 기본 visible, 현재층이 범위 밖이면 조정
    const visibleFloors = Array.from({ length: n }, (_, i) => i + 1);
    const currentFloor = state.currentFloor > n ? 1 : state.currentFloor;
    return { maxFloors: n, visibleFloors, currentFloor };
  }),

  setActiveTool: (tool) =>
    set({
      activeTool: tool,
      // Clear module selection when switching away from place
      ...(tool !== 'place' ? { selectedModuleDefId: null } : {}),
    }),

  selectModuleDef: (id) =>
    set({
      selectedModuleDefId: id,
      selectedPlacementIds: [],
      activeTool: id ? 'place' : 'select',
    }),

  selectPlacement: (id, mode = 'replace') =>
    set((state) => {
      if (id === null) {
        return { selectedPlacementIds: [], selectedModuleDefId: null, activeTool: 'select' };
      }
      const ids = state.selectedPlacementIds;
      if (mode === 'add') {
        // Shift: add to selection (skip if already selected)
        const next = ids.includes(id) ? ids : [...ids, id];
        return { selectedPlacementIds: next, selectedModuleDefId: null, activeTool: 'select' };
      }
      if (mode === 'remove') {
        // Ctrl: remove from selection
        return { selectedPlacementIds: ids.filter((i) => i !== id), selectedModuleDefId: null, activeTool: 'select' };
      }
      // replace: single selection
      return { selectedPlacementIds: [id], selectedModuleDefId: null, activeTool: 'select' };
    }),

  setCurrentFloor: (floor) => set({ currentFloor: floor, viewAllFloors: false }),

  toggleFloorVisibility: (floor) =>
    set((state) => {
      const visible = state.visibleFloors.includes(floor)
        ? state.visibleFloors.filter((f) => f !== floor)
        : [...state.visibleFloors, floor].sort();
      return { visibleFloors: visible };
    }),

  addPlacement: (placement) =>
    set((state) => {
      const newPlacement: ModulePlacement = {
        ...placement,
        id: uuidv4(),
      };
      return {
        placements: [...state.placements, newPlacement],
        undoStack: pushUndo(state.undoStack, state.placements),
        redoStack: [],
      };
    }),

  removePlacement: (id) =>
    set((state) => ({
      placements: state.placements.filter((p) => p.id !== id),
      selectedPlacementIds: state.selectedPlacementIds.filter((sid) => sid !== id),
      undoStack: pushUndo(state.undoStack, state.placements),
      redoStack: [],
    })),

  movePlacement: (id, gridX, gridY, gridZ) =>
    set((state) => ({
      placements: state.placements.map((p) =>
        p.id === id ? { ...p, gridX, gridY, gridZ } : p,
      ),
      undoStack: pushUndo(state.undoStack, state.placements),
      redoStack: [],
    })),

  movePlacements: (moves) =>
    set((state) => {
      const moveMap = new Map(moves.map((m) => [m.id, m]));
      return {
        placements: state.placements.map((p) => {
          const m = moveMap.get(p.id);
          return m ? { ...p, gridX: m.gridX, gridY: 0, gridZ: m.gridZ } : p;
        }),
        undoStack: pushUndo(state.undoStack, state.placements),
        redoStack: [],
      };
    }),

  rotatePlacement: (id, direction = 1) =>
    set((state) => {
      const p = state.placements.find((pl) => pl.id === id);
      if (!p) return state;
      const mod = getModuleById(p.moduleId);
      if (!mod) return state;

      const oldRot = p.rotation;
      const newRot = (oldRot + ROTATION_STEP * direction + 360) % 360;

      // Center-preserving rotation: compute gridX/gridZ so the center stays fixed
      const hw = mod.gridWidth / 2; // half-width in grid units
      const hd = mod.gridDepth / 2; // half-depth in grid units

      const oldRad = (oldRot * Math.PI) / 180;
      const newRad = (newRot * Math.PI) / 180;
      const oldCos = Math.cos(oldRad), oldSin = Math.sin(oldRad);
      const newCos = Math.cos(newRad), newSin = Math.sin(newRad);

      // Old center in grid units
      const cx = p.gridX + hw * oldCos - hd * oldSin;
      const cz = p.gridZ + hw * oldSin + hd * oldCos;

      // New origin so center stays the same
      const newGridX = cx - (hw * newCos - hd * newSin);
      const newGridZ = cz - (hw * newSin + hd * newCos);

      return {
        placements: state.placements.map((pl) =>
          pl.id === id
            ? { ...pl, rotation: newRot, gridX: newGridX, gridZ: newGridZ }
            : pl,
        ),
        undoStack: pushUndo(state.undoStack, state.placements),
        redoStack: [],
      };
    }),

  startDrag: (id, offsetX, offsetZ) => set({ draggingPlacementId: id, dragOffset: { x: offsetX, z: offsetZ } }),
  endDrag: () => set({ draggingPlacementId: null, dragOffset: null }),

  setGridOffset: (offset) => set({ gridOffset: offset }),
  setFloorAreas: (areas) => set({ floorAreas: areas }),
  setTerrainBaseY: (y) => set({ terrainBaseY: y }),
  toggleViewAllFloors: () => set((state) => ({ viewAllFloors: !state.viewAllFloors })),
  toggleSurrounding: () => set((state) => ({ showSurrounding: !state.showSurrounding })),
  toggleSatellite: () => set((state) => ({ showSatellite: !state.showSatellite })),
  toggleGridSnap: () => set((state) => ({ gridSnap: !state.gridSnap })),
  toggleGridLock: () => set((state) => ({ gridLocked: !state.gridLocked })),
  showToast: (message, type = 'error') => {
    set({ toastMessage: message, toastType: type });
    setTimeout(() => set({ toastMessage: null }), 2000);
  },
  setBoxSelectRect: (rect) => set({ boxSelectRect: rect }),
  selectMultiple: (ids) => set({ selectedPlacementIds: ids, selectedModuleDefId: null, activeTool: 'select' }),

  copyPlacements: () =>
    set((state) => {
      const selected = state.placements.filter((p) => state.selectedPlacementIds.includes(p.id));
      if (selected.length === 0) return state;
      const clipboard = selected.map(({ id, floor, ...rest }) => rest);
      return { clipboard };
    }),

  pastePlacements: () =>
    set((state) => {
      if (!state.clipboard || state.clipboard.length === 0) return state;
      const newPlacements: ModulePlacement[] = state.clipboard.map((item) => ({
        ...item,
        id: uuidv4(),
        floor: state.currentFloor,
      }));
      const newIds = newPlacements.map((p) => p.id);
      return {
        placements: [...state.placements, ...newPlacements],
        selectedPlacementIds: newIds,
        selectedModuleDefId: null,
        activeTool: 'select',
        undoStack: pushUndo(state.undoStack, state.placements),
        redoStack: [],
      };
    }),

  updatePlacementMaterial: (id, materialId, customColor) =>
    set((state) => ({
      placements: state.placements.map((p) =>
        p.id === id ? { ...p, materialId, customColor } : p,
      ),
      undoStack: pushUndo(state.undoStack, state.placements),
      redoStack: [],
    })),

  undo: () =>
    set((state) => {
      if (state.undoStack.length === 0) return state;
      const previous = state.undoStack[state.undoStack.length - 1];
      return {
        placements: previous,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: pushUndo(state.redoStack, state.placements),
        selectedPlacementIds: [],
      };
    }),

  redo: () =>
    set((state) => {
      if (state.redoStack.length === 0) return state;
      const next = state.redoStack[state.redoStack.length - 1];
      return {
        placements: next,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: pushUndo(state.undoStack, state.placements),
        selectedPlacementIds: [],
      };
    }),

  loadPlacements: (placements) =>
    set({
      placements,
      undoStack: [],
      redoStack: [],
      selectedPlacementIds: [],
    }),

  clearAll: () =>
    set((state) => ({
      placements: [],
      undoStack: pushUndo(state.undoStack, state.placements),
      redoStack: [],
      selectedPlacementIds: [],
      selectedModuleDefId: null,
      activeTool: 'select',
    })),

  setParcelCenter: (center) => set({ parcelCenter: center }),
}));
