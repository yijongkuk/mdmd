'use client';

import { useRef, useEffect } from 'react';
import { Eye, EyeOff, Lock, Unlock, ChevronUp, ChevronDown, Layers } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useBuilderStore } from '@/features/builder/store';
import { getFloorLabel } from '@/lib/constants/grid';

/** 패널에 스크롤 없이 보여줄 최대 층 수 */
const VISIBLE_FLOOR_LIMIT = 7;

export function FloorNavigator() {
  const currentFloor = useBuilderStore((s) => s.currentFloor);
  const setCurrentFloor = useBuilderStore((s) => s.setCurrentFloor);
  const visibleFloors = useBuilderStore((s) => s.visibleFloors);
  const toggleFloorVisibility = useBuilderStore((s) => s.toggleFloorVisibility);
  const placements = useBuilderStore((s) => s.placements);
  const viewAllFloors = useBuilderStore((s) => s.viewAllFloors);
  const toggleViewAllFloors = useBuilderStore((s) => s.toggleViewAllFloors);
  const gridLocked = useBuilderStore((s) => s.gridLocked);
  const toggleGridLock = useBuilderStore((s) => s.toggleGridLock);
  const maxFloors = useBuilderStore((s) => s.maxFloors);

  const scrollRef = useRef<HTMLDivElement>(null);
  const needsScroll = maxFloors > VISIBLE_FLOOR_LIMIT;

  // 높은 층이 위에 오도록 역순
  const floors = Array.from({ length: maxFloors }, (_, i) => maxFloors - i);

  const getFloorModuleCount = (floor: number) =>
    placements.filter((p) => p.floor === floor).length;

  // 현재 층이 바뀌면 스크롤 영역 내에서 보이도록
  useEffect(() => {
    if (!needsScroll || !scrollRef.current) return;
    const idx = maxFloors - currentFloor; // 배열 인덱스 (역순)
    const itemHeight = 36; // h-8 (32px) + gap-1 (4px)
    const scrollTop = idx * itemHeight - scrollRef.current.clientHeight / 2 + itemHeight / 2;
    scrollRef.current.scrollTo({ top: Math.max(0, scrollTop), behavior: 'smooth' });
  }, [currentFloor, needsScroll, maxFloors]);

  const scrollBy = (delta: number) => {
    scrollRef.current?.scrollBy({ top: delta, behavior: 'smooth' });
  };

  return (
    <div className="flex flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* 전체 층 보기 버튼 */}
      <div className="p-1.5 pb-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={viewAllFloors ? 'default' : 'ghost'}
              size="sm"
              className="h-8 w-full text-xs font-medium gap-1.5"
              onClick={toggleViewAllFloors}
            >
              <Layers className="h-3 w-3" />
              전체
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            전체 층 보기/편집 (A)
          </TooltipContent>
        </Tooltip>
      </div>

      {/* 스크롤 위 화살표 */}
      {needsScroll && (
        <button
          className="flex items-center justify-center py-1 text-slate-400 hover:text-slate-600 border-b border-slate-100"
          onClick={() => scrollBy(-100)}
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
      )}

      {/* 층 목록 */}
      <div
        ref={scrollRef}
        className="flex flex-col gap-1 p-1.5 overflow-y-auto"
        style={needsScroll ? {
          maxHeight: `${VISIBLE_FLOOR_LIMIT * 36}px`,
          scrollbarWidth: 'none',
        } : undefined}
      >
        {floors.map((floor) => {
          const isCurrent = !viewAllFloors && floor === currentFloor;
          const isVisible = visibleFloors.includes(floor);
          const count = getFloorModuleCount(floor);

          return (
            <div key={floor} className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={isCurrent ? 'default' : 'ghost'}
                    size="sm"
                    className={cn(
                      'h-8 w-12 text-xs font-medium',
                      !isCurrent && !isVisible && 'opacity-40',
                      viewAllFloors && 'opacity-60',
                    )}
                    onClick={() => setCurrentFloor(floor)}
                  >
                    {getFloorLabel(floor)}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {getFloorLabel(floor)} ({count}개 모듈)
                </TooltipContent>
              </Tooltip>

              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => toggleFloorVisibility(floor)}
              >
                {isVisible ? (
                  <Eye className="h-3 w-3 text-slate-500" />
                ) : (
                  <EyeOff className="h-3 w-3 text-slate-300" />
                )}
              </Button>
            </div>
          );
        })}
      </div>

      {/* 스크롤 아래 화살표 */}
      {needsScroll && (
        <button
          className="flex items-center justify-center py-1 text-slate-400 hover:text-slate-600 border-t border-slate-100"
          onClick={() => scrollBy(100)}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Grid lock toggle */}
      <div className="border-t border-slate-200 p-1.5 pt-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 w-full text-xs gap-1.5',
                !gridLocked && 'bg-amber-50 text-amber-700 hover:bg-amber-100',
              )}
              onClick={toggleGridLock}
            >
              {gridLocked ? (
                <Lock className="h-3 w-3" />
              ) : (
                <Unlock className="h-3 w-3" />
              )}
              {gridLocked ? '그리드 잠금' : '그리드 이동'}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            {gridLocked ? '클릭하면 그리드를 드래그로 이동할 수 있습니다' : '그리드 이동 중 (클릭하여 잠금)'}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
