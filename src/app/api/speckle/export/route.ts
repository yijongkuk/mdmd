import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import {
  uploadObjects,
  createBranch,
  createCommit,
  getModels,
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

/** BoxGeometry 12 삼각형 메시 생성 (Z-up, CCW 와인딩, 회전 적용) */
function createBoxMesh(
  w: number, h: number, d: number,
  posX: number, posY: number, posZ: number,
  color: string,
  rotationDeg: number = 0,
) {
  // Local corners centered at origin
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const localCorners: [number, number, number][] = [
    [-hw, -hh, -hd], [hw, -hh, -hd], [hw, hh, -hd], [-hw, hh, -hd],
    [-hw, -hh, hd],  [hw, -hh, hd],  [hw, hh, hd],  [-hw, hh, hd],
  ];

  // Apply Y-axis rotation (in Y-up space)
  const rad = (rotationDeg * Math.PI) / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);

  // Compute rotated center (same logic as PlacedModule)
  const localCx = w / 2;
  const localCz = d / 2;
  const cx = posX + localCx * cosR - localCz * sinR;
  const cy = posY + hh;
  const cz = posZ + localCx * sinR + localCz * cosR;

  const vertices: number[] = [];
  for (const [lx, ly, lz] of localCorners) {
    // Rotate around Y axis, then translate to world center
    const rx = lx * cosR - lz * sinR + cx;
    const ry = ly + cy;
    const rz = lx * sinR + lz * cosR + cz;
    const [sx, sy, sz] = toZUp(rx, ry, rz);
    vertices.push(sx, sy, sz);
  }

  // 삼각형 면 (type=0), CCW 와인딩 — 법선이 바깥쪽을 향함
  const faces = [
    0, 0, 3, 2,  0, 0, 2, 1,  // front (+Y)
    0, 4, 5, 6,  0, 4, 6, 7,  // back  (-Y)
    0, 0, 1, 5,  0, 0, 5, 4,  // bottom (-Z)
    0, 3, 7, 6,  0, 3, 6, 2,  // top    (+Z)
    0, 0, 4, 7,  0, 0, 7, 3,  // left   (-X)
    0, 1, 2, 6,  0, 1, 6, 5,  // right  (+X)
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

/** 내보내기 대상 스트림의 기존 모델(브랜치) 목록 반환 */
export async function GET() {
  try {
    const streamId = process.env.SPECKLE_EXPORT_STREAM_ID;
    if (!streamId) {
      return NextResponse.json(
        { error: 'SPECKLE_EXPORT_STREAM_ID 환경변수가 설정되지 않았습니다' },
        { status: 500 },
      );
    }
    const branches = await getModels(streamId);
    // main 브랜치는 제외 (사용자가 만든 모델만 표시)
    const models = branches
      .filter((b: { name: string }) => b.name !== 'main')
      .map((b: { name: string; commits: { totalCount: number } }) => ({
        name: b.name,
        commitCount: b.commits.totalCount,
      }));
    return NextResponse.json({ models });
  } catch (err: unknown) {
    console.error('Speckle export models error:', err);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SpeckleExportRequest;
    const { branchName, message, modules } = body;

    const streamId = process.env.SPECKLE_EXPORT_STREAM_ID;
    if (!streamId) {
      return NextResponse.json(
        { error: 'SPECKLE_EXPORT_STREAM_ID 환경변수가 설정되지 않았습니다' },
        { status: 500 },
      );
    }

    if (!branchName || !modules?.length) {
      return NextResponse.json(
        { error: 'branchName, modules 필수' },
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
          mod.rotation,
        );
      }

      mesh['name'] = mod.name;
      mesh['id'] = computeId(mesh);
      meshObjects.push(mesh);
    }

    // 3. Root 컨테이너 오브젝트
    const closure: Record<string, number> = {};
    for (const m of meshObjects) {
      closure[m['id'] as string] = 1;
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
    const allObjects = [...meshObjects, root];
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
