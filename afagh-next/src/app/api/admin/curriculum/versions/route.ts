import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/db';
import { curriculum_versions } from '@/db/schema';
import { eq, desc, or, isNull, and } from 'drizzle-orm';
import { getCurrentUniversity } from '@/lib/university-scope';

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || (!user.roles.includes('ADMIN') && !user.roles.includes('EDU_EXPERT'))) {
    return NextResponse.json({ versions: [] }, { status: 403 });
  }
  const majorId = Number(req.nextUrl.searchParams.get('majorId'));
  if (!majorId) return NextResponse.json({ versions: [] });
  const uni = await getCurrentUniversity().catch(() => null);
  const uw = uni ? or(eq(curriculum_versions.universityId, uni.id), isNull(curriculum_versions.universityId)) : undefined;
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
    .where(and(eq(curriculum_versions.majorId, majorId), uw))
    .orderBy(desc(curriculum_versions.entryYearFrom));
  return NextResponse.json({ versions: rows });
}
