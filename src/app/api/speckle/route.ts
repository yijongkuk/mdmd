import { NextResponse } from 'next/server';
import { getServerInfo, getProjects } from '@/lib/api/speckle';

/** GET /api/speckle — 연결 테스트 + 프로젝트 목록 */
export async function GET() {
  try {
    const server = await getServerInfo();
    const projects = await getProjects();

    return NextResponse.json({
      connected: true,
      server,
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        updatedAt: p.updatedAt,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ connected: false, error: message }, { status: 500 });
  }
}
