import { NextRequest, NextResponse } from 'next/server';
import { SPECKLE_SERVER, SPECKLE_TOKEN } from '@/lib/api/speckle';

interface RawMesh {
  vertices: number[];
  faces: number[];
  colors?: number[];
  name?: string;
  units?: string;
}

/**
 * Speckle REST API로 오브젝트 트리 전체 조회
 * 응답: newline-delimited {id}\t{json}
 */
async function fetchObjectTree(streamId: string, objectId: string): Promise<Record<string, Record<string, unknown>>> {
  const url = `${SPECKLE_SERVER}/objects/${streamId}/${objectId}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${SPECKLE_TOKEN}`,
      Accept: 'text/plain',
    },
  });
  if (!res.ok) {
    throw new Error(`Speckle object fetch failed: ${res.status}`);
  }

  const text = await res.text();
  const objects: Record<string, Record<string, unknown>> = {};

  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const tabIdx = line.indexOf('\t');
    if (tabIdx < 0) continue;
    try {
      objects[line.substring(0, tabIdx)] = JSON.parse(line.substring(tabIdx + 1));
    } catch { /* skip */ }
  }

  return objects;
}

/**
 * DataChunk 참조 배열을 실제 숫자 배열로 해석
 * Speckle은 큰 배열을 [{referencedId: "chunkId"}] 형태로 분할 저장.
 * chunk 오브젝트의 `data` 필드에 실제 숫자들이 있음.
 */
function resolveChunkedArray(
  arr: unknown,
  allObjects: Record<string, Record<string, unknown>>,
): number[] | null {
  if (!Array.isArray(arr)) return null;

  // Case 1: 이미 숫자 배열 (작은 데이터)
  if (arr.length > 0 && typeof arr[0] === 'number') {
    return arr as number[];
  }

  // Case 2: DataChunk 참조 배열
  // Note: concat 사용 — spread(...)는 만 단위 배열에서 call stack overflow 발생
  let result: number[] = [];
  for (const item of arr) {
    if (item && typeof item === 'object') {
      const ref = item as Record<string, unknown>;
      // 직접 참조
      if (typeof ref.referencedId === 'string') {
        const chunk = allObjects[ref.referencedId];
        if (chunk && Array.isArray(chunk.data)) {
          result = result.concat(chunk.data as number[]);
        }
      }
      // 이미 해석된 chunk
      else if (Array.isArray(ref.data)) {
        result = result.concat(ref.data as number[]);
      }
    }
  }

  return result.length > 0 ? result : null;
}

// ===== Transform 행렬 유틸 =====

/** 항등 행렬 (row-major 4x4) */
const IDENTITY: number[] = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

/** 오브젝트에서 4x4 transform 행렬 추출 (row-major flat array) */
function getTransformMatrix(
  obj: Record<string, unknown>,
  allObjects: Record<string, Record<string, unknown>>,
): number[] | null {
  const t = obj.transform;
  if (!t) return null;

  // flat array of 16 numbers (가장 흔한 Speckle 형식)
  if (Array.isArray(t) && t.length === 16 && typeof t[0] === 'number') {
    return t as number[];
  }

  if (t && typeof t === 'object' && !Array.isArray(t)) {
    const tObj = t as Record<string, unknown>;
    // { value: [16] } or { matrix: [16] }
    for (const key of ['value', 'matrix']) {
      const arr = tObj[key];
      if (Array.isArray(arr) && arr.length === 16 && typeof arr[0] === 'number') {
        return arr as number[];
      }
    }
    // reference to transform object
    if (typeof tObj.referencedId === 'string') {
      const resolved = allObjects[tObj.referencedId];
      if (resolved) return getTransformMatrix(resolved, allObjects);
    }
  }

  return null;
}

/** row-major 4x4 행렬 곱 (A × B) */
function multiplyMatrices(a: number[], b: number[]): number[] {
  const r = new Array(16).fill(0);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      for (let k = 0; k < 4; k++) {
        r[row * 4 + col] += a[row * 4 + k] * b[k * 4 + col];
      }
    }
  }
  return r;
}

/** row-major 4x4 행렬을 vertex 배열에 적용 */
function applyTransformToVertices(vertices: number[], m: number[]): number[] {
  const out = new Array(vertices.length);
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2];
    out[i]     = m[0] * x + m[1] * y + m[2] * z + m[3];
    out[i + 1] = m[4] * x + m[5] * y + m[6] * z + m[7];
    out[i + 2] = m[8] * x + m[9] * y + m[10] * z + m[11];
  }
  return out;
}

