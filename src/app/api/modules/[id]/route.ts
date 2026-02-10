import { NextRequest, NextResponse } from 'next/server';
import { getModuleById } from '@/lib/constants/modules';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const module = getModuleById(id);

  if (!module) {
    return NextResponse.json(
      { error: '모듈을 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  return NextResponse.json(module);
}
