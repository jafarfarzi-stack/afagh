import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/db';
import { majors } from '@/db/schema';
import { asc } from 'drizzle-orm';

export async function GET() {
  try {
    await requireRole(['ADMIN', 'EDU_EXPERT']);
    const rows = await db
      .select({ id: majors.id, code: majors.code, name: majors.name })
      .from(majors)
      .orderBy(asc(majors.code));
    return NextResponse.json({ majors: rows });
  } catch {
    return NextResponse.json({ majors: [] });
  }
}
