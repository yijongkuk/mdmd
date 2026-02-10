'use client';

import { useState } from 'react';
import { Download, FileJson, Image, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { ModulePlacement } from '@/types/builder';
import { Project } from '@/types/project';
import {
  exportProjectJSON,
  generateProjectSummary,
  downloadProjectSummary,
} from '@/features/builder/services/projectSerializer';
import { downloadFloorPlanPNG } from '@/features/builder/services/blueprintGenerator';
import { getMaxFloor } from '@/features/builder/services/costCalculator';

interface ExportMenuProps {
  project: Project;
  placements: ModulePlacement[];
}

export function ExportMenu({ project, placements }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const maxFloor = getMaxFloor(placements);

  const handleExportJSON = () => {
    exportProjectJSON(project);
  };

  const handleExportSummary = () => {
    downloadProjectSummary(project);
  };

  const handleExportFloorPlan = async (floor: number) => {
    setExporting(true);
    try {
      await downloadFloorPlanPNG(placements, floor);
    } catch (error) {
      console.error('Floor plan export failed:', error);
    } finally {
      setExporting(false);
    }
  };

  const handleExportAllFloorPlans = async () => {
    setExporting(true);
    try {
      for (let floor = 1; floor <= maxFloor; floor++) {
        const floorPlacements = placements.filter((p) => p.floor === floor);
        if (floorPlacements.length > 0) {
          await downloadFloorPlanPNG(placements, floor);
          // Small delay between downloads
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    } catch (error) {
      console.error('Floor plan export failed:', error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Download className="h-4 w-4" />
          내보내기
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>프로젝트 내보내기</DialogTitle>
          <DialogDescription>프로젝트 데이터를 다양한 형식으로 내보낼 수 있습니다.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* JSON Export */}
          <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <FileJson className="h-5 w-5 text-blue-600" />
              <div>
                <p className="font-medium text-sm">프로젝트 파일 (JSON)</p>
                <p className="text-xs text-slate-500">전체 프로젝트 데이터를 JSON 파일로 저장</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleExportJSON}>
              저장
            </Button>
          </div>

          <Separator />

          {/* Floor Plan PNG Export */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Image className="h-4 w-4 text-green-600" />
              평면도 (PNG)
            </div>

            {maxFloor === 0 ? (
              <p className="text-xs text-slate-400 pl-6">배치된 모듈이 없습니다</p>
            ) : (
              <div className="space-y-1 pl-6">
                {Array.from({ length: maxFloor }, (_, i) => i + 1).map((floor) => {
                  const count = placements.filter((p) => p.floor === floor).length;
                  if (count === 0) return null;
                  return (
                    <div key={floor} className="flex items-center justify-between py-1">
                      <span className="text-sm text-slate-600">
                        {floor}층 ({count}개 모듈)
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleExportFloorPlan(floor)}
                        disabled={exporting}
                      >
                        저장
                      </Button>
                    </div>
                  );
                })}
                {maxFloor > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full"
                    onClick={handleExportAllFloorPlans}
                    disabled={exporting}
                  >
                    {exporting ? '내보내는 중...' : '전체 층 저장'}
                  </Button>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Summary Text Export */}
          <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-amber-600" />
              <div>
                <p className="font-medium text-sm">프로젝트 요약 (TXT)</p>
                <p className="text-xs text-slate-500">모듈 수, 면적, 비용 요약 텍스트</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleExportSummary}>
              저장
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
