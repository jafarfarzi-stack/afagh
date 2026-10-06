import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/db';
import { majors } from '@/db/schema';
import { asc, eq, or, isNull, and } from 'drizzle-orm';
import { getCurrentUniversity } from '@/lib/university-scope';

export async function GET() {
  const user = await getSessionUser();
  if (!user || (!user.roles.includes('ADMIN') && !user.roles.includes('EDU_EXPERT'))) {
    return NextResponse.json({ majors: [] }, { status: 403 });
  }
  const uni = await getCurrentUniversity().catch(() => null);
  const uw = uni ? or(eq(majors.universityId, uni.id), isNull(majors.universityId)) : undefined;
  const rows = await db
    .select({ id: majors.id, code: majors.majorCode, name: majors.name })
    .from(majors)
    .where(and(eq(majors.isActive, 1), uw))
    .orderBy(asc(majors.majorCode));
  return NextResponse.json({ majors: rows });
}
