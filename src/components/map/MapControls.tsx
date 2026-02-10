'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus, Minus, Locate, Layers, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/cn';

interface MapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  showAuctions: boolean;
  onToggleAuctions: (show: boolean) => void;
  filterOpen: boolean;
  onToggleFilter: () => void;
  hasActiveFilters: boolean;
  className?: string;
}

export function MapControls({
  onZoomIn,
  onZoomOut,
  onReset,
  showAuctions,
  onToggleAuctions,
  filterOpen,
  onToggleFilter,
  hasActiveFilters,
  className,
}: MapControlsProps) {
  const [layerOpen, setLayerOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!layerOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setLayerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [layerOpen]);

  return (
    <div className={cn('absolute left-4 top-4 z-20 flex flex-col gap-1', className)}>
      <ControlButton icon={<Plus className="h-4 w-4" />} label="확대" onClick={onZoomIn} />
      <ControlButton icon={<Minus className="h-4 w-4" />} label="축소" onClick={onZoomOut} />
      <div className="my-1" />
      <ControlButton icon={<Locate className="h-4 w-4" />} label="서울 중심" onClick={onReset} />
      <div className="relative" ref={dropdownRef}>
        <ControlButton
          icon={<Layers className="h-4 w-4" />}
          label="레이어"
          onClick={() => setLayerOpen((v) => !v)}
          active={layerOpen}
        />
        {layerOpen && (
          <div className="absolute left-full top-0 ml-2 w-48 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              레이어
            </p>
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={showAuctions}
                onChange={(e) => onToggleAuctions(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-red-500 focus:ring-red-500"
              />
              <span className="text-sm text-slate-700">공매 물건 표시</span>
            </label>
          </div>
        )}
      </div>
      <div className="relative">
        <ControlButton
          icon={<SlidersHorizontal className="h-4 w-4" />}
          label="필터"
          onClick={onToggleFilter}
          active={filterOpen}
        />
        {hasActiveFilters && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 border-2 border-white" />
        )}
      </div>
    </div>
  );
}

function ControlButton({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-lg border shadow-sm transition-colors',
        active
          ? 'border-blue-300 bg-blue-50 text-blue-600'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      )}
    >
      {icon}
    </button>
  );
}
