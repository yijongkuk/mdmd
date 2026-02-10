import { NextRequest, NextResponse } from 'next/server';
import { MODULE_CATALOG, MODULES_BY_CATEGORY } from '@/lib/constants/modules';
import type { ModuleCategory } from '@/types/builder';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get('category') as ModuleCategory | null;

  if (category && category in MODULES_BY_CATEGORY) {
    return NextResponse.json({ modules: MODULES_BY_CATEGORY[category] });
  }

  return NextResponse.json({ modules: MODULE_CATALOG });
}
