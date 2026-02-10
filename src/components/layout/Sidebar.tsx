'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

interface SidebarProps {
  children: React.ReactNode;
  side?: 'left' | 'right';
  defaultOpen?: boolean;
  width?: string;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}

export function Sidebar({
  children,
  side = 'left',
  defaultOpen = true,
  width = 'w-80',
  className,
  onOpenChange,
}: SidebarProps) {
  const [open, setOpen] = useState(() => {
    if (onOpenChange) onOpenChange(defaultOpen);
    return defaultOpen;
  });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div
      className={cn(
        'absolute top-0 z-20 h-full bg-white shadow-xl transition-transform duration-300',
        side === 'left'
          ? 'left-0 border-r border-slate-200'
          : 'right-0 border-l border-slate-200',
        width,
        open
          ? 'translate-x-0'
          : side === 'left'
            ? '-translate-x-full'
            : 'translate-x-full',
        className,
      )}
    >
      {/* Toggle button — sits at panel edge, vertically centered */}
      <button
        onClick={toggle}
        className={cn(
          'absolute top-1/2 -translate-y-1/2 z-30 flex h-10 w-5 items-center justify-center border border-slate-200 bg-white/90 backdrop-blur-sm shadow-md hover:bg-slate-50 cursor-pointer transition-colors',
          side === 'left'
            ? '-right-5 rounded-r-md border-l-0'
            : '-left-5 rounded-l-md border-r-0',
        )}
      >
        {side === 'left' ? (
          open ? <ChevronLeft className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
        ) : (
          open ? <ChevronRight className="h-3.5 w-3.5 text-slate-400" /> : <ChevronLeft className="h-3.5 w-3.5 text-slate-400" />
        )}
      </button>

      <div className="h-full overflow-hidden">{children}</div>
    </div>
  );
}
