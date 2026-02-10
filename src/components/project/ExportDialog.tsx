'use client';

import { Download, FileText, Image } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Project, ProjectExport } from '@/types/project';
import { formatWon, formatArea, formatDate } from '@/lib/utils/format';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
}

export function ExportDialog({
  open,
  onOpenChange,
  project,
}: ExportDialogProps) {
  function downloadJson() {
    const exportData: ProjectExport = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      project,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '_')}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadSummaryText() {
    const lines = [
      `프로젝트: ${project.name}`,
      project.description ? `설명: ${project.description}` : '',
      `생성일: ${formatDate(project.createdAt)}`,
      `수정일: ${formatDate(project.updatedAt)}`,
      '',
      '--- 요약 ---',
      `총 모듈 수: ${project.totalModules}개`,
      `총 면적: ${formatArea(project.totalArea)}`,
      `총 비용: ${formatWon(project.totalCost)}`,
      '',
      `배치 모듈 수: ${project.placements.length}개`,
    ]
      .filter(Boolean)
      .join('\n');

    const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '_')}_요약.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>프로젝트 내보내기</DialogTitle>
          <DialogDescription>
            프로젝트 데이터를 다양한 형식으로 내보낼 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 pt-2">
          <Button variant="outline" className="justify-start" onClick={downloadJson}>
            <Download className="h-4 w-4" />
            JSON 파일 다운로드
          </Button>

          <Button variant="outline" className="justify-start" onClick={downloadSummaryText}>
            <FileText className="h-4 w-4" />
            프로젝트 요약 텍스트
          </Button>

          <Button
            variant="outline"
            className="justify-start text-slate-400"
            disabled
          >
            <Image className="h-4 w-4" />
            평면도 PNG 내보내기 (준비 중)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
