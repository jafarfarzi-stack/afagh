import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/db';
import { departments } from '@/db/schema';
import { asc, eq, or, isNull } from 'drizzle-orm';
import { getCurrentUniversity } from '@/lib/university-scope';

const ALLOWED = ['ADMIN', 'EDU_EXPERT', 'VICE_EDU'];

export async function GET() {
  const user = await getSessionUser();
  if (!user || !user.roles.some(r => ALLOWED.includes(r))) {
    return NextResponse.json({ departments: [] }, { status: 403 });
  }
  const uni = await getCurrentUniversity().catch(() => null);
  const uw = uni ? or(eq(departments.universityId, uni.id), isNull(departments.universityId)) : undefined;
  const rows = await db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(uw)
    .orderBy(asc(departments.name));
  return NextResponse.json({ departments: rows });
}
