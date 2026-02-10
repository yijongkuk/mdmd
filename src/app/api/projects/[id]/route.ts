import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // upsert: 없으면 자동 생성 (빌더 직접 진입 / old localStorage ID 대응)
  const project = await prisma.project.upsert({
    where: { id },
    update: {},
    create: { id, name: '새 프로젝트' },
    include: { placements: true },
  });

  return NextResponse.json(project);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const { name, description, parcelPnu, totalModules, totalArea, totalCost, placements } =
    body as {
      name?: string;
      description?: string;
      parcelPnu?: string;
      totalModules?: number;
      totalArea?: number;
      totalCost?: number;
      placements?: Array<{
        moduleId: string;
        gridX: number;
        gridY: number;
        gridZ: number;
        rotation?: number;
        floor?: number;
        materialId?: string;
        customColor?: string;
      }>;
    };

  const projectData = {
    ...(name !== undefined && { name }),
    ...(description !== undefined && { description }),
    ...(parcelPnu !== undefined && { parcelPnu }),
    ...(totalModules !== undefined && { totalModules }),
    ...(totalArea !== undefined && { totalArea }),
    ...(totalCost !== undefined && { totalCost }),
  };

  // Use a transaction: upsert project + replace placements
  const project = await prisma.$transaction(async (tx) => {
    await tx.project.upsert({
      where: { id },
      update: projectData,
      create: { id, name: name ?? '새 프로젝트', ...projectData },
    });

    if (placements !== undefined) {
      await tx.modulePlacement.deleteMany({ where: { projectId: id } });
      if (placements.length > 0) {
        await tx.modulePlacement.createMany({
          data: placements.map((p) => ({
            projectId: id,
            moduleId: p.moduleId,
            gridX: p.gridX,
            gridY: p.gridY,
            gridZ: p.gridZ,
            rotation: p.rotation ?? 0,
            floor: p.floor ?? 1,
            materialId: p.materialId ?? null,
            customColor: p.customColor ?? null,
          })),
        });
      }
    }

    return tx.project.findUnique({
      where: { id },
      include: { placements: true },
    });
  });

  return NextResponse.json(project);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    await prisma.project.delete({ where: { id } });
  } catch {
    // 이미 삭제된 경우 무시
  }

  return NextResponse.json({ success: true });
}
