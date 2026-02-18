'use client';

import { useState, useRef, useEffect, useSyncExternalStore } from 'react';
import { Search, Upload } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MODULES_BY_CATEGORY } from '@/lib/constants/modules';
import { type ModuleCategory, type ModuleDefinition } from '@/types/builder';
import { formatWon } from '@/lib/utils/format';
import { useBuilderStore } from '@/features/builder/store';
import { subscribe, getSnapshot, getMeshData, isCustomModule } from '@/lib/speckle/customModules';
import { SpeckleExportDialog } from './SpeckleExportDialog';

const CATEGORY_TAB_MAP: { value: ModuleCategory; label: string }[] = [
  { value: 'STRUCTURAL', label: '구조' },
  { value: 'FUNCTIONAL', label: '기능' },
  { value: 'DESIGN', label: '디자인' },
];

// ===== Isometric thumbnail renderer =====

/** 등각 투영: 3D → 2D (Y-up) */
function isoProject(x: number, y: number, z: number): [number, number] {
  const cos30 = 0.866;
  const sin30 = 0.5;
  return [
    (x - z) * cos30,
    -(x + z) * sin30 - y,
  ];
}

function ModuleThumbnail({ module }: { module: ModuleDefinition }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = 48;
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const meshData = isCustomModule(module.id) ? getMeshData(module.id) : null;

    if (meshData && meshData.meshes.length > 0) {
      // Speckle 커스텀 모듈: 실제 메시의 엣지 렌더링
      const bb = meshData.boundingBox.size;
      const maxDim = Math.max(bb[0], bb[1], bb[2], 0.01);
      const scale = (size * 0.35) / maxDim;
      const cx = bb[0] / 2, cy = bb[1] / 2, cz = bb[2] / 2;

      ctx.save();
      ctx.translate(size / 2, size / 2);

      // 삼각형 면을 채우기
      ctx.fillStyle = '#e2e8f0';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 0.5;

      for (const part of meshData.meshes) {
        const verts = part.vertices;
        const idxs = part.indices;
        for (let i = 0; i < idxs.length; i += 3) {
          const i0 = idxs[i], i1 = idxs[i + 1], i2 = idxs[i + 2];
          const [ax, ay] = isoProject(
            (verts[i0 * 3] - cx) * scale,
            (verts[i0 * 3 + 1] - cy) * scale,
            (verts[i0 * 3 + 2] - cz) * scale,
          );
          const [bx, by] = isoProject(
            (verts[i1 * 3] - cx) * scale,
            (verts[i1 * 3 + 1] - cy) * scale,
            (verts[i1 * 3 + 2] - cz) * scale,
          );
          const [ccx, ccy] = isoProject(
            (verts[i2 * 3] - cx) * scale,
            (verts[i2 * 3 + 1] - cy) * scale,
            (verts[i2 * 3 + 2] - cz) * scale,
          );
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.lineTo(ccx, ccy);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.restore();
    } else {
      // 기본 BoxGeometry: 등각 박스 렌더링
      const { width: w, height: h, depth: d } = module;
      const maxDim = Math.max(w, h, d, 0.01);
      const scale = (size * 0.35) / maxDim;
      const hw = (w * scale) / 2, hh = (h * scale) / 2, hd = (d * scale) / 2;

      // 8 꼭짓점 (Y-up, 중심 기준)
      const corners = [
        [-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd],
        [-hw, hh, -hd], [hw, hh, -hd], [hw, hh, hd], [-hw, hh, hd],
      ].map(([cx, cy, cz]) => isoProject(cx, cy, cz));

      ctx.save();
      ctx.translate(size / 2, size / 2);

      // 보이는 3면 (등각 뷰에서)
      const faces = [
        { verts: [4, 5, 6, 7], fill: '#e2e8f0' },  // top
        { verts: [0, 3, 7, 4], fill: '#cbd5e1' },  // left
        { verts: [0, 1, 5, 4], fill: '#b4bfcc' },  // right (어두운 면)
      ];

      for (const face of faces) {
        ctx.beginPath();
        ctx.moveTo(corners[face.verts[0]][0], corners[face.verts[0]][1]);
        for (let i = 1; i < face.verts.length; i++) {
          ctx.lineTo(corners[face.verts[i]][0], corners[face.verts[i]][1]);
        }
        ctx.closePath();
        ctx.fillStyle = face.fill;
        ctx.fill();
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [module]);

  return (
    <canvas
      ref={canvasRef}
      width={size * dpr}
      height={size * dpr}
      className="flex-shrink-0 rounded"
      style={{ width: size, height: size }}
    />
  );
}

function ModuleCard({ module }: { module: ModuleDefinition }) {
  const selectedModuleDefId = useBuilderStore((s) => s.selectedModuleDefId);
  const selectModuleDef = useBuilderStore((s) => s.selectModuleDef);
  const isSelected = selectedModuleDefId === module.id;

  return (
    <button
      onClick={() => selectModuleDef(isSelected ? null : module.id)}
      className={cn(
        'w-full text-left rounded-lg border p-3 transition-all hover:shadow-sm cursor-pointer',
        isSelected
          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
          : 'border-slate-200 bg-white hover:border-slate-300',
      )}
    >
      <div className="flex items-start gap-3">
        <ModuleThumbnail module={module} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-900 truncate">
              {module.nameKo}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {module.width}m x {module.depth}m x {module.height}m
          </div>
          {module.basePrice > 0 && (
            <div className="mt-1 text-xs font-medium text-slate-700">
              {formatWon(module.basePrice)}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

export function ModuleLibrary() {
  const [search, setSearch] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportModels, setExportModels] = useState<{ name: string; commitCount: number }[]>([]);
  const placements = useBuilderStore((s) => s.placements);
  const hasModules = placements.length > 0;

  // Speckle 커스텀 모듈 구독 (등록될 때마다 자동 리렌더)
  const customModules = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // 마운트 시 Speckle 기존 모델 목록 미리 fetch
  useEffect(() => {
    fetch('/api/speckle/export')
      .then((r) => r.json())
      .then((data) => { if (data.models) setExportModels(data.models); })
      .catch(() => {});
  }, []);

  const filterModules = (modules: ModuleDefinition[]) => {
    if (!search.trim()) return modules;
    const q = search.toLowerCase();
    return modules.filter(
      (m) =>
        m.nameKo.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.description?.toLowerCase().includes(q),
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">모듈 라이브러리</h2>
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="모듈 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8 text-sm"
          />
        </div>
      </div>

      <Tabs defaultValue="STRUCTURAL" className="flex flex-1 flex-col overflow-hidden">
        <div className="px-4 pt-2">
          <TabsList className="w-full">
            {CATEGORY_TAB_MAP.map((cat) => (
              <TabsTrigger key={cat.value} value={cat.value} className="flex-1 text-xs">
                {cat.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {CATEGORY_TAB_MAP.map((cat) => {
          const staticModules = filterModules(MODULES_BY_CATEGORY[cat.value]);
          const speckleModules = filterModules(
            customModules.filter((m) => m.category === cat.value),
          );
          const allModules = [...staticModules, ...speckleModules];

          return (
            <TabsContent key={cat.value} value={cat.value} className="flex-1 overflow-hidden">
              <ScrollArea className="h-full px-4 pb-4">
                <div className="space-y-2 pt-2">
                  {allModules.map((mod) => (
                    <ModuleCard key={mod.id} module={mod} />
                  ))}
                  {allModules.length === 0 && (
                    <p className="py-8 text-center text-sm text-slate-400">
                      검색 결과가 없습니다
                    </p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Sticky export button at bottom */}
      {hasModules && (
        <div className="border-t border-slate-200 p-4">
          <Button
            size="sm"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => setExportOpen(true)}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            모듈 내보내기
          </Button>
          <SpeckleExportDialog open={exportOpen} onOpenChange={setExportOpen} prefetchedModels={exportModels} />
        </div>
      )}
    </div>
  );
}
