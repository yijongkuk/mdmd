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

/**
 * 오브젝트 트리를 재귀 탐색하여 메시 추출
 * displayValue, elements 등의 키를 탐색하고
 * vertices/faces가 DataChunk 참조인 경우 해석
 */
function extractMeshes(
  obj: Record<string, unknown>,
  allObjects: Record<string, Record<string, unknown>>,
  meshes: RawMesh[],
  rootUnits?: string,
  depth = 0,
): void {
  if (!obj || typeof obj !== 'object' || depth > 20) return;

  const units = (obj.units as string) || rootUnits;

  // 이 오브젝트가 메시인지 확인 (speckle_type 또는 vertices+faces 존재)
  const isMeshType = obj.speckle_type === 'Objects.Geometry.Mesh';
  const hasGeom = obj.vertices !== undefined && obj.faces !== undefined;

  if (isMeshType || hasGeom) {
    const vertices = resolveChunkedArray(obj.vertices, allObjects);
    const faces = resolveChunkedArray(obj.faces, allObjects);

    if (vertices && vertices.length >= 9 && faces && faces.length >= 4) {
      const colors = resolveChunkedArray(obj.colors, allObjects) ?? undefined;
      meshes.push({
        vertices,
        faces,
        colors,
        name: typeof obj.name === 'string' ? obj.name : undefined,
        units,
      });
      return; // 메시를 찾았으면 하위 탐색 불필요
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
          const record = item as Record<string, unknown>;
          // 참조 해석
          if (typeof record.referencedId === 'string' && allObjects[record.referencedId]) {
            extractMeshes(allObjects[record.referencedId], allObjects, meshes, units, depth + 1);
          } else {
            extractMeshes(record, allObjects, meshes, units, depth + 1);
          }
        }
      }
    } else if (typeof child === 'object') {
      const record = child as Record<string, unknown>;
      if (typeof record.referencedId === 'string' && allObjects[record.referencedId]) {
        extractMeshes(allObjects[record.referencedId], allObjects, meshes, units, depth + 1);
      } else {
        extractMeshes(record, allObjects, meshes, units, depth + 1);
      }
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

    // 메시 추출 (DataChunk 자동 해석)
    const rawMeshes: RawMesh[] = [];
    extractMeshes(root, allObjects, rawMeshes, rootUnits);

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
