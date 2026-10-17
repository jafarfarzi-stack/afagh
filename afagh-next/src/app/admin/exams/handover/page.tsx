import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { course_offerings, courses, exam_sessions, instructor_deliveries, staff, users } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { currentTermFor, termsFor } from '@/lib/terms';
import HandoverClient, { type ChainSession, type DeliveryRow } from './HandoverClient';

export const dynamic = 'force-dynamic';

/**
 * زنجیرهٔ تحویل اوراق امتحان — رابط ارسال‌کننده (مراقب/مخزن/استاد).
 *
 * هر مرحله یک «QR تحویل» دارد که تحویلگیرنده اسکن می‌کند و در صفحهٔ
 * `/exam-handover/<token>` با هویت خودش تأیید می‌کند:
 *   ▸ مراقب → مخزن (دریافت سالن)   ▸ نهایی‌سازی تحویل جلسه
 *   ▸ مخزن → استاد (تحویل اوراق)   ▸ استاد → بایگانی (شرط پرداخت حق‌الزحمه)
 */
export default async function ExamHandoverPage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string }>;
}) {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'VAULT_MANAGER', 'PROCTOR']);
  const uni = await getCurrentUniversity().catch(() => null);
  const sp = await searchParams;

  const terms = await termsFor(uni?.id ?? null).catch(() => []);
  const active = await currentTermFor(uni?.id ?? null).catch(() => null);
  const wanted = Number(sp?.term ?? 0);
  const term = terms.find(t => t.id === wanted) ?? active ?? terms[terms.length - 1] ?? null;

  const sessions: ChainSession[] = term
    ? (await db
        .select({
          sessionId: exam_sessions.id,
          examDate: exam_sessions.examDate,
          startTime: exam_sessions.startTime,
          endTime: exam_sessions.endTime,
          hallId: sql<number | null>`(select sa."hallId" from seat_allocations sa where sa."sessionId" = ${exam_sessions.id} limit 1)`,
          hallName: sql<string | null>`(select h.name from seat_allocations sa join exam_halls h on h.id = sa."hallId" where sa."sessionId" = ${exam_sessions.id} limit 1)`,
          present: sql<number>`(select count(*) from exam_attendances ea where ea."examId" = ${exam_sessions.id} and ea."isPresent" = 1)::int`,
          total: sql<number>`(select count(*) from exam_attendances ea where ea."examId" = ${exam_sessions.id})::int`,
          minutesSigned: sql<number>`(select count(*) from exam_minutes m where m."sessionId" = ${exam_sessions.id} and m."isSignedAndFinalized" = 1)::int`,
          vaultReceived: sql<number>`(select count(*) from exam_minutes m where m."sessionId" = ${exam_sessions.id} and m."vaultReceivedAt" is not null)::int`,
          packets: sql<number>`(select count(*) from exam_course_packets p where p."examId" = ${exam_sessions.id})::int`,
        })
        .from(exam_sessions)
        .where(and(
          eq(exam_sessions.termId, term.id),
          uni ? eq(exam_sessions.universityId, uni.id) : undefined,
        ))
        .orderBy(desc(exam_sessions.examDate))
        .limit(120))
      .map(r => ({
        sessionId: r.sessionId,
        examDate: String(r.examDate ?? ''),
        time: `${r.startTime ?? ''}–${r.endTime ?? ''}`,
        hallId: r.hallId ?? null,
        hallName: r.hallName ?? '—',
        present: Number(r.present ?? 0),
        total: Number(r.total ?? 0),
        minutesSigned: Number(r.minutesSigned ?? 0),
        vaultReceived: Number(r.vaultReceived ?? 0),
        packets: Number(r.packets ?? 0),
      }))
    : [];

  const deliveries: DeliveryRow[] = term
    ? (await db
        .select({
          deliveryId: instructor_deliveries.id,
          offeringId: instructor_deliveries.courseOfferingId,
          status: instructor_deliveries.status,
          sheetCount: instructor_deliveries.sheetCount,
          returnedToArchive: instructor_deliveries.papersReturnedToArchive,
          returnedAt: instructor_deliveries.returnedAt,
          courseCode: courses.code,
          courseTitle: courses.title,
          professorName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
        })
        .from(instructor_deliveries)
        .innerJoin(course_offerings, eq(course_offerings.id, instructor_deliveries.courseOfferingId))
        .innerJoin(courses, eq(courses.id, course_offerings.courseId))
        .leftJoin(staff, eq(staff.id, instructor_deliveries.instructorId))
        .leftJoin(users, eq(users.id, staff.userId))
        .where(and(
          eq(course_offerings.termId, term.id),
          uni ? eq(course_offerings.universityId, uni.id) : undefined,
        ))
        .orderBy(desc(instructor_deliveries.id))
        .limit(120))
      .map(r => ({
        deliveryId: r.deliveryId,
        offeringId: r.offeringId,
        status: String(r.status ?? ''),
        sheetCount: Number(r.sheetCount ?? 0),
        returnedToArchive: Number(r.returnedToArchive ?? 0) === 1,
        returnedAt: r.returnedAt ? r.returnedAt.toISOString() : null,
        courseCode: r.courseCode,
        courseTitle: r.courseTitle,
        professorName: r.professorName ?? '—',
      }))
    : [];

  return (
    <HandoverClient
      terms={terms.map(t => ({ id: t.id, title: t.title, termCode: t.termCode, isActive: t.id === (active?.id ?? -1) }))}
      termId={term?.id ?? 0}
      termTitle={term?.title ?? '—'}
      sessions={sessions}
      deliveries={deliveries}
    />
  );
}
