import { NextRequest, NextResponse } from 'next/server';
import { getModels } from '@/lib/api/speckle';

/** GET /api/speckle/models/[projectId] — 스트림의 브랜치(모델) 목록 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
    const models = await getModels(projectId);

    return NextResponse.json({
      models: models.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        commitCount: m.commits.totalCount,
        latestCommit: m.commits.items[0] ?? null,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
