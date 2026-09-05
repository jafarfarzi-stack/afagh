import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms, class_sessions, classrooms, course_offerings, courses, enrollments,
  professor_class_attendance, schedules, student_class_attendance, students, users,
} from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';
import { jalaliDateOf } from '@/lib/scheduling-core';
import ProfessorAttendanceClient, { AttendanceCourseOffering, ClassSessionItem, MakeupSessionRecord, StudentInfo } from './ProfessorAttendanceClient';

export const dynamic = 'force-dynamic';

const faDigits = (s: string) => String(s);

/** صفحهٔ حضور و غیاب استاد — همهٔ داده‌ها واقعی (ارائه‌ها، جلسات، دانشجویان و رکوردهای حضور) */
export default async function ProfessorAttendancePage({ searchParams }: { searchParams: { offeringId?: string } }) {
  const user = await requireRole(['PROFESSOR']);
  const me = await getStaffByUser(user.id);

  if (!me) {
    return (
      <div className="card text-center p-8">
        <p className="text-slate-600 font-bold">پروندهٔ هیئت علمی یافت نشد.</p>
      </div>
    );
  }

  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1));
  const termTitle = term?.title ?? '';
  const defaultOfferingId = searchParams.offeringId ? Number(searchParams.offeringId) : undefined;
  const todayJalali = jalaliDateOf(new Date());

  const myOfferings = await db
    .select({ offering: course_offerings, course: courses })
    .from(course_offerings)
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(and(
      eq(course_offerings.professorId, me.id),
      term ? eq(course_offerings.termId, term.id) : undefined,
      eq(course_offerings.isActive, 1),
    ));

  const offeringIds = myOfferings.map(o => o.offering.id);
  const allSessions = offeringIds.length
    ? await db.select().from(class_sessions).where(inArray(class_sessions.offeringId, offeringIds)).orderBy(class_sessions.sessionNo)
    : [];

  // نام کلاس از زمان‌بندی واقعی هر ارائه
  const scheduleRows = offeringIds.length
    ? await db
        .select({ offeringId: schedules.offeringId, dayOfWeek: schedules.dayOfWeek, startTime: schedules.startTime, endTime: schedules.endTime, roomId: schedules.roomId })
        .from(schedules)
        .where(and(inArray(schedules.offeringId, offeringIds), eq(schedules.scheduleType, 'CLASS')))
    : [];
  const roomIds = [...new Set(scheduleRows.map(r => r.roomId).filter(Boolean))] as number[];
  const rooms = roomIds.length ? await db.select().from(classrooms).where(inArray(classrooms.id, roomIds)) : [];

  // دانشجویان هر ارائه (ثبت‌نامی‌های فعال)
  const enrollmentRows = offeringIds.length
    ? await db
        .select({ id: enrollments.id, offeringId: enrollments.offeringId, studentId: enrollments.studentId, studentCode: students.studentCode, firstName: users.firstName, lastName: users.lastName })
        .from(enrollments)
        .innerJoin(students, eq(students.id, enrollments.studentId))
        .innerJoin(users, eq(users.id, students.userId))
        .where(and(inArray(enrollments.offeringId, offeringIds), inArray(enrollments.status, ['REGISTERED', 'PENDING_COUNCIL'])))
    : [];

  // رکوردهای حضور: جلسه → وضعیت دانشجو (از طریق enrollmentId)
  const attendanceRows = allSessions.length
    ? await db.select().from(student_class_attendance).where(inArray(student_class_attendance.sessionId, allSessions.map(s => s.id)))
    : [];
  const attBySession = new Map<number, Map<number, string>>();
  for (const a of attendanceRows) {
    const en = enrollmentRows.find(e => e.id === a.enrollmentId);
    if (!en) continue;
    let m = attBySession.get(a.sessionId);
    if (!m) { m = new Map(); attBySession.set(a.sessionId, m); }
    m.set(en.studentId, a.status);
  }

  // حضور استاد در هر جلسه
  const profAttRows = allSessions.length
    ? await db.select().from(professor_class_attendance)
        .where(and(inArray(professor_class_attendance.sessionId, allSessions.map(s => s.id)), eq(professor_class_attendance.staffId, me.id)))
    : [];
  const profAttSessions = new Set(profAttRows.map(r => r.sessionId));

  const initialOfferings: AttendanceCourseOffering[] = myOfferings.map(({ offering, course }) => {
    const sched = scheduleRows.find(r => r.offeringId === offering.id);
    const room = sched?.roomId ? rooms.find(r => r.id === sched.roomId) : undefined;
    const dayNames = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه'];
    const scheduleTime = sched?.dayOfWeek != null
      ? `${dayNames[sched.dayOfWeek] ?? ''}‌ها ${String(sched.startTime).slice(0, 5)} الی ${String(sched.endTime).slice(0, 5)}`
      : 'زمان کلاس ثبت نشده';

    const studentsList: StudentInfo[] = enrollmentRows
      .filter(e => e.offeringId === offering.id)
      .map(e => ({ id: e.studentId, studentCode: e.studentCode, fullName: `${e.firstName} ${e.lastName}`.trim() }));

    const sessions: ClassSessionItem[] = allSessions
      .filter(s => s.offeringId === offering.id)
      .map(s => {
        const statuses: ClassSessionItem['studentStatuses'] = {};
        const attMap = attBySession.get(s.id);
        if (attMap) for (const [studentId, status] of attMap) {
          statuses[studentId] = { status: status as 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED' };
        }
        return {
          id: s.id,
          sessionNo: s.sessionNo ?? 0,
          sessionDate: faDigits(s.sessionDate),
          startTime: faDigits(s.startTime),
          endTime: faDigits(s.endTime),
          roomName: room?.name ?? '',
          topic: `جلسهٔ ${s.sessionNo ?? '—'} — ${course.title}`,
          isHeld: (attMap?.size ?? 0) > 0 || profAttSessions.has(s.id),
          isMakeUp: (s.isMakeUpSession ?? 0) === 1,
          replacedSessionNo: undefined,
          professorStatus: profAttSessions.has(s.id) ? 'VERIFIED_PRESENT' : 'UPCOMING',
          verificationDetail: profAttSessions.has(s.id) ? 'حضور استاد در این جلسه ثبت شده است.' : 'جلسه در انتظار برگزاری/ثبت',
          studentStatuses: statuses,
        };
      });

    return {
      id: offering.id,
      code: course.code,
      title: course.title,
      groupNumber: offering.groupNumber,
      units: Number(course.units),
      roomName: room?.name ?? '',
      scheduleTime,
      students: studentsList,
      sessions,
    };
  });

  const roomOptions = rooms.map(r => ({ id: r.id, name: r.name, capacity: r.capacity, type: r.roomType ?? 'THEORY' }));

  // تاریخچهٔ جلسات جبرانی واقعی
  const initialMakeupHistory: MakeupSessionRecord[] = allSessions
    .filter(s => (s.isMakeUpSession ?? 0) === 1)
    .map(s => {
      const offering = myOfferings.find(o => o.offering.id === s.offeringId);
      return {
        id: s.id,
        offeringId: s.offeringId,
        courseTitle: offering?.course.title ?? '',
        groupNumber: offering?.offering.groupNumber ?? 1,
        professorName: user.name,
        replacedSessionNo: 0,
        sessionDate: faDigits(s.sessionDate),
        sessionTime: `${faDigits(s.startTime)} الی ${faDigits(s.endTime)}`,
        roomName: '',
        topic: `جلسهٔ جبرانی ${s.sessionNo ?? ''}`,
        reason: s.status === 'PROPOSED' ? 'در انتظار تأیید اداره آموزش' : 'ثبت مستقیم توسط استاد',
        status: s.status === 'PROPOSED' ? 'PENDING_EDUCATION' : 'APPROVED_DIRECT',
        allocatedAt: todayJalali,
      };
    });

  const professorData = {
    id: me.id,
    name: user.name,
    staffCode: me.staffCode,
    academicRank: me.academicRank || '',
  };

  return (
    <ProfessorAttendanceClient
      professor={professorData}
      termTitle={termTitle}
      initialOfferings={initialOfferings}
      defaultOfferingId={defaultOfferingId}
      initialMakeupHistory={initialMakeupHistory}
      todayJalali={todayJalali}
      rooms={roomOptions}
    />
  );
}
