'use client';

import { useState, useSyncExternalStore } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MODULES_BY_CATEGORY } from '@/lib/constants/modules';
import { type ModuleCategory, type ModuleDefinition } from '@/types/builder';
import { formatWon } from '@/lib/utils/format';
import { useBuilderStore } from '@/features/builder/store';
import { subscribe, getSnapshot } from '@/lib/speckle/customModules';

const CATEGORY_TAB_MAP: { value: ModuleCategory; label: string }[] = [
  { value: 'STRUCTURAL', label: '구조' },
  { value: 'FUNCTIONAL', label: '기능' },
  { value: 'DESIGN', label: '디자인' },
];

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
        {/* Color swatch */}
        <div
          className="mt-0.5 h-8 w-8 flex-shrink-0 rounded"
          style={{ backgroundColor: module.color }}
        />
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

  // Speckle 커스텀 모듈 구독 (등록될 때마다 자동 리렌더)
  const customModules = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

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
    </div>
  );
}