/** transform이 항등행렬인지 확인 */
function isIdentity(m: number[]): boolean {
  for (let i = 0; i < 16; i++) {
    if (Math.abs(m[i] - IDENTITY[i]) > 1e-6) return false;
  }
  return true;
}

/**
 * 참조 ID를 해석하여 실제 오브젝트 반환
 */
function resolveRef(
  item: Record<string, unknown>,
  allObjects: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
  if (typeof item.referencedId === 'string' && allObjects[item.referencedId]) {
    return allObjects[item.referencedId];
  }
  return item;
}

// ===== Speckle v3 Proxy Schema 지원 =====

/**
 * InstanceDefinitionProxy의 applicationId → 해당 오브젝트
 * InstanceProxy.definitionId (GUID) → InstanceDefinitionProxy.applicationId 매칭
 */
interface ProxyMaps {
  /** definitionId (GUID) → InstanceDefinitionProxy 오브젝트 */
  definitionMap: Map<string, Record<string, unknown>>;
  /** applicationId → 실제 geometry 오브젝트 */
  appIdToObjMap: Map<string, Record<string, unknown>>;
  /** 인스턴스 정의의 멤버인 applicationId 집합 (일반 탐색에서 스킵용) */
  instanceMemberAppIds: Set<string>;
}

/**
 * allObjects를 스캔하여 Proxy Schema 룩업 맵 생성
 */
function buildProxyMaps(allObjects: Record<string, Record<string, unknown>>): ProxyMaps {
  const definitionMap = new Map<string, Record<string, unknown>>();
  const appIdToObjMap = new Map<string, Record<string, unknown>>();
  const instanceMemberAppIds = new Set<string>();

  for (const obj of Object.values(allObjects)) {
    const speckleType = (obj.speckle_type as string) || '';
    const appId = obj.applicationId as string | undefined;

    // InstanceDefinitionProxy: applicationId로 매핑
    if (
      speckleType.includes('InstanceDefinitionProxy') ||
      speckleType.includes('BlockDefinition') ||
      speckleType === 'Objects.Organization.Definition'
    ) {
      if (appId) {
        definitionMap.set(appId, obj);
      }
      // 멤버 오브젝트 applicationId 수집
      const memberIds = obj.objects;
      if (Array.isArray(memberIds)) {
        for (const mid of memberIds) {
          if (typeof mid === 'string') instanceMemberAppIds.add(mid);
        }
      }
    }

    // 모든 오브젝트의 applicationId → 오브젝트 매핑
    if (appId) {
      appIdToObjMap.set(appId, obj);
    }
  }

  return { definitionMap, appIdToObjMap, instanceMemberAppIds };
}

/**
 * 오브젝트 트리를 재귀 탐색하여 메시 추출
 * transform 행렬을 누적하여 각 메시의 월드 좌표 복원
 */
