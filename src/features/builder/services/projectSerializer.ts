import { ModulePlacement } from '@/types/builder';
import { Project, ProjectExport } from '@/types/project';
import { calculateCostBreakdown, calculateTotalFloorArea } from './costCalculator';

const PROJECTS_STORAGE_KEY = 'mdmd_projects';
const AUTO_SAVE_DEBOUNCE_MS = 3000;

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

/** Serialize current builder state to a Project object */
export function serializeProject(
  projectId: string,
  name: string,
  placements: ModulePlacement[],
  parcelPnu?: string,
  description?: string
): Project {
  const breakdown = calculateCostBreakdown(placements);

  return {
    id: projectId,
    name,
    description,
    parcelPnu,
    gridSizeM: 0.6,
    totalModules: breakdown.totalModules,
    totalArea: breakdown.totalArea,
    totalCost: breakdown.totalCost,
    placements,
    createdAt: getStoredProject(projectId)?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Deserialize a project JSON back to builder state */
export function deserializeProject(json: string): Project | null {
  try {
    const data = JSON.parse(json);
    if (!data.id || !data.placements) return null;
    return data as Project;
  } catch {
    return null;
  }
}

/** Export project as a downloadable JSON file */
export function exportProjectJSON(project: Project): void {
  const exportData: ProjectExport = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    project,
  };

  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name}_${project.id.slice(0, 8)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Import a project from a JSON file */
export function importProjectJSON(file: File): Promise<Project> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const data = JSON.parse(text);
        const project = data.project ?? data;
        if (!project.id || !project.placements) {
          reject(new Error('올바른 프로젝트 파일이 아닙니다.'));
          return;
        }
        resolve(project as Project);
      } catch {
        reject(new Error('파일을 읽을 수 없습니다.'));
      }
    };
    reader.onerror = () => reject(new Error('파일 읽기 오류'));
    reader.readAsText(file);
  });
}

/** Get all stored projects from localStorage */
function getAllStoredProjects(): Record<string, Project> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Get a single stored project */
function getStoredProject(id: string): Project | null {
  const projects = getAllStoredProjects();
  return projects[id] ?? null;
}

/** Save a project to localStorage */
export function saveProjectToStorage(project: Project): void {
  if (typeof window === 'undefined') return;
  const projects = getAllStoredProjects();
  projects[project.id] = project;
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
}

/** Load a project from localStorage */
export function loadProjectFromStorage(id: string): Project | null {
  return getStoredProject(id);
}

/** Delete a project from localStorage */
export function deleteProjectFromStorage(id: string): void {
  if (typeof window === 'undefined') return;
  const projects = getAllStoredProjects();
  delete projects[id];
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
}

/** List all projects from localStorage */
export function listProjectsFromStorage(): Project[] {
  const projects = getAllStoredProjects();
  return Object.values(projects).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/** Auto-save with debounce */
export function autoSaveProject(project: Project): void {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveProjectToStorage(project);
    autoSaveTimer = null;
  }, AUTO_SAVE_DEBOUNCE_MS);
}

/** Generate project summary text */
export function generateProjectSummary(project: Project): string {
  const breakdown = calculateCostBreakdown(project.placements);

  const lines: string[] = [
    `프로젝트: ${project.name}`,
    `생성일: ${new Date(project.createdAt).toLocaleDateString('ko-KR')}`,
    `수정일: ${new Date(project.updatedAt).toLocaleDateString('ko-KR')}`,
    '',
    `=== 요약 ===`,
    `총 모듈 수: ${breakdown.totalModules}개`,
    `총 면적: ${breakdown.totalArea.toFixed(1)}m²`,
    `총 공사비: ${breakdown.totalCost.toLocaleString()}원`,
    '',
    `=== 카테고리별 ===`,
  ];

  for (const cat of breakdown.byCategory) {
    lines.push(`${cat.categoryKo}: ${cat.count}개, ${cat.totalCost.toLocaleString()}원`);
  }

  lines.push('', `=== 층별 ===`);
  for (const fl of breakdown.byFloor) {
    lines.push(`${fl.floor}층: ${fl.count}개, ${fl.totalCost.toLocaleString()}원`);
  }

  return lines.join('\n');
}

/** Download project summary as text file */
export function downloadProjectSummary(project: Project): void {
  const summary = generateProjectSummary(project);
  const blob = new Blob([summary], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name}_요약.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
