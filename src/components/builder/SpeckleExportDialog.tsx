'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, ExternalLink, RotateCcw, Upload } from 'lucide-react';
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
  SpeckleExportModule,
  SpeckleExportResponse,
} from '@/types/speckle';

type Phase = 'name-input' | 'ready' | 'exporting' | 'success' | 'error';

interface ExistingModel {
  name: string;
  commitCount: number;
}

interface SpeckleExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefetchedModels?: ExistingModel[];
}

export function SpeckleExportDialog({ open, onOpenChange, prefetchedModels }: SpeckleExportDialogProps) {
  const placements = useBuilderStore((s) => s.placements);
  const gridOffset = useBuilderStore((s) => s.gridOffset);
  const projectName = useBuilderStore((s) => s.projectName);
  const projectId = useBuilderStore((s) => s.projectId);

  const [phase, setPhase] = useState<Phase>('ready');
  const [username, setUsername] = useState('');
  const [branchName, setBranchName] = useState('');
  const [existingModels, setExistingModels] = useState<ExistingModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SpeckleExportResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initDone = useRef(false);

  const moduleCount = placements.length;

  const prepareModules = useCallback((): SpeckleExportModule[] => {
    const result: SpeckleExportModule[] = [];
    for (const placement of placements) {
      const mod = getModuleById(placement.moduleId);
      if (!mod) continue;

      const worldX = placement.gridX * GRID_SIZE + (gridOffset?.x ?? 0);
      const worldY = (placement.floor - 1) * FLOOR_HEIGHT;
      const worldZ = placement.gridZ * GRID_SIZE + (gridOffset?.z ?? 0);

      const mat = placement.materialId ? getMaterialById(placement.materialId) : undefined;
      const color = placement.customColor ?? mat?.color ?? mod.color;

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
  }, [placements, gridOffset]);

  /** 브랜치명 생성: localStorage 캐시 or 새로 생성 */
  const makeBranchName = useCallback((user: string): string => {
    if (projectId) {
      const cached = localStorage.getItem(`speckle_branch_${projectId}`);
      if (cached) return cached;
    }
    const idSuffix = projectId ? `_${projectId.slice(0, 8)}` : '';
    return `${user}_${projectName}${idSuffix}`;
  }, [projectId, projectName]);

  /** 기존 모델 목록 fetch */
  const fetchModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const res = await fetch('/api/speckle/export');
      const data = await res.json();
      if (data.models) {
        setExistingModels(data.models);
      }
    } catch {
      setExistingModels([]);
    } finally {
      setLoadingModels(false);
    }
  }, []);

  const doExport = useCallback(async () => {
    setPhase('exporting');
    setError('');
    setResult(null);

    try {
      const modules = prepareModules();

      if (modules.length === 0) {
        throw new Error('내보낼 모듈이 없습니다');
      }

      // 브랜치명 캐싱
      if (projectId) {
        localStorage.setItem(`speckle_branch_${projectId}`, branchName);
      }

      const res = await fetch('/api/speckle/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchName,
          message: `${projectName}: ${modules.length}개 모듈`,
          modules,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Export failed: ${res.status}`);
      }

      setResult(data as SpeckleExportResponse);
      setPhase('success');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setPhase('error');
    }
  }, [branchName, prepareModules, projectName, projectId]);

  // 다이얼로그 열릴 때 초기화
  useEffect(() => {
    if (!open) {
      initDone.current = false;
      return;
    }
    if (initDone.current) return;
    initDone.current = true;

    setResult(null);
    setError('');
    if (prefetchedModels && prefetchedModels.length > 0) {
      setExistingModels(prefetchedModels);
    } else {
      fetchModels();
    }

    const savedUsername = localStorage.getItem('speckle_username');
    if (savedUsername) {
      setUsername(savedUsername);
      setBranchName(makeBranchName(savedUsername));
      setPhase('ready');
    } else {
      setUsername('');
      setBranchName('');
      setPhase('name-input');
    }
  }, [open, makeBranchName, fetchModels]);

  // name-input 시 포커스
  useEffect(() => {
    if (phase === 'name-input') {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [phase]);

  const handleNameSubmit = () => {
    const trimmed = username.trim();
    if (!trimmed) return;
    localStorage.setItem('speckle_username', trimmed);
    setBranchName(makeBranchName(trimmed));
    setPhase('ready');
  };

  const isExisting = existingModels.some((m) => m.name === branchName);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>모듈 내보내기</DialogTitle>
          <DialogDescription>
            {moduleCount}개 모듈을 Speckle에 업로드합니다.
          </DialogDescription>
        </DialogHeader>

        {/* Phase: name-input */}
        {phase === 'name-input' && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">사용자 이름</label>
              <input
                ref={inputRef}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="이름을 입력하세요"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleNameSubmit(); }}
              />
              <p className="text-xs text-slate-400">
                Speckle 모델에 표시될 이름입니다. (최초 1회)
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                취소
              </Button>
              <Button onClick={handleNameSubmit} disabled={!username.trim()}>
                다음
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Phase: ready — 모델명 확인/수정 후 내보내기 */}
        {phase === 'ready' && (
          <div className="space-y-4 py-2">
            {/* 기존 모델 드롭다운 */}
            {existingModels.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">기존 모델</label>
                {loadingModels ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> 불러오는 중...
                  </div>
                ) : (
                  <select
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={existingModels.some((m) => m.name === branchName) ? branchName : ''}
                    onChange={(e) => {
                      if (e.target.value) setBranchName(e.target.value);
                    }}
                  >
                    <option value="">새 모델로 내보내기</option>
                    {existingModels.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name} ({m.commitCount}개 버전)
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* 모델 이름 입력 */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">모델 이름</label>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && branchName.trim()) doExport(); }}
              />
              <p className="text-xs text-slate-400">
                {isExisting
                  ? '기존 모델에 새 버전으로 업데이트됩니다.'
                  : '새 모델이 생성됩니다.'}
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                취소
              </Button>
              <Button
                onClick={doExport}
                disabled={!branchName.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                내보내기
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Phase: exporting */}
        {phase === 'exporting' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="text-sm text-slate-600">내보내는 중...</p>
          </div>
        )}

        {/* Phase: success */}
        {phase === 'success' && result && (
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
        )}

        {/* Phase: error */}
        {phase === 'error' && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                닫기
              </Button>
              <Button onClick={() => setPhase('ready')}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                재시도
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