function extractMeshes(
  obj: Record<string, unknown>,
  allObjects: Record<string, Record<string, unknown>>,
  meshes: RawMesh[],
  proxyMaps: ProxyMaps,
  rootUnits?: string,
  depth = 0,
  parentTransform: number[] | null = null,
  fromInstance = false,
): void {
  if (!obj || typeof obj !== 'object' || depth > 20) return;

  // 일반 탐색 시 인스턴스 정의 멤버는 건너뜀 (InstanceProxy 경로에서만 처리)
  if (!fromInstance && proxyMaps.instanceMemberAppIds.size > 0) {
    const appId = obj.applicationId as string | undefined;
    if (appId && proxyMaps.instanceMemberAppIds.has(appId)) {
      return;
    }
  }

  const units = (obj.units as string) || rootUnits;

  // 이 오브젝트의 transform 누적
  const localTransform = getTransformMatrix(obj, allObjects);
  let currentTransform = parentTransform;
  if (localTransform && !isIdentity(localTransform)) {
    currentTransform = currentTransform
      ? multiplyMatrices(currentTransform, localTransform)
      : localTransform;
  }

  // InstanceProxy / BlockInstance: definition 참조를 transform과 함께 탐색
  const speckleType = (obj.speckle_type as string) || '';
  if (speckleType.includes('Instance') || speckleType.includes('BlockInstance')) {
    let found = false;

    // Pattern 1: v2 direct definition reference (definition / @definition / blockDefinition)
    const defKeys = ['definition', '@definition', 'blockDefinition', '@blockDefinition', '@geometry'];
    for (const key of defKeys) {
      const def = obj[key];
      if (!def) continue;
      found = true;
      if (Array.isArray(def)) {
        for (const item of def) {
          if (item && typeof item === 'object') {
            const resolved = resolveRef(item as Record<string, unknown>, allObjects);
            extractMeshes(resolved, allObjects, meshes, proxyMaps, units, depth + 1, currentTransform, true);
          }
        }
      } else if (typeof def === 'object') {
        const resolved = resolveRef(def as Record<string, unknown>, allObjects);
        extractMeshes(resolved, allObjects, meshes, proxyMaps, units, depth + 1, currentTransform, true);
      }
    }

    // Pattern 2: v3 Proxy Schema — definitionId (GUID) → InstanceDefinitionProxy
    if (!found && typeof obj.definitionId === 'string') {
      const defProxy = proxyMaps.definitionMap.get(obj.definitionId);
      if (defProxy) {
        // InstanceDefinitionProxy.objects = applicationId[] of member geometry
        const memberAppIds = defProxy.objects;
        if (Array.isArray(memberAppIds)) {
          for (const appId of memberAppIds) {
            if (typeof appId !== 'string') continue;
            const memberObj = proxyMaps.appIdToObjMap.get(appId);
            if (memberObj) {
              extractMeshes(memberObj, allObjects, meshes, proxyMaps, units, depth + 1, currentTransform, true);
            }
          }
          found = true;
        }
        // Fallback: definition has displayValue directly
        if (!found) {
          extractMeshes(defProxy, allObjects, meshes, proxyMaps, units, depth + 1, currentTransform, true);
          found = true;
        }
      }
    }

    if (found) return;
    // If neither pattern matched, fall through to generic child traversal
  }

  // 이 오브젝트가 메시인지 확인
  const isMeshType = speckleType === 'Objects.Geometry.Mesh';
  const hasGeom = obj.vertices !== undefined && obj.faces !== undefined;

  if (isMeshType || hasGeom) {
    let vertices = resolveChunkedArray(obj.vertices, allObjects);
    const faces = resolveChunkedArray(obj.faces, allObjects);

    if (vertices && vertices.length >= 9 && faces && faces.length >= 4) {
      // transform 적용 (로컬 → 월드)
      if (currentTransform && !isIdentity(currentTransform)) {
        vertices = applyTransformToVertices(vertices, currentTransform);
      }

      const colors = resolveChunkedArray(obj.colors, allObjects) ?? undefined;
      meshes.push({
        vertices,
        faces,
        colors,
        name: typeof obj.name === 'string' ? obj.name : undefined,
        units,
      });
      return;
    }
  }

  // 하위 오브젝트 탐색
  const childKeys = [
    'displayValue', '@displayValue',
    'displayMesh', '@displayMesh',
    'elements', '@elements',
    'objects', '@objects',
    'children', '@children',
  ];

  for (const key of childKeys) {
    const child = obj[key];
    if (!child) continue;

    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const resolved = resolveRef(item as Record<string, unknown>, allObjects);
          extractMeshes(resolved, allObjects, meshes, proxyMaps, units, depth + 1, currentTransform);
        }
      }
    } else if (typeof child === 'object') {
      const resolved = resolveRef(child as Record<string, unknown>, allObjects);
      extractMeshes(resolved, allObjects, meshes, proxyMaps, units, depth + 1, currentTransform);
    }
  }
}

/** 단위 → 미터 변환 계수 */
function getUnitScale(units?: string): number {
  switch (units) {
    case 'mm': return 0.001;
    case 'cm': return 0.01;
    case 'in': case 'inches': return 0.0254;
    case 'ft': case 'feet': return 0.3048;
    case 'm': case 'meters': default: return 1;
  }
}

/**
 * Z-up (Rhino/Speckle) → Y-up (Three.js) 좌표 변환 + 단위 변환
 */
function convertCoordinates(vertices: number[], scale: number): number[] {
  const result = new Array(vertices.length);
  for (let i = 0; i < vertices.length; i += 3) {
    result[i] = vertices[i] * scale;           // x → x
    result[i + 1] = vertices[i + 2] * scale;   // z → y (up)
    result[i + 2] = -vertices[i + 1] * scale;  // -y → z (forward)
  }
  return result;
}

/**
 * Speckle faces → 삼각형 인덱스
 * face type: 0=tri(3), 1=quad(4), n>1=n-gon(n)
 */
