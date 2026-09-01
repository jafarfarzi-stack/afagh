import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms,
  classrooms,
  course_offerings,
  courses,
  degree_level_configs,
  educational_regulations,
  enrollments,
  majors,
  schedules,
  staff,
  users,
} from '@/db/schema';
import { getStudentByUser, requireRole } from '@/lib/auth';
import Link from 'next/link';
import ScheduleClient from './ScheduleClient';

export const dynamic = 'force-dynamic';

const DAY_NAMES = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];

export default async function StudentSchedulePage() {
  const user = await requireRole(['STUDENT']);
  const me = await getStudentByUser(user.id);
  if (!me) return <p className="card p-6 text-center text-slate-500">پروندهٔ دانشجویی یافت نشد.</p>;

  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1));
  const [major] = me.majorId ? await db.select().from(majors).where(eq(majors.id, me.majorId)).limit(1) : [null];
  const [degree] = me.degreeLevelId ? await db.select().from(degree_level_configs).where(eq(degree_level_configs.id, me.degreeLevelId)).limit(1) : [null];

  // دریافت دروس ثبت‌نام‌شده و قطعی دانشجو در ترم جاری
  const studentEnrollments = term
    ? await db
        .select({
          enrollmentId: enrollments.id,
          offeringId: enrollments.offeringId,
          status: enrollments.status,
          gradeValue: enrollments.gradeValue,
          courseId: course_offerings.courseId,
          code: courses.code,
          title: courses.title,
          units: courses.units,
          courseType: courses.courseType,
          group: course_offerings.groupNumber,
          professorId: course_offerings.professorId,
        })
        .from(enrollments)
        .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
        .innerJoin(courses, eq(courses.id, course_offerings.courseId))
        .where(
          and(
            eq(enrollments.studentId, me.id),
            eq(course_offerings.termId, term.id),
            inArray(enrollments.status, ['REGISTERED', 'FINALIZED', 'WAITLISTED', 'PENDING_COUNCIL'])
          )
        )
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

  // دریافت برنامه زمانی و اتاق‌های کلاسی
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
          buildingName: classrooms.buildingName,
        })
        .from(schedules)
        .leftJoin(classrooms, eq(classrooms.id, schedules.roomId))
    : [];

  const schedMap = new Map<
    number,
    {
      classes: { dayOfWeek: number; dayName: string; startTime: string; endTime: string; room: string; building?: string }[];
      exam?: { examDate: string; startTime: string; endTime: string; room?: string };
    }
  >();

  for (const s of rawSchedules) {
    if (!schedMap.has(s.offeringId)) schedMap.set(s.offeringId, { classes: [] });
    const entry = schedMap.get(s.offeringId)!;

    if (s.scheduleType === 'CLASS' && s.dayOfWeek != null) {
      entry.classes.push({
        dayOfWeek: s.dayOfWeek,
        dayName: DAY_NAMES[s.dayOfWeek] || `روز ${s.dayOfWeek}`,
        startTime: s.startTime.slice(0, 5),
        endTime: s.endTime.slice(0, 5),
        room: s.roomName || 'کلاس تئوری',
        building: s.buildingName || undefined,
      });
    } else if (s.scheduleType === 'EXAM' && s.examDate) {
      entry.exam = {
        examDate: String(s.examDate),
        startTime: s.startTime.slice(0, 5),
        endTime: s.endTime.slice(0, 5),
        room: s.roomName || 'سالن امتحانات مرکزی',
      };
    }
  }

  const coursesList = studentEnrollments.map(e => {
    const s = schedMap.get(e.offeringId);
    return {
      enrollmentId: e.enrollmentId,
      offeringId: e.offeringId,
      code: e.code,
      title: e.title,
      units: Number(e.units || 0),
      courseType: e.courseType || 'تخصصی',
      group: e.group,
      status: e.status,
      professor: e.professorId ? profMap.get(e.professorId) || 'نامشخص' : 'نامشخص',
      classes: s?.classes || [],
      exam: s?.exam || null,
    };
  });

  return (
    <ScheduleClient
      student={{
        name: `${user.name}`,
        studentCode: me.studentCode,
        majorName: major?.name || 'مهندسی کامپیوتر',
        degreeTitle: degree?.title || 'کارشناسی پیوسته',
        currentTermNo: me.currentTermNo || 1,
        entryYear: me.entryYear,
      }}
      term={{
        title: term?.title || 'نیمسال اول ۱۴۰۵-۱۴۰۶',
        termCode: term?.termCode || '1051',
      }}
      courses={coursesList}
    />
  );
}
