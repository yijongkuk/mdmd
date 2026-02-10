'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createProject } from '@/features/project/services';

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export function NewProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: NewProjectDialogProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  async function handleCreate() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('프로젝트 이름을 입력해주세요.');
      return;
    }

    try {
      const project = await createProject({
        name: trimmedName,
        description: description.trim() || undefined,
      });

      setName('');
      setDescription('');
      setError('');
      onOpenChange(false);
      onCreated?.();
      router.push(`/builder/${project.id}`);
    } catch {
      setError('프로젝트 생성에 실패했습니다.');
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCreate();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 프로젝트</DialogTitle>
          <DialogDescription>
            새로운 모듈러 건축 프로젝트를 시작합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div>
            <label
              htmlFor="project-name"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              프로젝트 이름 <span className="text-red-500">*</span>
            </label>
            <Input
              id="project-name"
              placeholder="예: 내 첫 모듈러 주택"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
          </div>

          <div>
            <label
              htmlFor="project-desc"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              설명 (선택)
            </label>
            <Input
              id="project-desc"
              placeholder="프로젝트에 대한 간단한 설명"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleCreate}>생성</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