function triangulateFaces(faces: number[]): number[] {
  const indices: number[] = [];
  let i = 0;
  while (i < faces.length) {
    let n = faces[i]; i++;
    if (n === 0) n = 3;
    else if (n === 1) n = 4;
    if (i + n > faces.length) break;
    const v0 = faces[i];
    for (let j = 1; j < n - 1; j++) {
      indices.push(v0, faces[i + j], faces[i + j + 1]);
    }
    i += n;
  }
  return indices;
}

/** GET /api/speckle/objects/[streamId]/[objectId] */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ streamId: string; objectId: string }> }
) {
  const { streamId, objectId } = await params;

  if (!SPECKLE_TOKEN) {
    return NextResponse.json({ error: 'Speckle token not configured' }, { status: 500 });
  }

  try {
    console.log(`[Speckle] Fetching object tree: ${streamId}/${objectId}`);
    const allObjects = await fetchObjectTree(streamId, objectId);
    console.log(`[Speckle] Got ${Object.keys(allObjects).length} objects`);

    const root = allObjects[objectId];
    if (!root) {
      return NextResponse.json({ error: 'Root object not found' }, { status: 404 });
    }

    const rootUnits = (root.units as string) || 'm';

    // Proxy Schema 룩업 맵 생성 (InstanceProxy definitionId → geometry 해석용)
    const proxyMaps = buildProxyMaps(allObjects);
    console.log(`[Speckle] Proxy maps: ${proxyMaps.definitionMap.size} definitions, ${proxyMaps.appIdToObjMap.size} appId entries, ${proxyMaps.instanceMemberAppIds.size} instance members`);

    // 메시 추출 (DataChunk 자동 해석 + transform 적용)
    const rawMeshes: RawMesh[] = [];
    extractMeshes(root, allObjects, rawMeshes, proxyMaps, rootUnits);

    if (rawMeshes.length === 0) {
      return NextResponse.json({ error: 'No mesh data found in object' }, { status: 404 });
    }

    console.log(`[Speckle] Found ${rawMeshes.length} mesh(es), units: ${rootUnits}`);

    // 좌표 변환 + 바운딩 박스 계산
    let gMinX = Infinity, gMinY = Infinity, gMinZ = Infinity;
    let gMaxX = -Infinity, gMaxY = -Infinity, gMaxZ = -Infinity;

    const convertedMeshes = rawMeshes.map((raw) => {
      const scale = getUnitScale(raw.units);
      const converted = convertCoordinates(raw.vertices, scale);
      const indices = triangulateFaces(raw.faces);

      for (let i = 0; i < converted.length; i += 3) {
        gMinX = Math.min(gMinX, converted[i]);
        gMinY = Math.min(gMinY, converted[i + 1]);
        gMinZ = Math.min(gMinZ, converted[i + 2]);
        gMaxX = Math.max(gMaxX, converted[i]);
        gMaxY = Math.max(gMaxY, converted[i + 1]);
        gMaxZ = Math.max(gMaxZ, converted[i + 2]);
      }

      // Speckle ARGB → hex
      let color: string | undefined;
      if (raw.colors && raw.colors.length > 0) {
        const c = raw.colors[0];
        if (typeof c === 'number') {
          const r = (c >> 16) & 0xff;
          const g = (c >> 8) & 0xff;
          const b = c & 0xff;
          color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        }
      }

      return { vertices: converted, indices, color };
    });

    // min=(0,0,0) 으로 이동
    const meshes = convertedMeshes.map((mesh) => {
      const translated: number[] = new Array(mesh.vertices.length);
      for (let i = 0; i < mesh.vertices.length; i += 3) {
        translated[i] = mesh.vertices[i] - gMinX;
        translated[i + 1] = mesh.vertices[i + 1] - gMinY;
        translated[i + 2] = mesh.vertices[i + 2] - gMinZ;
      }
      return { vertices: translated, indices: mesh.indices, color: mesh.color };
    });

    const size: [number, number, number] = [gMaxX - gMinX, gMaxY - gMinY, gMaxZ - gMinZ];
    let totalTriangles = 0;
    for (const m of meshes) totalTriangles += m.indices.length / 3;

    const name = typeof root.name === 'string' && root.name !== 'Unnamed document'
      ? root.name
      : 'Speckle Object';

    console.log(`[Speckle] Processed: ${totalTriangles} tris, size: ${size.map(s => s.toFixed(3)).join(' x ')}m`);

    return NextResponse.json({
      meshes,
      boundingBox: { min: [0, 0, 0], max: size, size },
      name,
      totalTriangles,
    });
  } catch (err) {
    console.error('[Speckle Objects]', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
