import { NextResponse } from 'next/server';
import { eq, and, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms, course_offerings, students } from '@/db/schema';
import { getSessionUser } from '@/lib/auth';
import { peekCapacities } from '@/lib/waitingRoom';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // ترم جاریِ دانشگاهِ خود دانشجو (نه ترم جاریِ دانشگاه دیگر)
  const [stu] = await db.select({ universityId: students.universityId })
    .from(students).where(eq(students.userId, user.id)).limit(1);
  const termScope = stu?.universityId != null
    ? or(eq(academic_terms.universityId, stu.universityId), isNull(academic_terms.universityId))
    : undefined;
  const [term] = await db.select().from(academic_terms)
    .where(and(eq(academic_terms.isCurrent, 1), termScope));
  if (!term) return NextResponse.json({});
  const rows = await db.select({ id: course_offerings.id }).from(course_offerings)
    .where(and(eq(course_offerings.termId, term.id), eq(course_offerings.isActive, 1)));
  return NextResponse.json(await peekCapacities(rows.map(r => r.id)));
}
