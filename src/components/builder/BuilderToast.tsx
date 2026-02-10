'use client';

import { useBuilderStore } from '@/features/builder/store';

export function BuilderToast() {
  const toastMessage = useBuilderStore((s) => s.toastMessage);
  const toastType = useBuilderStore((s) => s.toastType);

  if (!toastMessage) return null;

  const bg = toastType === 'error' ? 'bg-red-600/90' : 'bg-blue-600/90';

  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center">
      <div className={`rounded-lg ${bg} px-5 py-3 text-sm font-medium text-white shadow-lg backdrop-blur-sm`}>
        {toastMessage}
      </div>
    </div>
  );
}
