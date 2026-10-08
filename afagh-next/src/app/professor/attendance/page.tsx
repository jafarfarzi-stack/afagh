import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms, class_sessions, classrooms, course_offerings, courses, enrollments,
  offering_professors, professor_class_attendance, schedules, student_class_attendance, students, users,
} from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';
import { jalaliDateOf } from '@/lib/scheduling-core';
import { formatScheduleLabel } from '@/lib/professor-attendance-display';
import ProfessorAttendanceClient, { AttendanceCourseOffering, ClassSessionItem, MakeupSessionRecord, StudentInfo } from './ProfessorAttendanceClient';
import { groupIntoMerged, mergedDisplayTitle, mergedGroupKey } from '@/lib/professor-data';
import { professorTermFilter } from '@/lib/professor-term-filter';
import ProfessorTermFilterBanner from '../term-filter-banner';
import { isDemoProfessorUser } from '@/lib/demo-accounts';
import {
  DEMO_ACADEMIC_RANK,
  DEMO_ATTENDANCE_DEFAULT_OFFERING_ID,
  DEMO_ATTENDANCE_PROFESSOR_FALLBACK_NAME,
  DEMO_ATTENDANCE_ROOMS,
  DEMO_ATTENDANCE_TODAY_JALALI,
  DEMO_TERM_TITLE,
  demoAttendanceMakeupHistory,
  demoAttendanceOfferings,
} from '@/lib/demo-professor-data';

export const dynamic = 'force-dynamic';

const faDigits = (s: string) => String(s);

