import type { Project, ProjectSummary } from '@/types/project';

export async function getProjects(): Promise<ProjectSummary[]> {
  const res = await fetch('/api/projects');
  if (!res.ok) return [];
  const data = await res.json();
  return data.projects ?? [];
}

export async function getProject(id: string): Promise<Project | null> {
  const res = await fetch(`/api/projects/${id}`);
  if (!res.ok) return null;
  return res.json();
}

export async function createProject(data: {
  name: string;
  parcelPnu?: string;
  description?: string;
}): Promise<Project> {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error('프로젝트 생성에 실패했습니다.');
  }
  return res.json();
}

export async function updateProject(
  id: string,
  data: Partial<Project>
): Promise<Project | null> {
  const res = await fetch(`/api/projects/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function deleteProject(id: string): Promise<boolean> {
  const res = await fetch(`/api/projects/${id}`, {
    method: 'DELETE',
  });
  return res.ok;
}

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

export function autoSaveProject(id: string, data: Partial<Project>): void {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }

  autoSaveTimer = setTimeout(() => {
    updateProject(id, data);
    autoSaveTimer = null;
  }, 3000);
}
