'use client';

import { useEffect } from 'react';
import {
  MousePointer2,
  Plus,
  Undo2,
  Redo2,
  Building2,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import { useBuilderStore } from '@/features/builder/store';
import { BuilderTool } from '@/types/builder';

const TOOLS: { id: BuilderTool; label: string; icon: typeof MousePointer2; shortcut?: string }[] = [
  { id: 'select', label: '선택', icon: MousePointer2, shortcut: 'V' },
  { id: 'place', label: '배치', icon: Plus, shortcut: 'P' },
];

export function BuilderToolbar() {
  const activeTool = useBuilderStore((s) => s.activeTool);
  const setActiveTool = useBuilderStore((s) => s.setActiveTool);
  const undo = useBuilderStore((s) => s.undo);
  const redo = useBuilderStore((s) => s.redo);
  const undoStack = useBuilderStore((s) => s.undoStack);
  const redoStack = useBuilderStore((s) => s.redoStack);
  const selectedPlacementIds = useBuilderStore((s) => s.selectedPlacementIds);
  const rotatePlacement = useBuilderStore((s) => s.rotatePlacement);
  const showSurrounding = useBuilderStore((s) => s.showSurrounding);
  const toggleSurrounding = useBuilderStore((s) => s.toggleSurrounding);
  const copyPlacements = useBuilderStore((s) => s.copyPlacements);
  const pastePlacements = useBuilderStore((s) => s.pastePlacements);
  const removePlacement = useBuilderStore((s) => s.removePlacement);
  const selectPlacement = useBuilderStore((s) => s.selectPlacement);
  const showToast = useBuilderStore((s) => s.showToast);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in input elements
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Z') {
        e.preventDefault();
        redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        if (selectedPlacementIds.length > 0) {
          copyPlacements();
          showToast(`${selectedPlacementIds.length}개 모듈 복사됨`, 'info');
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        pastePlacements();
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'v':
          setActiveTool('select');
          break;
        case 'p':
          setActiveTool('place');
          break;
        case 'r':
          // When in place mode, R is handled by GhostModule for ghost rotation
          if (activeTool === 'place') break;
          if (selectedPlacementIds.length > 0) {
            selectedPlacementIds.forEach((id) => rotatePlacement(id));
          }
          break;
        case 'x':
        case 'delete':
          if (selectedPlacementIds.length > 0) {
            selectedPlacementIds.forEach((id) => removePlacement(id));
            selectPlacement(null);
          }
          break;
        case 'escape':
          selectPlacement(null);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, setActiveTool, undo, redo, selectedPlacementIds, rotatePlacement, copyPlacements, pastePlacements, removePlacement, selectPlacement, showToast]);

  return (
    <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-sm">
      {TOOLS.map((tool) => (
        <Tooltip key={tool.id}>
          <TooltipTrigger asChild>
            <Button
              variant={activeTool === tool.id ? 'default' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => setActiveTool(tool.id)}
            >
              <tool.icon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {tool.label} {tool.shortcut && <span className="ml-1 text-xs text-slate-400">({tool.shortcut})</span>}
          </TooltipContent>
        </Tooltip>
      ))}

      <Separator orientation="vertical" className="mx-1 h-6" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={undo}
            disabled={undoStack.length === 0}
          >
            <Undo2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          실행취소 <span className="ml-1 text-xs text-slate-400">(Ctrl+Z)</span>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={redo}
            disabled={redoStack.length === 0}
          >
            <Redo2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          다시실행 <span className="ml-1 text-xs text-slate-400">(Ctrl+Shift+Z)</span>
        </TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={showSurrounding ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={toggleSurrounding}
          >
            <Building2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          주변 건물 {showSurrounding ? '숨기기' : '보기'}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
