'use client';

import { useState } from 'react';
import { FolderOpen, Map } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProjectCard } from '@/components/project/ProjectCard';
import { useProjects } from '@/features/project/hooks';
import Link from 'next/link';

export default function ProjectsPage() {
  const { projects, isLoading, deleteProject, renameProject } = useProjects();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  function handleDeleteClick(id: string) {
    setDeleteConfirmId(id);
  }

  function confirmDelete() {
    if (deleteConfirmId) {
      deleteProject(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">프로젝트</h1>
        <p className="text-sm text-slate-500">
          모듈러 건축 프로젝트를 관리합니다.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-600" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 py-20 text-center">
          <FolderOpen className="mb-4 h-12 w-12 text-slate-300" />
          <h2 className="mb-1 text-lg font-semibold text-slate-600">
            아직 생성된 프로젝트가 없습니다
          </h2>
          <p className="mb-4 text-sm text-slate-400">
            유휴지 탐색에서 필지를 선택하여 프로젝트를 시작하세요.
          </p>
          <Button asChild>
            <Link href="/map">
              <Map className="h-4 w-4" />
              유휴지 탐색하기
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onDelete={handleDeleteClick}
              onRename={renameProject}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
            <h3 className="mb-2 text-lg font-semibold text-slate-900">
              프로젝트 삭제
            </h3>
            <p className="mb-4 text-sm text-slate-500">
              이 프로젝트를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteConfirmId(null)}
              >
                취소
              </Button>
              <Button variant="destructive" size="sm" onClick={confirmDelete}>
                삭제
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
