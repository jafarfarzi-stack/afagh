import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/db';
import { majors } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';

export async function GET() {
  const user = await getSessionUser();
  if (!user || (!user.roles.includes('ADMIN') && !user.roles.includes('EDU_EXPERT'))) {
    return NextResponse.json({ majors: [] }, { status: 403 });
  }
  const rows = await db
    .select({ id: majors.id, code: majors.majorCode, name: majors.name })
    .from(majors)
    .where(eq(majors.isActive, 1))
    .orderBy(asc(majors.majorCode));
  return NextResponse.json({ majors: rows });
}
