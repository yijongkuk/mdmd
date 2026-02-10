import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      parcelPnu: true,
      totalModules: true,
      totalArea: true,
      totalCost: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ projects });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, parcelPnu, description } = body as {
    name?: string;
    parcelPnu?: string;
    description?: string;
  };

  if (!name || name.trim().length === 0) {
    return NextResponse.json(
      { error: '프로젝트 이름은 필수입니다.' },
      { status: 400 }
    );
  }

  const project = await prisma.project.create({
    data: {
      name: name.trim(),
      description: description?.trim(),
      parcelPnu,
    },
  });

  return NextResponse.json(project, { status: 201 });
}
