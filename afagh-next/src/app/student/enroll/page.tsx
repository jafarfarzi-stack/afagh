import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms, cart_items, classrooms, course_offerings, courses, enrollments, schedules } from '@/db/schema';
import { getStudentByUser, requireRole } from '@/lib/auth';
import { buildPrereqContext, formatPrereq } from '@/lib/enroll-engine';
import { windowStatus } from '@/lib/enrollment-window';
import { offeringVisible } from '@/lib/offering-targeting';
import EnrollClient from './EnrollClient';

export const dynamic = 'force-dynamic';

export default async function EnrollPage() {
  const user = await requireRole(['STUDENT']);
  const me = await getStudentByUser(user.id);
  if (!me) return <p className="card">پروندهٔ دانشجویی یافت نشد.</p>;

  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1));
  const allOfferings = term
    ? await db
        .select({ id: course_offerings.id, courseId: course_offerings.courseId, code: courses.code, title: courses.title, units: courses.units, capacity: course_offerings.capacity, enrolled: course_offerings.enrolledCount, group: course_offerings.groupNumber, targetDegreeLevelId: course_offerings.targetDegreeLevelId, targetMajorId: course_offerings.targetMajorId, entryYearStart: course_offerings.entryYearStart, entryYearEnd: course_offerings.entryYearEnd })
        .from(course_offerings).innerJoin(courses, eq(courses.id, course_offerings.courseId))
        .where(and(eq(course_offerings.termId, term.id), eq(course_offerings.isActive, 1)))
    : [];
  // هدف‌گیری: فقط ارائه‌های منطبق با مقطع/رشته/ورودی دانشجو (ارشد درس کارشناسی را نمی‌بیند…)
  const offerings = allOfferings.filter(o => offeringVisible(o, { degreeLevelId: me.degreeLevelId, majorId: me.majorId, entryYear: me.entryYear }));
  const win = windowStatus(term);

  // برچسب پیش‌نیاز هر درس از قاعدهٔ مؤثر دانشجو (سیلابسی مقدم بر عمومی)
  const prereqCtx = await buildPrereqContext(me.id);
  const prereqLabel = new Map<number, string>();
  for (const o of offerings) {
    const lbl = formatPrereq(prereqCtx.ruleByCourse.get(o.courseId ?? -1), prereqCtx.titles);
    if (lbl) prereqLabel.set(o.id, lbl);
  }

  // برنامهٔ هفتگی و نام کلاس برای هر ارائه (تعریف‌شده توسط مدیر گروه)
  const DAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
  const schedRows = offerings.length
    ? await db
        .select({ offeringId: schedules.offeringId, day: schedules.dayOfWeek, st: schedules.startTime, en: schedules.endTime, room: classrooms.name })
        .from(schedules).leftJoin(classrooms, eq(classrooms.id, schedules.roomId))
        .where(and(inArray(schedules.offeringId, offerings.map(o => o.id)), eq(schedules.scheduleType, 'CLASS')))
    : [];
  const schedLabel = new Map<number, string>();
  for (const r of schedRows) {
    const lbl = DAYS[r.day ?? 0] + ' ' + String(r.st).slice(0, 5) + '–' + String(r.en).slice(0, 5) + (r.room ? ' · ' + r.room : '');
    schedLabel.set(r.offeringId, (schedLabel.get(r.offeringId) ? schedLabel.get(r.offeringId) + '، ' : '') + lbl);
  }

  const cart = await db.select().from(cart_items).where(eq(cart_items.studentId, me.id));
  const cartOfferingIds = cart.map(c => c.offeringId);
  const cartCourses = cartOfferingIds.length
    ? await db.select({ id: course_offerings.id, code: courses.code, title: courses.title, units: courses.units })
        .from(course_offerings).innerJoin(courses, eq(courses.id, course_offerings.courseId))
        .where(inArray(course_offerings.id, cartOfferingIds))
    : [];

  return (
    <EnrollClient
      student={{ id: me.id, status: me.status }}
      term={{ id: term?.id ?? null, title: term?.title ?? '', open: win.open, windowLabel: win.label }}
      offerings={offerings.map(o => ({ ...o, units: Number(o.units), prereq: prereqLabel.get(o.id) ?? null, sched: schedLabel.get(o.id) ?? null }))}
      cart={cartCourses.map(c => ({ ...c, units: Number(c.units) }))}
      cartStartedAt={cart.length ? cart.map(c => c.createdAt?.getTime?.() ?? 0).filter(Boolean).sort((a, b) => a - b)[0] || null : null}
    />
  );
}
