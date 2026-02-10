/**
 * 런타임 커스텀 모듈 레지스트리 + 메시 데이터 캐시
 * Speckle에서 가져온 모듈을 관리한다.
 * React useSyncExternalStore 호환 구독 패턴 제공.
 */
import type { ModuleDefinition } from '@/types/builder';
import type { SpeckleMeshData } from '@/types/speckle';

/** Speckle에서 가져온 커스텀 모듈 목록 */
let customModules: ModuleDefinition[] = [];

/** 메시 데이터 캐시 (moduleId → SpeckleMeshData) */
const meshCache = new Map<string, SpeckleMeshData>();

/** 구독자 관리 (React useSyncExternalStore 호환) */
const listeners = new Set<() => void>();
let snapshot = customModules;

function notify() {
  snapshot = [...customModules];
  listeners.forEach((cb) => cb());
}

/** useSyncExternalStore용 subscribe */
export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** useSyncExternalStore용 getSnapshot */
export function getSnapshot(): ModuleDefinition[] {
  return snapshot;
}

/** 커스텀 모듈 등록 */
export function registerCustomModule(module: ModuleDefinition, meshData: SpeckleMeshData): void {
  const idx = customModules.findIndex((m) => m.id === module.id);
  if (idx >= 0) {
    customModules[idx] = module;
  } else {
    customModules.push(module);
  }
  meshCache.set(module.id, meshData);
  notify();
}

/** 커스텀 모듈 제거 */
export function removeCustomModule(id: string): void {
  customModules = customModules.filter((m) => m.id !== id);
  meshCache.delete(id);
  notify();
}

/** 등록된 커스텀 모듈 목록 */
export function getCustomModules(): ModuleDefinition[] {
  return snapshot;
}

/** 특정 모듈의 메시 데이터 조회 */
export function getMeshData(moduleId: string): SpeckleMeshData | undefined {
  return meshCache.get(moduleId);
}

/** 커스텀 모듈 ID인지 확인 */
export function isCustomModule(moduleId: string): boolean {
  return meshCache.has(moduleId);
}

/** 전체 초기화 */
export function clearCustomModules(): void {
  customModules = [];
  meshCache.clear();
  notify();
}
