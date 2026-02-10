import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import {
  uploadObjects,
  createBranch,
  createCommit,
  SPECKLE_SERVER,
} from '@/lib/api/speckle';
import type { SpeckleExportRequest, SpeckleExportModule } from '@/types/speckle';

/** hex color → Speckle ARGB int (alpha=255) */
function hexToArgb(hex: string): number {
  const c = parseInt(hex.replace('#', ''), 16);
  const r = (c >> 16) & 0xff;
  const g = (c >> 8) & 0xff;
  const b = c & 0xff;
  // ARGB as signed 32-bit int
  return ((255 << 24) | (r << 16) | (g << 8) | b) | 0;
}

/** Y-up (Three.js) → Z-up (Rhino/Speckle) 좌표 변환 */
function toZUp(x: number, y: number, z: number): [number, number, number] {
  return [x, -z, y];
}

/** BoxGeometry 6면 메시 생성 (Z-up, min corner 기준) */
function createBoxMesh(
  w: number, h: number, d: number,
  posX: number, posY: number, posZ: number,
  color: string,
) {
  const x0 = posX, x1 = posX + w;
  const y0 = posY, y1 = posY + h;
  const z0 = posZ, z1 = posZ + d;

  const corners = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];

  const v = corners.map(([cx, cy, cz]) => toZUp(cx, cy, cz));
  const vertices: number[] = [];
  for (const [vx, vy, vz] of v) vertices.push(vx, vy, vz);

  const faces = [
    1, 0, 1, 2, 3, // front
    1, 4, 7, 6, 5, // back
    1, 0, 4, 5, 1, // bottom
    1, 3, 2, 6, 7, // top
    1, 0, 3, 7, 4, // left
    1, 1, 5, 6, 2, // right
  ];

  return {
    speckle_type: 'Objects.Geometry.Mesh',
    units: 'm',
    vertices,
    faces,
    colors: Array(8).fill(hexToArgb(color)),
  };
}

/** Speckle 커스텀 모듈 메시 → Z-up 변환 + 위치 오프셋 적용 */
function createCustomMesh(mod: SpeckleExportModule) {
  const meshData = mod.meshData!;
  const allVertices: number[] = [];
  const allFaces: number[] = [];
  const allColors: number[] = [];
  let vertexOffset = 0;

  for (const part of meshData.meshes) {
    const color = hexToArgb(part.color ?? mod.color);
    const numVerts = part.vertices.length / 3;

    const rad = (mod.rotation * Math.PI) / 180;
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);

    for (let i = 0; i < numVerts; i++) {
      let vx = part.vertices[i * 3];
      const vy = part.vertices[i * 3 + 1];
      let vz = part.vertices[i * 3 + 2];

      const rx = vx * cosR - vz * sinR;
      const rz = vx * sinR + vz * cosR;
      vx = rx;
      vz = rz;

      vx += mod.position[0];
      const finalY = vy + mod.position[1];
      vz += mod.position[2];

      const [sx, sy, sz] = toZUp(vx, finalY, vz);
      allVertices.push(sx, sy, sz);
      allColors.push(color);
    }

    for (let i = 0; i < part.indices.length; i += 3) {
      allFaces.push(
        0,
        part.indices[i] + vertexOffset,
        part.indices[i + 1] + vertexOffset,
        part.indices[i + 2] + vertexOffset,
      );
    }

    vertexOffset += numVerts;
  }

  return {
    speckle_type: 'Objects.Geometry.Mesh',
    units: 'm',
    vertices: allVertices,
    faces: allFaces,
    colors: allColors,
  };
}

/** MD5 해시로 Speckle 오브젝트 ID 생성 (32자) */
function computeId(obj: Record<string, unknown>): string {
  const json = JSON.stringify(obj);
  return createHash('md5').update(json).digest('hex');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SpeckleExportRequest;
    const { streamId, branchName, message, modules } = body;

    if (!streamId || !branchName || !modules?.length) {
      return NextResponse.json(
        { error: 'streamId, branchName, modules 필수' },
        { status: 400 },
      );
    }

    // 1. 브랜치 생성 (이미 존재하면 무시)
    await createBranch(streamId, branchName, 'MDMD Builder export');

    // 2. 각 모듈 → Speckle Mesh 오브젝트 변환
    const meshObjects: Record<string, unknown>[] = [];

    for (const mod of modules) {
      let mesh: Record<string, unknown>;

      if (mod.meshData) {
        mesh = createCustomMesh(mod);
      } else {
        const [w, h, d] = mod.dimensions;
        mesh = createBoxMesh(
          w, h, d,
          mod.position[0], mod.position[1], mod.position[2],
          mod.color,
        );
      }

      mesh['name'] = mod.name;

      // RenderMaterial — 개별 색상으로 모듈 구분
      const renderMat: Record<string, unknown> = {
        speckle_type: 'Objects.Other.RenderMaterial',
        name: mod.name,
        diffuse: hexToArgb(mod.color),
        opacity: 1,
        metalness: 0,
        roughness: 1,
      };
      renderMat['id'] = computeId(renderMat);
      mesh['@renderMaterial'] = renderMat;

      mesh['id'] = computeId(mesh);
      meshObjects.push(mesh);
    }

    // 3. Root 컨테이너 오브젝트
    const closure: Record<string, number> = {};
    const extraObjects: Record<string, unknown>[] = [];
    for (const m of meshObjects) {
      closure[m['id'] as string] = 1;
      const mat = m['@renderMaterial'] as Record<string, unknown> | undefined;
      if (mat?.['id']) {
        closure[mat['id'] as string] = 2;
        extraObjects.push(mat);
      }
    }

    const root: Record<string, unknown> = {
      speckle_type: 'Base',
      name: 'MDMD Builder Export',
      units: 'm',
      '@elements': meshObjects.map((m) => ({
        speckle_type: 'reference',
        referencedId: m['id'] as string,
      })),
      totalChildrenCount: meshObjects.length,
      __closure: closure,
    };
    const rootId = computeId(root);
    root['id'] = rootId;

    // 4. 모든 오브젝트 업로드
    const allObjects = [...extraObjects, ...meshObjects, root];
    await uploadObjects(streamId, allObjects);

    // 5. 커밋 생성
    const commitId = await createCommit(
      streamId,
      branchName,
      rootId,
      message,
      meshObjects.length,
    );

    const commitUrl = `${SPECKLE_SERVER}/streams/${streamId}/commits/${commitId}`;

    return NextResponse.json({ commitId, commitUrl });
  } catch (err: unknown) {
    console.error('Speckle export error:', err);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
