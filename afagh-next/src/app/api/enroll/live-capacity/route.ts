import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms, course_offerings } from '@/db/schema';
import { getSessionUser } from '@/lib/auth';
import { peekCapacities } from '@/lib/waitingRoom';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1));
  if (!term) return NextResponse.json({});
  const rows = await db.select({ id: course_offerings.id }).from(course_offerings)
    .where(and(eq(course_offerings.termId, term.id), eq(course_offerings.isActive, 1)));
  return NextResponse.json(await peekCapacities(rows.map(r => r.id)));
}
