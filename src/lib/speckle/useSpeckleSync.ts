'use client';

import { useEffect, useRef } from 'react';
import { GRID_SIZE } from '@/lib/constants/grid';
import { registerCustomModule, getCustomModules } from './customModules';
import type { ModuleDefinition, ModuleCategory } from '@/types/builder';
import type { SpeckleMeshData, SpeckleModel } from '@/types/speckle';

/**
 * 모델 이름에서 카테고리 + 표시명 파싱
 * 접두사 규칙: "str_이름" → STRUCTURAL, "fnc_이름" → FUNCTIONAL, "dsn_이름" → DESIGN
 * 접두사 없으면 기본 STRUCTURAL
 */
function parseCategoryFromName(name: string): { category: ModuleCategory; displayName: string } {
  const lower = name.toLowerCase();

  if (lower.startsWith('str_') || lower.startsWith('str-')) {
    return { category: 'STRUCTURAL', displayName: name.substring(4) };
  }
  if (lower.startsWith('fnc_') || lower.startsWith('fnc-')) {
    return { category: 'FUNCTIONAL', displayName: name.substring(4) };
  }
  if (lower.startsWith('dsn_') || lower.startsWith('dsn-')) {
    return { category: 'DESIGN', displayName: name.substring(4) };
  }

  // 접두사 없으면 STRUCTURAL, 이름 그대로
  return { category: 'STRUCTURAL', displayName: name };
}

/**
 * 빌더 마운트 시 Speckle Cloud에서 모듈을 자동으로 가져온다.
 * 각 모델의 최신 커밋에서 메시를 추출하여 커스텀 모듈로 등록.
 * 기존 카테고리(구조/기능/디자인)에 자연스럽게 포함됨.
 */
export function useSpeckleSync() {
  const syncedRef = useRef(false);

  useEffect(() => {
    // 이미 동기화된 경우 또는 이미 커스텀 모듈이 있으면 스킵
    if (syncedRef.current || getCustomModules().length > 0) return;
    syncedRef.current = true;

    let cancelled = false;

    async function sync() {
      try {
        // 1. Speckle 연결 + 프로젝트 목록
        const connRes = await fetch('/api/speckle');
        if (!connRes.ok) return;
        const connData = await connRes.json();
        if (!connData.connected || !connData.projects?.length) return;

        // 2. 각 프로젝트의 모델 목록
        for (const project of connData.projects) {
          if (cancelled) return;

          const modelsRes = await fetch(`/api/speckle/models/${project.id}`);
          if (!modelsRes.ok) continue;
          const modelsData = await modelsRes.json();
          if (!modelsData.models?.length) continue;

          // 3. 각 모델에서 메시 가져오기 (최신 커밋이 있는 모델만)
          for (const model of modelsData.models as SpeckleModel[]) {
            if (cancelled) return;
            if (!model.latestCommit) continue;

            const objectId = model.latestCommit.referencedObject;
            const moduleId = `speckle-${project.id}-${objectId}`;

            // 이미 등록되어 있으면 스킵
            if (getCustomModules().some((m) => m.id === moduleId)) continue;

            try {
              const objRes = await fetch(`/api/speckle/objects/${project.id}/${objectId}`);
              if (!objRes.ok) continue;
              const objData = await objRes.json();
              if (objData.error || !objData.meshes?.length) continue;

              if (cancelled) return;

              const meshData: SpeckleMeshData = {
                meshes: objData.meshes,
                boundingBox: objData.boundingBox,
                name: objData.name,
                totalTriangles: objData.totalTriangles,
              };

              const [w, h, d] = meshData.boundingBox.size;
              const width = Math.max(0.6, w);
              const height = Math.max(0.6, h);
              const depth = Math.max(0.6, d);

              const { category, displayName } = parseCategoryFromName(model.name);

              const moduleDef: ModuleDefinition = {
                id: moduleId,
                name: model.name,
                nameKo: displayName,
                category,
                description: `${project.name} / ${model.name}`,
                width: Math.round(width * 100) / 100,
                depth: Math.round(depth * 100) / 100,
                height: Math.round(height * 100) / 100,
                gridWidth: Math.max(1, Math.ceil(width / GRID_SIZE)),
                gridDepth: Math.max(1, Math.ceil(depth / GRID_SIZE)),
                gridHeight: Math.max(1, Math.ceil(height / GRID_SIZE)),
                basePrice: 0,
                color: meshData.meshes[0]?.color ?? '#9ca3af',
                speckleRef: {
                  streamId: project.id,
                  objectId,
                  commitId: model.latestCommit.id,
                },
              };

              registerCustomModule(moduleDef, meshData);
            } catch {
              // 개별 모델 실패는 무시
            }
          }
        }
      } catch {
        // Speckle 미연결 시 조용히 실패
      }
    }

    sync();
    return () => { cancelled = true; };
  }, []);
}
