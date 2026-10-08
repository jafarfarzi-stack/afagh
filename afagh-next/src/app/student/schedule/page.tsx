import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms,
  classrooms,
  course_offerings,
  courses,
  degree_level_configs,
  enrollments,
  majors,
  schedules,
  staff,
  universities,
  users,
} from '@/db/schema';
import { getStudentByUser, requireRole } from '@/lib/auth';
import { getTermScope } from '@/lib/term-scope';
import { getCurrentUniversity } from '@/lib/university-scope';
import TermFilterChip from '@/components/TermFilterChip';
import ScheduleClient, { type StudentScheduleCourse } from './ScheduleClient';

export const dynamic = 'force-dynamic';

const DAY_NAMES = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];

type StudentWeekType = 'ALL' | 'EVEN' | 'ODD';

function classWeekType(scheduleType: string | null | undefined): StudentWeekType {
  const v = String(scheduleType ?? '').toUpperCase();
  if (v === 'EVEN') return 'EVEN';
  if (v === 'ODD') return 'ODD';
  return 'ALL';
}

export default async function StudentSchedulePage() {
  const user = await requireRole(['STUDENT']);
  const me = await getStudentByUser(user.id);
  if (!me) return <p className="card p-6 text-center text-slate-500">پروندهٔ دانشجویی یافت نشد.</p>;

  const termScope = await getTermScope(me.universityId);
  const filteredTerm = termScope.selectedId
    ? termScope.terms.find(t => t.id === termScope.selectedId) ?? null
    : null;
  const term = filteredTerm
    ? ((await db.select().from(academic_terms).where(eq(academic_terms.id, filteredTerm.id)).limit(1))[0] ?? null)
    : ((await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1)))[0] ?? null);
  const [major] = me.majorId ? await db.select().from(majors).where(eq(majors.id, me.majorId)).limit(1) : [null];
  const [degree] = me.degreeLevelId ? await db.select().from(degree_level_configs).where(eq(degree_level_configs.id, me.degreeLevelId)).limit(1) : [null];

  const [studentUniversity] = me.universityId
    ? await db
        .select({ title: universities.title, logoUrl: universities.logoUrl })
        .from(universities)
        .where(eq(universities.id, me.universityId))
        .limit(1)
    : [null];
  const currentUniversity = studentUniversity ? null : await getCurrentUniversity().catch(() => null);
  const universityTitle = studentUniversity?.title ?? currentUniversity?.title ?? 'دانشگاه آفاق ارومیه';
  const logoUrl = studentUniversity?.logoUrl ?? currentUniversity?.logoUrl ?? null;

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
          enrolledCount: course_offerings.enrolledCount,
          capacity: course_offerings.capacity,
          sharedScheduleGroupKey: course_offerings.sharedScheduleGroupKey,
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

  const offeringIds = [...new Set(studentEnrollments.map(e => e.offeringId))];
  const professorIds = [...new Set(studentEnrollments.map(e => e.professorId).filter((v): v is number => v != null))];
  const [profUsers, rawSchedules] = await Promise.all([
    professorIds.length > 0
      ? db
        .select({
          staffId: staff.id,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(staff)
        .innerJoin(users, eq(users.id, staff.userId))
        .where(inArray(staff.id, professorIds))
      : Promise.resolve([]),
    term && offeringIds.length > 0
      ? db
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
        .innerJoin(course_offerings, eq(course_offerings.id, schedules.offeringId))
        .leftJoin(classrooms, eq(classrooms.id, schedules.roomId))
        .where(
          and(
            eq(course_offerings.termId, term.id),
            inArray(schedules.offeringId, offeringIds)
          )
        )
      : Promise.resolve([]),
  ]);

  const profMap = new Map<number, string>();
  for (const p of profUsers) {
    profMap.set(p.staffId, `${p.firstName || ''} ${p.lastName || ''}`.trim());
  }

  const schedMap = new Map<
    number,
    {
      classes: { dayOfWeek: number; dayName: string; startTime: string; endTime: string; room: string; building: string; weekType: StudentWeekType }[];
      exam?: { examDate: string; startTime: string; endTime: string; room?: string };
    }
  >();

  for (const s of rawSchedules) {
    if (!schedMap.has(s.offeringId)) schedMap.set(s.offeringId, { classes: [] });
    const entry = schedMap.get(s.offeringId)!;

    if (s.scheduleType === 'EXAM' && s.examDate) {
      entry.exam = {
        examDate: String(s.examDate),
        startTime: s.startTime.slice(0, 5),
        endTime: s.endTime.slice(0, 5),
        room: s.roomName || 'سالن امتحانات مرکزی',
      };
    } else if (s.scheduleType !== 'EXAM' && s.dayOfWeek != null) {
      entry.classes.push({
        dayOfWeek: s.dayOfWeek,
        dayName: DAY_NAMES[s.dayOfWeek] || `روز ${s.dayOfWeek}`,
        startTime: s.startTime.slice(0, 5),
        endTime: s.endTime.slice(0, 5),
        room: s.roomName || '',
        building: s.buildingName || '',
        weekType: classWeekType(s.scheduleType),
      });
    }
  }

  const coursesList: StudentScheduleCourse[] = studentEnrollments.map(e => {
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
      enrolledCount: e.enrolledCount ?? null,
      capacity: e.capacity ?? null,
      sharedScheduleGroupKey: e.sharedScheduleGroupKey ?? null,
      classes: (s?.classes || []).map(c => ({ ...c })),
      exam: s?.exam || null,
    };
  });

  return (
    <div className="space-y-4">
      {filteredTerm && (
        <>
          <TermFilterChip title={filteredTerm.title} universityId={me.universityId ?? null} />
          {coursesList.length === 0 && (
            <p className="card p-5 text-center text-xs text-slate-500">
              برای نیمسال «{filteredTerm.title}» هیچ درس ثبت‌نام‌شده‌ای برای شما وجود ندارد؛ بنابراین برنامهٔ هفتگی و زمان‌بندی امتحان نمایش داده نمی‌شود.
            </p>
          )}
        </>
      )}
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
          title: term?.title ?? 'نیمسال نامشخص',
          termCode: term?.termCode ?? '—',
        }}
        university={{
          title: universityTitle,
          logoUrl,
        }}
        courses={coursesList}
      />
    </div>
  );
}
