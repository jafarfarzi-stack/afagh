import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms,
  cart_items,
  classrooms,
  course_offerings,
  courses,
  enrollments,
  schedules,
  staff,
  users,
} from '@/db/schema';
import { getStudentByUser, requireRole } from '@/lib/auth';
import { buildPrereqContext, formatPrereq } from '@/lib/enroll-engine';
import { evaluateStudentRegulationStatus, type StudentAcademicSummary } from '@/lib/regulations-engine';
import { getSetting } from '@/lib/settings';
import EnrollClient from './EnrollClient';

export const dynamic = 'force-dynamic';

const DAY_NAMES = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];

export default async function EnrollPage() {
  const user = await requireRole(['STUDENT']);
  const me = await getStudentByUser(user.id);
  if (!me) return <p className="card">پروندهٔ دانشجویی یافت نشد.</p>;

  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1));

  let regulationStatus: StudentAcademicSummary | null = null;
  try {
    regulationStatus = await evaluateStudentRegulationStatus(me.id, term?.id);
  } catch (err) {
    console.warn('Error evaluating regulation status in enroll page:', err);
  }

  // دریافت تمام ارائه‌های فعال ترم جاری
  const rawOfferings = term
    ? await db
        .select({
          id: course_offerings.id,
          courseId: course_offerings.courseId,
          code: courses.code,
          title: courses.title,
          units: courses.units,
          capacity: course_offerings.capacity,
          enrolled: course_offerings.enrolledCount,
          group: course_offerings.groupNumber,
          professorId: course_offerings.professorId,
        })
        .from(course_offerings)
        .innerJoin(courses, eq(courses.id, course_offerings.courseId))
        .where(and(eq(course_offerings.termId, term.id), eq(course_offerings.isActive, 1)))
    : [];

  // دریافت اطلاعات اساتید
  const profUsers = await db
    .select({
      staffId: staff.id,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(staff)
    .innerJoin(users, eq(users.id, staff.userId));

  const profMap = new Map<number, string>();
  for (const p of profUsers) {
    profMap.set(p.staffId, `${p.firstName || ''} ${p.lastName || ''}`.trim());
  }

  // دریافت زمان‌بندی کلاس‌ها و امتحانات
  const rawSchedules = term
    ? await db
        .select({
          offeringId: schedules.offeringId,
          scheduleType: schedules.scheduleType,
          dayOfWeek: schedules.dayOfWeek,
          examDate: schedules.examDate,
          startTime: schedules.startTime,
          endTime: schedules.endTime,
          roomName: classrooms.name,
        })
        .from(schedules)
        .leftJoin(classrooms, eq(classrooms.id, schedules.roomId))
    : [];

  const schedMap = new Map<
    number,
    {
      classes: { dayOfWeek: number; dayName: string; startTime: string; endTime: string; room?: string }[];
      exam?: { examDate: string; startTime: string; endTime: string };
    }
  >();

  for (const s of rawSchedules) {
    if (!schedMap.has(s.offeringId)) {
      schedMap.set(s.offeringId, { classes: [] });
    }
    const entry = schedMap.get(s.offeringId)!;

    if (s.scheduleType === 'CLASS' && s.dayOfWeek != null) {
      entry.classes.push({
        dayOfWeek: s.dayOfWeek,
        dayName: DAY_NAMES[s.dayOfWeek] || `روز ${s.dayOfWeek}`,
        startTime: s.startTime.slice(0, 5),
        endTime: s.endTime.slice(0, 5),
        room: s.roomName || undefined,
      });
    } else if (s.scheduleType === 'EXAM' && s.examDate) {
      entry.exam = {
        examDate: String(s.examDate),
        startTime: s.startTime.slice(0, 5),
        endTime: s.endTime.slice(0, 5),
      };
    }
  }

  // برچسب پیش‌نیاز هر درس از قاعدهٔ مؤثر دانشجو
  const prereqCtx = await buildPrereqContext(me.id);
  const prereqLabel = new Map<number, string>();
  for (const o of rawOfferings) {
    const lbl = formatPrereq(prereqCtx.ruleByCourse.get(o.courseId ?? -1), prereqCtx.titles);
    if (lbl) prereqLabel.set(o.id, lbl);
  }

  // سبد جاری دانشجو
  const cart = await db.select().from(cart_items).where(eq(cart_items.studentId, me.id));
  const cartOfferingIds = cart.map(c => c.offeringId);
  const cartCourses = cartOfferingIds.length
    ? await db
        .select({
          id: course_offerings.id,
          courseId: course_offerings.courseId,
          code: courses.code,
          title: courses.title,
          units: courses.units,
          group: course_offerings.groupNumber,
        })
        .from(course_offerings)
        .innerJoin(courses, eq(courses.id, course_offerings.courseId))
        .where(inArray(course_offerings.id, cartOfferingIds))
    : [];

  const offerings = rawOfferings.map(o => {
    const s = schedMap.get(o.id);
    return {
      ...o,
      units: Number(o.units),
      professor: o.professorId ? profMap.get(o.professorId) || 'نامشخص' : 'نامشخص',
      prereq: prereqLabel.get(o.id) ?? null,
      classSchedules: s?.classes || [],
      examSchedule: s?.exam || null,
    };
  });

  const cartList = cartCourses.map(c => {
    const s = schedMap.get(c.id);
    return {
      id: c.id,
      courseId: c.courseId,
      code: c.code,
      title: c.title,
      units: Number(c.units),
      group: c.group,
      classSchedules: s?.classes || [],
      examSchedule: s?.exam || null,
    };
  });

  return (
    <EnrollClient
      sajjadPortalUrl={await getSetting('SAJJAD_PORTAL_URL')}
      student={{ id: me.id, status: me.status }}
      term={{ id: term?.id ?? null, title: term?.title ?? '', open: !!term?.isEnrollmentOpen, isSummer: !!term?.isSummer }}
      offerings={offerings}
      cart={cartList}
      cartStartedAt={cart.length ? cart.map(c => c.createdAt?.getTime?.() ?? 0).filter(Boolean).sort((a, b) => a - b)[0] || null : null}
      regulationStatus={regulationStatus}
    />
  );
}
