'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { RotateCw, Trash2, Box, Layers, Save, Check, Loader2, AlertCircle, Pencil, Upload, Mountain } from 'lucide-react';
import { SpeckleExportDialog } from './SpeckleExportDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useBuilderStore } from '@/features/builder/store';
import { getModuleById } from '@/lib/constants/modules';
import { getMaterialById } from '@/lib/constants/materials';
import { MODULE_CATEGORY_LABELS } from '@/types/builder';
import { FLOOR_LABELS } from '@/lib/constants/grid';
import { formatWon } from '@/lib/utils/format';
import { MaterialPicker } from './MaterialPicker';
import { cn } from '@/lib/cn';
import type { SoilInfo } from '@/types/soil';

function FloorAreaTable() {
  const floorAreas = useBuilderStore((s) => s.floorAreas);

  if (floorAreas.length === 0) return null;

  const totalArea = floorAreas.reduce((sum, f) => sum + f.area, 0);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5">
        <Layers className="h-3.5 w-3.5 text-blue-500" />
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
          층별 건축가능 면적
        </h3>
      </div>
      <div className="rounded-lg border border-slate-100 bg-slate-50 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100/60">
              <th className="py-1.5 pl-3 pr-2 text-left font-medium text-slate-500">층</th>
              <th className="py-1.5 px-2 text-right font-medium text-slate-500">가로</th>
              <th className="py-1.5 px-2 text-right font-medium text-slate-500">세로</th>
              <th className="py-1.5 pl-2 pr-3 text-right font-medium text-slate-500">면적</th>
            </tr>
          </thead>
          <tbody>
            {floorAreas.map((f) => (
              <tr key={f.floor} className="border-b border-slate-100 last:border-b-0">
                <td className="py-1.5 pl-3 pr-2 text-slate-700 font-medium">{f.floor}층</td>
                <td className="py-1.5 px-2 text-right text-slate-600">{f.width.toFixed(1)}m</td>
                <td className="py-1.5 px-2 text-right text-slate-600">{f.depth.toFixed(1)}m</td>
                <td className="py-1.5 pl-2 pr-3 text-right text-slate-700 font-medium">{f.area.toFixed(1)}㎡</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-blue-50/80 border-t border-blue-100">
              <td colSpan={3} className="py-2 pl-3 pr-2 text-slate-700 font-semibold">합계 (연면적)</td>
              <td className="py-2 pl-2 pr-3 text-right text-blue-700 font-bold">{totalArea.toFixed(1)}㎡</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

interface ProjectSummaryProps {
  onSave?: () => void;
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error';
  lastSavedAt?: string | null;
  onRename?: (name: string) => void;
  parcelPnu?: string | null;
}

function ProjectSummary({ onSave, saveStatus = 'idle', lastSavedAt, onRename, parcelPnu }: ProjectSummaryProps) {
  const placements = useBuilderStore((s) => s.placements);
  const projectName = useBuilderStore((s) => s.projectName);
  const setProjectName = useBuilderStore((s) => s.setProjectName);

  // Soil info fetch
  const [soilInfo, setSoilInfo] = useState<SoilInfo | null>(null);
  const [soilLoading, setSoilLoading] = useState(false);

  useEffect(() => {
    setSoilInfo(null);
    if (!parcelPnu || parcelPnu.length < 19) return;

    let cancelled = false;
    setSoilLoading(true);
    fetch(`/api/land/soil?pnu=${parcelPnu}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setSoilInfo(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSoilLoading(false);
      });
    return () => { cancelled = true; };
  }, [parcelPnu]);

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(projectName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(projectName);
  }, [projectName]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== projectName) {
      setProjectName(trimmed);
      onRename?.(trimmed);
    }
    setEditing(false);
  }, [editValue, projectName, setProjectName, onRename]);

  const totalModules = placements.length;
  const totalArea = placements.reduce((sum, p) => {
    const mod = getModuleById(p.moduleId);
    if (!mod) return sum;
    return sum + mod.width * mod.depth;
  }, 0);
  const totalCost = placements.reduce((sum, p) => {
    const mod = getModuleById(p.moduleId);
    if (!mod) return sum;
    const mat = p.materialId ? getMaterialById(p.materialId) : undefined;
    const multiplier = mat?.priceMultiplier ?? 1;
    return sum + mod.basePrice * multiplier;
  }, 0);
  const floorSet = new Set(placements.map((p) => p.floor));

  return (
    <div className="space-y-4 p-4">
      {/* 프로젝트 이름 */}
      <div className="flex items-start gap-1.5">
        {editing ? (
          <input
            ref={inputRef}
            className="flex-1 rounded border border-blue-300 px-2 py-1 text-sm font-semibold text-slate-900 outline-none focus:ring-1 focus:ring-blue-400"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setEditValue(projectName); setEditing(false); }
            }}
          />
        ) : (
          <>
            <h2 className="flex-1 text-sm font-semibold text-slate-900 leading-snug break-all">
              {projectName}
            </h2>
            <button
              className="mt-0.5 shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      <Separator />
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">프로젝트 요약</h3>
      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">총 모듈</span>
          <span className="font-medium text-slate-900">{totalModules}개</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">사용 층수</span>
          <span className="font-medium text-slate-900">{floorSet.size}개 층</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">총 면적</span>
          <span className="font-medium text-slate-900">{totalArea.toFixed(1)}m²</span>
        </div>
        <Separator />
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">총 비용</span>
          <span className="font-semibold text-slate-900">{formatWon(totalCost)}</span>
        </div>
      </div>

      {/* Save button + status */}
      <Separator />
      <div className="space-y-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onSave}
          disabled={saveStatus === 'saving'}
        >
          {saveStatus === 'saving' ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : saveStatus === 'saved' ? (
            <Check className="mr-1.5 h-3.5 w-3.5 text-green-600" />
          ) : saveStatus === 'error' ? (
            <AlertCircle className="mr-1.5 h-3.5 w-3.5 text-red-500" />
          ) : (
            <Save className="mr-1.5 h-3.5 w-3.5" />
          )}
          {saveStatus === 'saving'
            ? '저장 중...'
            : saveStatus === 'saved'
              ? '저장 완료'
              : saveStatus === 'error'
                ? '저장 실패 (재시도)'
                : '프로젝트 저장'}
        </Button>
        {lastSavedAt && (
          <p className="text-center text-xs text-slate-400">
            마지막 저장: {lastSavedAt}
          </p>
        )}
      </div>

      {/* 층별 건축가능 면적 테이블 */}
      <Separator />
      <FloorAreaTable />

      {/* 토양 정보 */}
      {parcelPnu && parcelPnu.length >= 19 && (
        <>
          <Separator />
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5">
              <Mountain className="h-3.5 w-3.5 text-amber-500" />
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                토양 정보
              </h3>
              {soilInfo?.difficultyLevel && (
                <span className={cn(
                  'ml-auto text-[11px] font-medium px-1.5 py-0.5 rounded',
                  soilInfo.difficultyLevel === 'good' && 'bg-green-100 text-green-700',
                  soilInfo.difficultyLevel === 'moderate' && 'bg-yellow-100 text-yellow-700',
                  soilInfo.difficultyLevel === 'difficult' && 'bg-red-100 text-red-700',
                )}>
                  기초공사 {soilInfo.difficultyLabel}
                </span>
              )}
            </div>
            <div className="rounded-lg border border-slate-100 bg-amber-50/40 p-3">
              {soilLoading ? (
                <div className="flex items-center gap-2 py-2">
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-amber-600" />
                  <span className="text-xs text-slate-500">토양 정보 조회 중...</span>
                </div>
              ) : soilInfo?.characteristics ? (
                <div className="space-y-2.5">
                  {/* 표토/심토 비교 */}
                  {(soilInfo.characteristics.soilTextureName || soilInfo.profile?.deepSoilTextureName ||
                    soilInfo.characteristics.surfaceGravelName || soilInfo.profile?.deepSoilGravelName) && (
                    <div>
                      <p className="text-[10px] text-slate-400 mb-1.5">표토 / 심토 비교</p>
                      <div className="space-y-1">
                        {(soilInfo.characteristics.soilTextureName || soilInfo.profile?.deepSoilTextureName) && (
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-slate-500">토성</span>
                            <span className="text-xs font-medium text-slate-700">
                              {soilInfo.characteristics.soilTextureName ?? '-'} / {soilInfo.profile?.deepSoilTextureName ?? '-'}
                            </span>
                          </div>
                        )}
                        {(soilInfo.characteristics.surfaceGravelName || soilInfo.profile?.deepSoilGravelName) && (
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-slate-500">자갈함량</span>
                            <span className="text-xs font-medium text-slate-700">
                              {soilInfo.characteristics.surfaceGravelName ?? '-'} / {soilInfo.profile?.deepSoilGravelName ?? '-'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {/* 지반 특성 */}
                  <div className="pt-1.5 border-t border-amber-100/60">
                    <p className="text-[10px] text-slate-400 mb-1.5">지반 특성</p>
                    <div className="space-y-1">
                      {soilInfo.characteristics.soilDepthName && (
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-500">유효토심</span>
                          <span className="text-xs font-medium text-slate-700">{soilInfo.characteristics.soilDepthName}</span>
                        </div>
                      )}
                      {soilInfo.characteristics.parentRockName && (
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-500">모암</span>
                          <span className="text-xs font-medium text-slate-700">{soilInfo.characteristics.parentRockName}</span>
                        </div>
                      )}
                      {soilInfo.characteristics.drainageName && (
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-500">배수등급</span>
                          <span className="text-xs font-medium text-slate-700">{soilInfo.characteristics.drainageName}</span>
                        </div>
                      )}
                      {soilInfo.characteristics.structureName && (
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-500">토양구조</span>
                          <span className="text-xs font-medium text-slate-700">{soilInfo.characteristics.structureName}</span>
                        </div>
                      )}
                      {soilInfo.profile?.slopeName && (
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-500">경사도</span>
                          <span className="text-xs font-medium text-slate-700">{soilInfo.profile.slopeName}</span>
                        </div>
                      )}
                      {soilInfo.characteristics.erosionName && (
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-500">침식등급</span>
                          <span className="text-xs font-medium text-slate-700">{soilInfo.characteristics.erosionName}</span>
                        </div>
                      )}
                      {soilInfo.characteristics.terrainName && (
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-500">분포지형</span>
                          <span className="text-xs font-medium text-slate-700">{soilInfo.characteristics.terrainName}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : soilInfo ? (
                <p className="text-xs text-slate-400 py-1">
                  이 필지의 토양 정보가 없습니다
                </p>
              ) : (
                <p className="text-xs text-slate-400 py-1">
                  토양 정보를 조회할 수 없습니다
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {totalModules === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 py-8 text-center">
          <Box className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">
            모듈을 배치해주세요
          </p>
          <p className="mt-1 text-xs text-slate-400">
            왼쪽 라이브러리에서 모듈을 선택하세요
          </p>
        </div>
      )}
    </div>
  );
}

function SelectedModulePanel() {
  const selectedPlacementIds = useBuilderStore((s) => s.selectedPlacementIds);
  const placements = useBuilderStore((s) => s.placements);
  const rotatePlacement = useBuilderStore((s) => s.rotatePlacement);
  const removePlacement = useBuilderStore((s) => s.removePlacement);
  const selectPlacement = useBuilderStore((s) => s.selectPlacement);

  // Show first selected module's details
  const placement = placements.find((p) => p.id === selectedPlacementIds[0]);
  if (!placement) return null;

  const mod = getModuleById(placement.moduleId);
  if (!mod) return null;

  const mat = placement.materialId ? getMaterialById(placement.materialId) : undefined;
  const multiplier = mat?.priceMultiplier ?? 1;
  const moduleCost = mod.basePrice * multiplier;

  return (
    <div className="space-y-4 p-4">
      {/* Module name and category */}
      <div>
        <div className="flex items-center gap-2">
          <div
            className="h-4 w-4 rounded"
            style={{ backgroundColor: placement.customColor ?? mat?.color ?? mod.color }}
          />
          <h2 className="text-sm font-semibold text-slate-900">{mod.nameKo}</h2>
        </div>
        <Badge variant="secondary" className="mt-1.5">
          {MODULE_CATEGORY_LABELS[mod.category]}
        </Badge>
      </div>

      <Separator />

      {/* Dimensions */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">치수</h3>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md bg-slate-50 px-2 py-1.5">
            <div className="text-xs text-slate-400">W</div>
            <div className="text-sm font-medium">{mod.width}m</div>
          </div>
          <div className="rounded-md bg-slate-50 px-2 py-1.5">
            <div className="text-xs text-slate-400">D</div>
            <div className="text-sm font-medium">{mod.depth}m</div>
          </div>
          <div className="rounded-md bg-slate-50 px-2 py-1.5">
            <div className="text-xs text-slate-400">H</div>
            <div className="text-sm font-medium">{mod.height}m</div>
          </div>
        </div>
      </div>

      <Separator />

      {/* Position */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">위치</h3>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">그리드 X</span>
            <span className="font-medium">{Number.isInteger(placement.gridX) ? placement.gridX : placement.gridX.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">그리드 Z</span>
            <span className="font-medium">{Number.isInteger(placement.gridZ) ? placement.gridZ : placement.gridZ.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">층</span>
            <span className="font-medium">{FLOOR_LABELS[placement.floor]}</span>
          </div>
        </div>
      </div>

      <Separator />

      {/* Rotation */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">회전</h3>
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-600">{placement.rotation}°</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => rotatePlacement(placement.id)}
            className="h-8"
          >
            <RotateCw className="mr-1.5 h-3.5 w-3.5" />
            15° 회전
          </Button>
        </div>
      </div>

      <Separator />

      {/* Material */}
      <MaterialPicker />

      <Separator />

      {/* Cost */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">비용</h3>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">기본가</span>
            <span>{formatWon(mod.basePrice)}</span>
          </div>
          {mat && (
            <div className="flex justify-between">
              <span className="text-slate-500">재질 배율</span>
              <span>x{mat.priceMultiplier}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between font-medium">
            <span className="text-slate-700">합계</span>
            <span className="text-slate-900">{formatWon(moduleCost)}</span>
          </div>
        </div>
      </div>

      <Separator />

      {/* Delete */}
      <Button
        variant="destructive"
        size="sm"
        className="w-full"
        onClick={() => {
          selectedPlacementIds.forEach((id) => removePlacement(id));
          selectPlacement(null);
        }}
      >
        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
        {selectedPlacementIds.length > 1 ? `${selectedPlacementIds.length}개 모듈 삭제` : '모듈 삭제'}
      </Button>
    </div>
  );
}

interface PropertyPanelProps {
  onSave?: () => void;
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error';
  lastSavedAt?: string | null;
  onRename?: (name: string) => void;
  parcelPnu?: string | null;
}

export function PropertyPanel({ onSave, saveStatus, lastSavedAt, onRename, parcelPnu }: PropertyPanelProps) {
  const selectedPlacementIds = useBuilderStore((s) => s.selectedPlacementIds);
  const placements = useBuilderStore((s) => s.placements);
  const hasSelection = selectedPlacementIds.length > 0;
  const hasModules = placements.length > 0;
  const [exportOpen, setExportOpen] = useState(false);
  const [exportModels, setExportModels] = useState<{ name: string; commitCount: number }[]>([]);

  // 마운트 시 Speckle 기존 모델 목록 미리 fetch
  useEffect(() => {
    fetch('/api/speckle/export')
      .then((r) => r.json())
      .then((data) => { if (data.models) setExportModels(data.models); })
      .catch(() => {});
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">
          {hasSelection
            ? selectedPlacementIds.length > 1
              ? `${selectedPlacementIds.length}개 모듈 선택`
              : '모듈 속성'
            : '속성 패널'}
        </h2>
      </div>
      <ScrollArea className="flex-1">
        {hasSelection ? (
          <SelectedModulePanel />
        ) : (
          <ProjectSummary onSave={onSave} saveStatus={saveStatus} lastSavedAt={lastSavedAt} onRename={onRename} parcelPnu={parcelPnu} />
        )}
      </ScrollArea>
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
