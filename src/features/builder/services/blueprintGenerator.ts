import { ModulePlacement, ModuleDefinition } from '@/types/builder';
import { getModuleById } from '@/lib/constants/modules';
import { GRID_SIZE } from '@/lib/constants/grid';

export interface FloorPlanCell {
  gridX: number;
  gridZ: number;
  moduleId: string;
  moduleName: string;
  moduleNameKo: string;
  placementId: string;
  color: string;
}

export interface FloorPlanData {
  floor: number;
  cells: FloorPlanCell[];
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  gridSize: number;
}

/** Generate floor plan data for a specific floor */
export function generateFloorPlan(
  placements: ModulePlacement[],
  floor: number,
  gridSize: number = GRID_SIZE
): FloorPlanData {
  const floorPlacements = placements.filter((p) => p.floor === floor);
  const cells: FloorPlanCell[] = [];

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const placement of floorPlacements) {
    const moduleDef = getModuleById(placement.moduleId);
    if (!moduleDef) continue;

    const rotation = placement.rotation;
    const effectiveWidth = rotation === 90 || rotation === 270 ? moduleDef.gridDepth : moduleDef.gridWidth;
    const effectiveDepth = rotation === 90 || rotation === 270 ? moduleDef.gridWidth : moduleDef.gridDepth;

    for (let dx = 0; dx < effectiveWidth; dx++) {
      for (let dz = 0; dz < effectiveDepth; dz++) {
        const cellX = placement.gridX + dx;
        const cellZ = placement.gridZ + dz;

        cells.push({
          gridX: cellX,
          gridZ: cellZ,
          moduleId: placement.moduleId,
          moduleName: moduleDef.name,
          moduleNameKo: moduleDef.nameKo,
          placementId: placement.id,
          color: moduleDef.color,
        });

        minX = Math.min(minX, cellX);
        maxX = Math.max(maxX, cellX);
        minZ = Math.min(minZ, cellZ);
        maxZ = Math.max(maxZ, cellZ);
      }
    }
  }

  // Add padding
  if (cells.length > 0) {
    minX -= 2;
    maxX += 2;
    minZ -= 2;
    maxZ += 2;
  } else {
    minX = 0;
    maxX = 10;
    minZ = 0;
    maxZ = 10;
  }

  return {
    floor,
    cells,
    bounds: { minX, maxX, minZ, maxZ },
    gridSize,
  };
}

/** Render a floor plan to an HTML Canvas element and return the canvas */
export function renderFloorPlanCanvas(
  floorPlan: FloorPlanData,
  options: {
    cellPixelSize?: number;
    backgroundColor?: string;
    gridColor?: string;
    labelColor?: string;
    showLabels?: boolean;
    showDimensions?: boolean;
  } = {}
): HTMLCanvasElement {
  const {
    cellPixelSize = 24,
    backgroundColor = '#FFFFFF',
    gridColor = '#E2E8F0',
    labelColor = '#334155',
    showLabels = true,
    showDimensions = true,
  } = options;

  const { bounds, cells, floor, gridSize } = floorPlan;
  const cols = bounds.maxX - bounds.minX + 1;
  const rows = bounds.maxZ - bounds.minZ + 1;

  const padding = 60;
  const canvasWidth = cols * cellPixelSize + padding * 2;
  const canvasHeight = rows * cellPixelSize + padding * 2;

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Title
  ctx.fillStyle = labelColor;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${floor}층 평면도`, canvasWidth / 2, 24);

  // Draw grid
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;

  for (let col = 0; col <= cols; col++) {
    const x = padding + col * cellPixelSize;
    ctx.beginPath();
    ctx.moveTo(x, padding);
    ctx.lineTo(x, padding + rows * cellPixelSize);
    ctx.stroke();
  }

  for (let row = 0; row <= rows; row++) {
    const y = padding + row * cellPixelSize;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(padding + cols * cellPixelSize, y);
    ctx.stroke();
  }

  // Group cells by placement to draw module outlines
  const placementCells = new Map<string, FloorPlanCell[]>();
  for (const cell of cells) {
    const existing = placementCells.get(cell.placementId) ?? [];
    existing.push(cell);
    placementCells.set(cell.placementId, existing);
  }

  // Draw filled cells
  for (const cell of cells) {
    const px = padding + (cell.gridX - bounds.minX) * cellPixelSize;
    const py = padding + (cell.gridZ - bounds.minZ) * cellPixelSize;

    ctx.fillStyle = cell.color + 'B0'; // semi-transparent
    ctx.fillRect(px + 1, py + 1, cellPixelSize - 2, cellPixelSize - 2);
  }

  // Draw module outlines and labels
  for (const [placementId, pCells] of placementCells) {
    if (pCells.length === 0) continue;

    const minCellX = Math.min(...pCells.map((c) => c.gridX));
    const maxCellX = Math.max(...pCells.map((c) => c.gridX));
    const minCellZ = Math.min(...pCells.map((c) => c.gridZ));
    const maxCellZ = Math.max(...pCells.map((c) => c.gridZ));

    const outlineX = padding + (minCellX - bounds.minX) * cellPixelSize;
    const outlineY = padding + (minCellZ - bounds.minZ) * cellPixelSize;
    const outlineW = (maxCellX - minCellX + 1) * cellPixelSize;
    const outlineH = (maxCellZ - minCellZ + 1) * cellPixelSize;

    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2;
    ctx.strokeRect(outlineX, outlineY, outlineW, outlineH);

    // Label
    if (showLabels) {
      const label = pCells[0].moduleNameKo;
      ctx.fillStyle = labelColor;
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const labelX = outlineX + outlineW / 2;
      const labelY = outlineY + outlineH / 2;
      ctx.fillText(label, labelX, labelY);
    }

    // Dimensions
    if (showDimensions) {
      const widthM = ((maxCellX - minCellX + 1) * gridSize).toFixed(1);
      const depthM = ((maxCellZ - minCellZ + 1) * gridSize).toFixed(1);

      ctx.fillStyle = '#64748B';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';

      // Width dimension (top)
      ctx.fillText(`${widthM}m`, outlineX + outlineW / 2, outlineY - 4);
      // Depth dimension (left)
      ctx.save();
      ctx.translate(outlineX - 4, outlineY + outlineH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(`${depthM}m`, 0, 0);
      ctx.restore();
    }
  }

  // Scale indicator
  ctx.fillStyle = labelColor;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`격자 크기: ${gridSize}m`, padding, canvasHeight - 10);

  return canvas;
}

/** Export floor plan as PNG blob */
export async function exportFloorPlanPNG(
  placements: ModulePlacement[],
  floor: number
): Promise<Blob> {
  const floorPlan = generateFloorPlan(placements, floor);
  const canvas = renderFloorPlanCanvas(floorPlan);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create PNG blob'));
      },
      'image/png',
      1.0
    );
  });
}

/** Download a floor plan PNG file */
export async function downloadFloorPlanPNG(
  placements: ModulePlacement[],
  floor: number,
  fileName?: string
): Promise<void> {
  const blob = await exportFloorPlanPNG(placements, floor);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName ?? `평면도_${floor}층.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
