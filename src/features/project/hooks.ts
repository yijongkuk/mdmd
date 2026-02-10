'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Project, ProjectSummary } from '@/types/project';
import {
  getProjects,
  getProject,
  updateProject,
  deleteProject as deleteProjectService,
} from './services';

export function useProjects() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const list = await getProjects();
    setProjects(list);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteProjectService(id);
      refresh();
    },
    [refresh]
  );

  const handleRename = useCallback(
    async (id: string, name: string) => {
      await updateProject(id, { name } as Partial<Project>);
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, name } : p))
      );
    },
    []
  );

  return { projects, isLoading, refresh, deleteProject: handleDelete, renameProject: handleRename };
}

export function useProject(id: string) {
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    getProject(id).then((p) => {
      setProject(p);
      setIsLoading(false);
    });
  }, [id]);

  const save = useCallback(
    async (data: Partial<Project>) => {
      const updated = await updateProject(id, data);
      if (updated) {
        setProject(updated);
      }
      return updated;
    },
    [id]
  );

  return { project, save, isLoading };
}