/** صفحهٔ حضور و غیاب استاد — همهٔ داده‌ها واقعی (ارائه‌ها، جلسات، دانشجویان و رکوردهای حضور) */
export default async function ProfessorAttendancePage({ searchParams }: { searchParams: Promise<{ offeringId?: string }> }) {
  const user = await requireRole(['PROFESSOR']);
  const me = await getStaffByUser(user.id);

  if (!me) {
    return (
      <div className="card text-center p-8">
        <p className="text-slate-600 font-bold">پروندهٔ هیئت علمی یافت نشد.</p>
      </div>
    );
  }

  const sp = await searchParams;
  const defaultOfferingId = sp.offeringId ? Number(sp.offeringId) : undefined;
  const todayJalali = jalaliDateOf(new Date());
  const demo = await isDemoProfessorUser(user.id);
  const universityId = me.universityId ?? user.universityId ?? null;
  const { term, selectedTerm } = await professorTermFilter(universityId);

  if (demo) {
    const demoName = user.name || DEMO_ATTENDANCE_PROFESSOR_FALLBACK_NAME;
    return (
      <div className="space-y-3">
        <ProfessorTermFilterBanner selectedTerm={selectedTerm} universityId={universityId} demo />
        <ProfessorAttendanceClient
          demo
          professor={{
            id: me.id,
            name: demoName,
            staffCode: me.staffCode,
            academicRank: DEMO_ACADEMIC_RANK,
          }}
          termTitle={DEMO_TERM_TITLE}
          initialOfferings={demoAttendanceOfferings()}
          defaultOfferingId={
            defaultOfferingId && sp.offeringId ? defaultOfferingId : DEMO_ATTENDANCE_DEFAULT_OFFERING_ID
          }
          initialMakeupHistory={demoAttendanceMakeupHistory(demoName)}
          todayJalali={DEMO_ATTENDANCE_TODAY_JALALI}
          rooms={DEMO_ATTENDANCE_ROOMS}
        />
      </div>
    );
  }

  const termTitle = term?.title ?? '';

  const sharedOfferingIds = db
    .select({ id: offering_professors.offeringId })
    .from(offering_professors)
    .where(eq(offering_professors.staffId, me.id));

  const myOfferings = term
    ? await db
        .select({ offering: course_offerings, course: courses })
        .from(course_offerings)
        .innerJoin(courses, eq(courses.id, course_offerings.courseId))
        .where(and(
          eq(course_offerings.termId, term.id),
          universityId ? eq(course_offerings.universityId, universityId) : undefined,
          eq(course_offerings.isActive, 1),
          sql`(${course_offerings.professorId} = ${me.id} or ${course_offerings.id} in ${sharedOfferingIds})`,
        ))
    : [];

  let linkedNotice: { offeringId: number; title: string; termTitle: string; selectedTermTitle: string } | null = null;
  let allOfferings = myOfferings;
  if (defaultOfferingId && !myOfferings.some(o => o.offering.id === defaultOfferingId)) {
    const linked = await db
      .select({ offering: course_offerings, course: courses })
      .from(course_offerings)
      .innerJoin(courses, eq(courses.id, course_offerings.courseId))
      .where(and(
        eq(course_offerings.id, defaultOfferingId),
        universityId ? eq(course_offerings.universityId, universityId) : undefined,
        sql`(${course_offerings.professorId} = ${me.id} or ${course_offerings.id} in ${sharedOfferingIds})`,
      ))
      .limit(1);
    if (linked.length > 0) {
      allOfferings = [...myOfferings, ...linked];
      const [linkedTerm] = linked[0].offering.termId
        ? await db.select({ title: academic_terms.title }).from(academic_terms).where(eq(academic_terms.id, linked[0].offering.termId)).limit(1)
        : [];
      linkedNotice = {
        offeringId: defaultOfferingId,
        title: linked[0].course.title,
        termTitle: linkedTerm?.title ?? 'نیمسال دیگر',
        selectedTermTitle: term?.title ?? 'نیمسال جاری',
      };
    }
  }

  const offeringIds = allOfferings.map(o => o.offering.id);
  const allSessions = offeringIds.length
    ? await db.select().from(class_sessions).where(inArray(class_sessions.offeringId, offeringIds)).orderBy(class_sessions.sessionNo)
    : [];

  // نام کلاس از زمان‌بندی واقعی هر ارائه
  const scheduleRows = offeringIds.length
    ? await db
        .select({ offeringId: schedules.offeringId, dayOfWeek: schedules.dayOfWeek, startTime: schedules.startTime, endTime: schedules.endTime, roomId: schedules.roomId, scheduleType: schedules.scheduleType })
        .from(schedules)
        .where(and(inArray(schedules.offeringId, offeringIds), ne(schedules.scheduleType, 'EXAM')))
    : [];
  const roomIds = [...new Set(scheduleRows.map(r => r.roomId).filter(Boolean))] as number[];
  const scheduledRooms = roomIds.length
    ? await db.select().from(classrooms).where(inArray(classrooms.id, roomIds))
    : [];
  // فهرست انتخاب کلاس برای جلسهٔ جبرانی: همهٔ کلاس‌های دانشگاه استاد
  const rooms = universityId
    ? await db.select().from(classrooms).where(eq(classrooms.universityId, universityId)).orderBy(classrooms.name)
    : scheduledRooms;

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
  const profAttBySession = new Map(profAttRows.map(r => [r.sessionId, r]));

  const classSlotsByOffering = new Map<number, { dayOfWeek: number | null; startTime: string | null; endTime: string | null; roomKey: number | null }[]>();
  for (const r of scheduleRows) {
    if (r.scheduleType !== 'CLASS') continue;
    const list = classSlotsByOffering.get(r.offeringId) ?? [];
    list.push({ dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime, roomKey: r.roomId });
    classSlotsByOffering.set(r.offeringId, list);
  }
  const offeringGroups = groupIntoMerged(
    allOfferings,
    o => o.offering.id,
    o => {
      const k = mergedGroupKey(o.offering.sharedScheduleGroupKey ?? null, classSlotsByOffering.get(o.offering.id) ?? []);
      return k ? `${o.offering.termId}|${k}` : null;
    },
  );
  const memberToPrimary = new Map<number, number>();
  for (const g of offeringGroups) for (const id of g.memberIds) memberToPrimary.set(id, g.primaryId);
  const resolvedDefaultOfferingId = defaultOfferingId ? (memberToPrimary.get(defaultOfferingId) ?? defaultOfferingId) : undefined;

  const enrollByOffering = new Map<number, typeof enrollmentRows>();
  for (const e of enrollmentRows) {
    const list = enrollByOffering.get(e.offeringId) ?? [];
    list.push(e);
    enrollByOffering.set(e.offeringId, list);
  }
  const offeringById = new Map(allOfferings.map(o => [o.offering.id, o] as const));

  const initialOfferings: AttendanceCourseOffering[] = offeringGroups.map(g => {
    const primary = offeringById.get(g.primaryId) ?? g.members[0];
    const offering = primary.offering;
    const codes = [...new Set(g.members.map(m => m.course.code))];
    const rows = scheduleRows.filter(r => r.offeringId === offering.id);
    const sched = rows.find(r => r.scheduleType === 'CLASS' && r.roomId) ?? rows.find(r => r.roomId) ?? rows[0];
    const room = sched?.roomId ? rooms.find(r => r.id === sched.roomId) : undefined;
    const scheduleTime = formatScheduleLabel(rows);

    const studentsList: StudentInfo[] = [];
    const seenStudents = new Set<number>();
    for (const m of g.members) {
      for (const e of enrollByOffering.get(m.offering.id) ?? []) {
        if (seenStudents.has(e.studentId)) continue;
        seenStudents.add(e.studentId);
        studentsList.push({ id: e.studentId, studentCode: e.studentCode, fullName: `${e.firstName} ${e.lastName}`.trim() });
      }
    }

    const orderedSessions = g.members
      .flatMap(m => allSessions.filter(s => s.offeringId === m.offering.id))
      .sort((a, b) =>
        (a.offeringId === g.primaryId ? 0 : 1) - (b.offeringId === g.primaryId ? 0 : 1)
        || (a.sessionNo ?? 0) - (b.sessionNo ?? 0) || a.id - b.id);
    const seenSessions = new Set<string>();
    const sessions: ClassSessionItem[] = [];
    for (const s of orderedSessions) {
      const dedupKey = `${s.sessionDate}|${s.startTime}|${s.endTime}|${s.replacedSessionId ?? 0}|${s.isMakeUpSession ?? 0}`;
      if (seenSessions.has(dedupKey)) continue;
      seenSessions.add(dedupKey);
      const sessionCourse = offeringById.get(s.offeringId)?.course ?? primary.course;
      const statuses: ClassSessionItem['studentStatuses'] = {};
      const attMap = attBySession.get(s.id);
      if (attMap) for (const [studentId, status] of attMap) {
        statuses[studentId] = { status: status as 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED' };
      }
      const profCheck = profAttBySession.get(s.id);
      const replaced = s.replacedSessionId
        ? allSessions.find(x => x.id === s.replacedSessionId)?.sessionNo ?? undefined
        : undefined;
      sessions.push({
        id: s.id,
        sessionNo: s.sessionNo ?? 0,
        sessionDate: faDigits(s.sessionDate),
        startTime: faDigits(s.startTime),
        endTime: faDigits(s.endTime),
        roomName: room?.name ?? '',
        topic: `جلسهٔ ${s.sessionNo ?? '—'} — ${sessionCourse.title}`,
        isHeld: (attMap?.size ?? 0) > 0 || !!profCheck,
        isMakeUp: (s.isMakeUpSession ?? 0) === 1,
        replacedSessionNo: replaced,
        professorStatus: profCheck ? 'VERIFIED_PRESENT' : 'UPCOMING',
        verificationDetail: profCheck ? 'حضور استاد در این جلسه ثبت شده است.' : 'جلسه در انتظار برگزاری/ثبت',
        professorCheck: profCheck
          ? {
              verificationMethod: profCheck.verificationMethod,
              ipAddress: profCheck.recordedIpAddress,
              recordedAt: profCheck.recordedAt ? profCheck.recordedAt.toLocaleString('fa-IR') : null,
            }
          : null,
        studentStatuses: statuses,
      });
    }
    sessions.sort((a, b) => a.sessionNo - b.sessionNo || a.id - b.id);

    return {
      id: offering.id,
      code: codes.join(' / '),
      title: g.merged ? mergedDisplayTitle(primary.course.title, codes) : primary.course.title,
      groupNumber: offering.groupNumber,
      units: Math.max(...g.members.map(m => Number(m.course.units ?? 0))),
      roomName: room?.name ?? '',
      scheduleTime,
      hasSchedules: g.members.some(m => scheduleRows.some(r => r.offeringId === m.offering.id)),
      canGenerate: g.members.some(m => scheduleRows.some(r => r.offeringId === m.offering.id && r.scheduleType === 'CLASS' && r.dayOfWeek != null)),
      students: studentsList,
      sessions,
    };
  });

  const roomOptions = rooms.map(r => ({ id: r.id, name: r.name, capacity: r.capacity, type: r.roomType ?? 'THEORY' }));

  // تاریخچهٔ جلسات جبرانی واقعی
  const initialMakeupHistory: MakeupSessionRecord[] = allSessions
    .filter(s => (s.isMakeUpSession ?? 0) === 1)
    .map(s => {
      const offering = allOfferings.find(o => o.offering.id === s.offeringId);
      const replacedSessionNo = s.replacedSessionId
        ? allSessions.find(x => x.id === s.replacedSessionId)?.sessionNo ?? 0
        : 0;
      const room = offering
        ? scheduleRows.find(r => r.offeringId === offering.offering.id)?.roomId
        : undefined;
      const roomName = room ? rooms.find(r => r.id === room)?.name ?? '' : '';
      return {
        id: s.id,
        offeringId: s.offeringId,
        courseTitle: offering?.course.title ?? '',
        groupNumber: offering?.offering.groupNumber ?? 1,
        professorName: user.name,
        replacedSessionNo,
        sessionDate: faDigits(s.sessionDate),
        sessionTime: `${faDigits(s.startTime)} الی ${faDigits(s.endTime)}`,
        roomName,
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
    <div className="space-y-3">
      <ProfessorTermFilterBanner selectedTerm={selectedTerm} universityId={universityId} />
      <ProfessorAttendanceClient
        professor={professorData}
        termTitle={termTitle}
        initialOfferings={initialOfferings}
        defaultOfferingId={resolvedDefaultOfferingId}
        linkedOfferingNotice={linkedNotice ? { ...linkedNotice, offeringId: memberToPrimary.get(linkedNotice.offeringId) ?? linkedNotice.offeringId } : null}
        initialMakeupHistory={initialMakeupHistory}
        todayJalali={todayJalali}
        rooms={roomOptions}
      />
    </div>
  );
}
