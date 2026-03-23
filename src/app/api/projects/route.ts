import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getParcelByPnu, getLandUseZone } from '@/lib/api/vworld';
import { calculateRegulations } from '@/features/regulations/engine';

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      parcelPnu: true,
      bidStartDate: true,
      bidEndDate: true,
      appraisalValue: true,
      minBidPrice: true,
      parcelArea: true,
      maxCoverageRatio: true,
      maxFloorAreaRatio: true,
      totalModules: true,
      totalArea: true,
      totalCost: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // 필지 정보가 없는 프로젝트에 대해 백필
  const toBackfill = projects.filter((p) => p.parcelPnu && p.parcelArea === 0);
  if (toBackfill.length > 0) {
    await Promise.allSettled(
      toBackfill.map(async (p) => {
        try {
          const parcel = await getParcelByPnu(p.parcelPnu!);
          if (!parcel || !parcel.area) return;
          const zoneType = parcel.centroidLat && parcel.centroidLng
            ? await getLandUseZone(parcel.centroidLat, parcel.centroidLng)
            : null;
          const reg = calculateRegulations({
            area: parcel.area,
            zoneType: zoneType ?? parcel.zoneType ?? 'ZONE_R2_GENERAL',
          });
          const data = {
            parcelArea: parcel.area,
            maxCoverageRatio: reg.zoneRegulation.maxCoverageRatio,
            maxFloorAreaRatio: reg.zoneRegulation.maxFloorAreaRatio,
          };
          await prisma.project.update({ where: { id: p.id }, data });
          Object.assign(p, data);
        } catch { /* 실패 시 무시 — 다음 요청에서 재시도 */ }
      })
    );
  }

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
