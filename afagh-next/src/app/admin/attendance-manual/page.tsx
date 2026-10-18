import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { class_sessions, course_offerings, courses, professor_class_attendance, staff, users } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { currentTermFor, termsFor } from '@/lib/terms';
import ManualAttendanceClient, { type ManualRow } from './ManualAttendanceClient';

export const dynamic = 'force-dynamic';

const faNum = (v: unknown) =>
  v === null || v === undefined || v === '' ? '—' : String(v).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

/**
 * رابط مجزای «تأیید دستی حضور استاد» برای کارشناس آموزش.
 *
 * اثر انگشت خودکار است، ولی وقتی دستگاه ثبت نکرده باشد کارشناس باید بتواند
 * حضور همان جلسه را دستی تأیید کند. این صفحه فقط جلسه‌های یک نیمسال را نشان
 * می‌دهد (پیش‌فرض: نیمسال فعال) با وضعیت ثبت‌شده و دکمهٔ تأیید/لغو.
 */
export default async function ManualAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string }>;
}) {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  const uni = await getCurrentUniversity().catch(() => null);
  const sp = await searchParams;

  const terms = await termsFor(uni?.id ?? null).catch(() => []);
  const active = await currentTermFor(uni?.id ?? null).catch(() => null);
  const wanted = Number(sp?.term ?? 0);
  const term = terms.find(t => t.id === wanted) ?? active ?? terms[terms.length - 1] ?? null;

  const rows: ManualRow[] = term
    ? (await db
        .select({
          sessionId: class_sessions.id,
          sessionNo: class_sessions.sessionNo,
          sessionDate: class_sessions.sessionDate,
          startTime: class_sessions.startTime,
          endTime: class_sessions.endTime,
          isMakeUp: class_sessions.isMakeUpSession,
          isHoliday: class_sessions.isHoliday,
          isExtraSession: class_sessions.isExtraSession,
          sessionStatus: class_sessions.status,
          courseCode: courses.code,
          courseTitle: courses.title,
          staffId: course_offerings.professorId,
          professorName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
          recordedMethod: professor_class_attendance.verificationMethod,
          recordedStatus: professor_class_attendance.status,
          recordedNote: professor_class_attendance.note,
          punches: sql<number>`(select count(*) from physical_access_logs pal where pal."staffId" = ${course_offerings.professorId} and pal."punchTime"::date = ${class_sessions.sessionDate}::date)::int`,
        })
        .from(class_sessions)
        .innerJoin(course_offerings, eq(course_offerings.id, class_sessions.offeringId))
        .innerJoin(courses, eq(courses.id, course_offerings.courseId))
        .leftJoin(staff, eq(staff.id, course_offerings.professorId))
        .leftJoin(users, eq(users.id, staff.userId))
        .leftJoin(professor_class_attendance, and(
          eq(professor_class_attendance.sessionId, class_sessions.id),
          eq(professor_class_attendance.staffId, course_offerings.professorId),
        ))
        .where(and(
          eq(course_offerings.termId, term.id),
          uni ? eq(course_offerings.universityId, uni.id) : undefined,
        ))
        .orderBy(desc(class_sessions.sessionDate), asc(class_sessions.startTime))
        .limit(400))
      .map(r => ({
        sessionId: r.sessionId,
        sessionNo: Number(r.sessionNo ?? 0),
        sessionDate: String(r.sessionDate ?? ''),
        time: `${r.startTime ?? ''}–${r.endTime ?? ''}`,
        isMakeUp: Number(r.isMakeUp ?? 0) === 1,
        isHoliday: Number(r.isHoliday ?? 0) === 1,
        isExtraSession: Number(r.isExtraSession ?? 0) === 1,
        sessionStatus: String(r.sessionStatus ?? 'SCHEDULED'),
        courseCode: r.courseCode,
        courseTitle: r.courseTitle,
        staffId: r.staffId ?? null,
        professorName: r.professorName ?? '—',
        method: r.recordedMethod ?? null,
        status: r.recordedStatus ?? null,
        note: r.recordedNote ?? null,
        punches: Number(r.punches ?? 0),
      }))
    : [];

  return (
    <ManualAttendanceClient
      terms={terms.map(t => ({ id: t.id, title: t.title, termCode: t.termCode, isCurrent: !!t.isCurrent, isActive: t.id === (active?.id ?? -1) }))}
      termId={term?.id ?? 0}
      termTitle={term?.title ?? '—'}
      rows={rows}
    />
  );
}
