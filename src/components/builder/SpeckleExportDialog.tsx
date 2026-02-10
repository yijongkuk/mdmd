'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, ExternalLink, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useBuilderStore } from '@/features/builder/store';
import { getModuleById } from '@/lib/constants/modules';
import { getMaterialById } from '@/lib/constants/materials';
import { getMeshData, isCustomModule } from '@/lib/speckle/customModules';
import { GRID_SIZE, FLOOR_HEIGHT } from '@/lib/constants/grid';
import type {
  SpeckleProject,
  SpeckleModel,
  SpeckleExportModule,
  SpeckleExportResponse,
} from '@/types/speckle';

type ExportStatus = 'idle' | 'exporting' | 'success' | 'error';

interface SpeckleExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SpeckleExportDialog({ open, onOpenChange }: SpeckleExportDialogProps) {
  const selectedPlacementIds = useBuilderStore((s) => s.selectedPlacementIds);
  const placements = useBuilderStore((s) => s.placements);
  const gridOffset = useBuilderStore((s) => s.gridOffset);

  const [projects, setProjects] = useState<SpeckleProject[]>([]);
  const [branches, setBranches] = useState<SpeckleModel[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<SpeckleExportResponse | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);

  const moduleCount = selectedPlacementIds.length;

  // 다이얼로그 열릴 때 프로젝트 목록 fetch
  useEffect(() => {
    if (!open) return;
    setStatus('idle');
    setError('');
    setResult(null);
    setCommitMessage(`MDMD Builder: ${moduleCount}개 모듈 내보내기`);

    setLoadingProjects(true);
    fetch('/api/speckle')
      .then((r) => r.json())
      .then((data) => {
        if (data.projects) {
          setProjects(data.projects);
        }
      })
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
  }, [open, moduleCount]);

  // 프로젝트 선택 시 브랜치 목록 fetch
  useEffect(() => {
    if (!selectedProject) {
      setBranches([]);
      return;
    }
    setLoadingBranches(true);
    setSelectedBranch('');
    setNewBranchName('');

    fetch(`/api/speckle/models/${selectedProject}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.models) {
          setBranches(data.models);
          // 기본값: main
          const main = data.models.find((m: SpeckleModel) => m.name === 'main');
          if (main) setSelectedBranch('main');
        }
      })
      .catch(() => setBranches([]))
      .finally(() => setLoadingBranches(false));
  }, [selectedProject]);

  const branchName = selectedBranch === '__new__' ? newBranchName.trim() : selectedBranch;

  const prepareModules = useCallback((): SpeckleExportModule[] => {
    const result: SpeckleExportModule[] = [];
    for (const pid of selectedPlacementIds) {
      const placement = placements.find((p) => p.id === pid);
      if (!placement) continue;
      const mod = getModuleById(placement.moduleId);
      if (!mod) continue;

      // World position (min corner, Y-up)
      const worldX = placement.gridX * GRID_SIZE + (gridOffset?.x ?? 0);
      const worldY = (placement.floor - 1) * FLOOR_HEIGHT;
      const worldZ = placement.gridZ * GRID_SIZE + (gridOffset?.z ?? 0);

      // 색상: customColor > material > module default
      const mat = placement.materialId ? getMaterialById(placement.materialId) : undefined;
      const color = placement.customColor ?? mat?.color ?? mod.color;

      // Speckle 커스텀 모듈이면 meshData 포함
      const meshData = isCustomModule(placement.moduleId)
        ? getMeshData(placement.moduleId) ?? undefined
        : undefined;

      result.push({
        name: mod.nameKo || mod.name,
        position: [worldX, worldY, worldZ],
        rotation: placement.rotation,
        dimensions: [mod.width, mod.height, mod.depth],
        color,
        meshData,
      });
    }
    return result;
  }, [selectedPlacementIds, placements, gridOffset]);

  const handleExport = async () => {
    if (!selectedProject || !branchName) return;

    setStatus('exporting');
    setError('');

    try {
      const modules = prepareModules();
      const res = await fetch('/api/speckle/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          streamId: selectedProject,
          branchName,
          message: commitMessage || `MDMD Builder: ${moduleCount}개 모듈 내보내기`,
          modules,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Export failed: ${res.status}`);
      }

      setResult(data as SpeckleExportResponse);
      setStatus('success');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Speckle로 내보내기</DialogTitle>
          <DialogDescription>
            선택한 {moduleCount}개 모듈을 Speckle에 업로드합니다.
          </DialogDescription>
        </DialogHeader>

        {status === 'success' && result ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
              <p className="text-sm font-medium text-green-800">내보내기 완료!</p>
              <a
                href={result.commitUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
              >
                Speckle에서 보기 <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                닫기
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* 프로젝트 선택 */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">프로젝트 (스트림)</label>
              {loadingProjects ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> 불러오는 중...
                </div>
              ) : (
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                >
                  <option value="">프로젝트 선택...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* 브랜치 선택 */}
            {selectedProject && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">브랜치</label>
                {loadingBranches ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> 불러오는 중...
                  </div>
                ) : (
                  <>
                    <select
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      value={selectedBranch}
                      onChange={(e) => setSelectedBranch(e.target.value)}
                    >
                      <option value="">브랜치 선택...</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.name}>{b.name}</option>
                      ))}
                      <option value="__new__">+ 새 브랜치 만들기</option>
                    </select>
                    {selectedBranch === '__new__' && (
                      <input
                        className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        placeholder="브랜치 이름 입력..."
                        value={newBranchName}
                        onChange={(e) => setNewBranchName(e.target.value)}
                      />
                    )}
                  </>
                )}
              </div>
            )}

            {/* 커밋 메시지 */}
            {selectedProject && branchName && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">커밋 메시지</label>
                <input
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                />
              </div>
            )}

            {/* 에러 표시 */}
            {status === 'error' && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                취소
              </Button>
              <Button
                onClick={handleExport}
                disabled={!selectedProject || !branchName || status === 'exporting'}
              >
                {status === 'exporting' ? (
                  <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> 내보내는 중...</>
                ) : (
                  <><Upload className="mr-1.5 h-3.5 w-3.5" /> 내보내기</>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
