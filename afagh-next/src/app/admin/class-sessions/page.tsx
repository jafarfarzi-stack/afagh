import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms, class_sessions, classrooms, course_offerings, courses, staff, users,
} from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { currentTermFor, termsFor } from '@/lib/terms';
import ClassSessionsClient, { type OfferingRow, type SessionRow } from './ClassSessionsClient';

export const dynamic = 'force-dynamic';

/**
 * «مدیریت جلسات درس» — همان جای پیش‌بینی‌شده که تا امروز فقط یک کاشیِ بی‌مقصد بود.
 *
 * کارکرد (مطابق فرم قدیم «انتخاب درس و برنامه هفتگی»):
 *   ▸ انتخاب نیمسال و درس (با جست‌وجوی کد/نام درس یا نام استاد)
 *   ▸ جدول جلسات درس: شماره، تاریخ، ساعت، سالن، وضعیت، جبرانی، و سه پرچم
 *     «تعطیل / فوق‌برنامه / فعال» (قابل تغییر) + سه مهر زمانی ممیزی
 *   ▸ دکمهٔ «لیست دانشجویان» که به گزارش حضور و غیاب همان درس می‌رود
 */
export default async function ClassSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string; offeringId?: string; q?: string }>;
}) {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'DEP_HEAD']);
  const uni = await getCurrentUniversity().catch(() => null);
  const sp = await searchParams;

  const terms = await termsFor(uni?.id ?? null).catch(() => []);
  const active = await currentTermFor(uni?.id ?? null).catch(() => null);
  const wanted = Number(sp?.term ?? 0);
  const term = terms.find(t => t.id === wanted) ?? active ?? terms[terms.length - 1] ?? null;

  const q = (sp?.q ?? '').trim();
  const like = `%${q}%`;

  const offerings: OfferingRow[] = term
    ? (await db
        .select({
          id: course_offerings.id,
          code: courses.code,
          title: courses.title,
          groupNumber: course_offerings.groupNumber,
          professorName: sql<string | null>`(${users.firstName} || ' ' || ${users.lastName})`,
          staffCode: staff.staffCode,
          sessionCount: sql<number>`(select count(*) from class_sessions cs where cs."offeringId" = ${course_offerings.id})::int`,
          holidayCount: sql<number>`(select count(*) from class_sessions cs where cs."offeringId" = ${course_offerings.id} and cs."isHoliday" = 1)::int`,
        })
        .from(course_offerings)
        .innerJoin(courses, eq(courses.id, course_offerings.courseId))
        .leftJoin(staff, eq(staff.id, course_offerings.professorId))
        .leftJoin(users, eq(users.id, staff.userId))
        .where(and(
          eq(course_offerings.termId, term.id),
          uni ? eq(course_offerings.universityId, uni.id) : undefined,
          q
            ? or(
                ilike(courses.code, like),
                ilike(courses.title, like),
                ilike(staff.staffCode, like),
                ilike(users.lastName, like),
              )
            : undefined,
        ))
        .orderBy(asc(courses.code), asc(course_offerings.groupNumber))
        .limit(400))
    : [];

  const requestedOffering = Number(sp?.offeringId ?? 0) || 0;
  const selected = offerings.find(o => o.id === requestedOffering) ?? offerings[0] ?? null;

  const rawSessions = selected
    ? await db
        .select({
          id: class_sessions.id,
          sessionNo: class_sessions.sessionNo,
          sessionDate: class_sessions.sessionDate,
          startTime: class_sessions.startTime,
          endTime: class_sessions.endTime,
          status: class_sessions.status,
          isMakeUp: class_sessions.isMakeUpSession,
          isHoliday: class_sessions.isHoliday,
          isExtraSession: class_sessions.isExtraSession,
          isActive: class_sessions.isActive,
          createdAt: class_sessions.createdAt,
          professorViewedAt: class_sessions.professorViewedAt,
          updatedAt: class_sessions.updatedAt,
          roomName: classrooms.name,
          topic: class_sessions.topic,
        })
        .from(class_sessions)
        .leftJoin(classrooms, eq(classrooms.id, class_sessions.roomId))
        .where(eq(class_sessions.offeringId, selected.id))
        .orderBy(asc(class_sessions.sessionNo), asc(class_sessions.sessionDate))
        .limit(400)
    : [];
  const sessions: SessionRow[] = rawSessions.map(s => ({
    ...s,
    sessionDate: String(s.sessionDate ?? ''),
    createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : null,
    professorViewedAt: s.professorViewedAt ? new Date(s.professorViewedAt).toISOString() : null,
    updatedAt: s.updatedAt ? new Date(s.updatedAt).toISOString() : null,
  }));

  return (
    <ClassSessionsClient
      terms={terms.map(t => ({ id: t.id, title: t.title, termCode: t.termCode, isActive: t.id === (active?.id ?? -1) }))}
      termId={term?.id ?? 0}
      termCode={term?.termCode ?? ''}
      termTitle={term?.title ?? '—'}
      query={q}
      offerings={offerings.map(o => ({ ...o, professorName: o.professorName ?? null }))}
      selectedOfferingId={selected?.id ?? 0}
      sessions={sessions}
    />
  );
}
