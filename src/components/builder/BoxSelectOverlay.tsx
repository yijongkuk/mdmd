'use client';

import { useBuilderStore } from '@/features/builder/store';

export function BoxSelectOverlay() {
  const rect = useBuilderStore((s) => s.boxSelectRect);
  const draggingId = useBuilderStore((s) => s.draggingPlacementId);

  // 모듈 드래그 이동 중에는 박스 선택 사각형 숨김
  if (!rect || draggingId) return null;

  // Window (L→R): solid blue, Crossing (R→L): dashed green
  const borderStyle = rect.crossing ? 'border-dashed border-green-500' : 'border-solid border-blue-500';
  const bgStyle = rect.crossing ? 'bg-green-500/10' : 'bg-blue-500/10';

  return (
    <div
      className={`pointer-events-none absolute z-40 border-2 ${borderStyle} ${bgStyle}`}
      style={{
        left: rect.x1,
        top: rect.y1,
        width: rect.x2 - rect.x1,
        height: rect.y2 - rect.y1,
      }}
    />
  );
}
