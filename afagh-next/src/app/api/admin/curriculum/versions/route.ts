import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/db';
import { curriculum_versions } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    await requireRole(['ADMIN', 'EDU_EXPERT']);
    const majorId = Number(req.nextUrl.searchParams.get('majorId'));
    if (!majorId) return NextResponse.json({ versions: [] });
    const rows = await db
      .select({
        id: curriculum_versions.id,
        versionCode: curriculum_versions.versionCode,
        title: curriculum_versions.title,
        status: curriculum_versions.status,
        majorId: curriculum_versions.majorId,
        entryYearFrom: curriculum_versions.entryYearFrom,
        entryYearTo: curriculum_versions.entryYearTo,
      })
      .from(curriculum_versions)
      .where(eq(curriculum_versions.majorId, majorId))
      .orderBy(desc(curriculum_versions.entryYearFrom));
    return NextResponse.json({ versions: rows });
  } catch {
    return NextResponse.json({ versions: [] });
  }
}
