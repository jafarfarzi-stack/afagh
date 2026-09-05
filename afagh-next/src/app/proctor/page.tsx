import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  courses, course_offerings, enrollments, exam_attendances, exam_halls, exam_sessions,
  invigilators, majors, seat_allocations, students, users,
} from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';
import ProctorExamAttendanceClient, { type ProctorSessionData } from './ProctorExamAttendanceClient';

export const dynamic = 'force-dynamic';

/** پنل مراقب امتحان — همهٔ داده‌ها از پایگاه داده (جلسات تخصیصی + صندلی‌های واقعی) */
export default async function ProctorPage() {
  const user = await requireRole(['PROCTOR', 'ADMIN', 'EDU_EXPERT']);
  const me = await getStaffByUser(user.id);
  if (!me) {
    return <p className="card p-8 text-center font-bold text-slate-600">پروندهٔ پرسنلی یافت نشد.</p>;
  }

  const assigned = await db
    .select({
      sessionId: exam_sessions.id,
      examDate: exam_sessions.examDate,
      startTime: exam_sessions.startTime,
      endTime: exam_sessions.endTime,
      hallId: exam_halls.id,
      hallName: exam_halls.name,
      buildingName: exam_halls.buildingName,
      hallCapacity: exam_halls.totalCapacity,
      clockInTime: invigilators.attendanceStatus,
    })
    .from(invigilators)
    .innerJoin(exam_sessions, eq(exam_sessions.id, invigilators.sessionId))
    .innerJoin(exam_halls, eq(exam_halls.id, invigilators.hallId))
    .where(eq(invigilators.staffId, me.id));

  const sessions: ProctorSessionData[] = [];
  for (const s of assigned) {
    const rosterRows = await db
      .select({
        studentId: students.id,
        studentCode: students.studentCode,
        fullName: users.firstName,
        lastName: users.lastName,
        nationalCode: users.nationalCode,
        majorName: majors.name,
        courseCode: courses.code,
        courseTitle: courses.title,
        seatNumber: seat_allocations.seatNumber,
        blockKey: seat_allocations.blockKey,
        attendanceId: exam_attendances.id,
        isPresent: exam_attendances.isPresent,
        checkInMethod: exam_attendances.checkInMethod,
        hasTemporaryPermit: exam_attendances.hasTemporaryPermit,
        checkInTime: exam_attendances.checkInTime,
      })
      .from(seat_allocations)
      .innerJoin(enrollments, eq(enrollments.id, seat_allocations.enrollmentId))
      .innerJoin(students, eq(students.id, enrollments.studentId))
      .innerJoin(users, eq(users.id, students.userId))
      .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
      .innerJoin(courses, eq(courses.id, course_offerings.courseId))
      .leftJoin(majors, eq(majors.id, students.majorId))
      .leftJoin(exam_attendances, and(
        eq(exam_attendances.examId, s.sessionId),
        eq(exam_attendances.studentId, students.id),
      ))
      .where(and(
        eq(seat_allocations.sessionId, s.sessionId),
        eq(seat_allocations.hallId, s.hallId),
      ))
      .orderBy(seat_allocations.seatNumber);

    sessions.push({
      id: s.sessionId,
      hallId: s.hallId,
      hallName: s.hallName,
      buildingName: s.buildingName ?? '',
      hallCapacity: s.hallCapacity,
      examDate: s.examDate,
      startTime: s.startTime,
      endTime: s.endTime,
      clockInStatus: s.clockInTime ?? 'PENDING',
      roster: rosterRows.map(r => ({
        studentId: r.studentId,
        seatNumber: r.seatNumber,
        blockKey: r.blockKey ?? '',
        studentName: `${r.fullName} ${r.lastName}`.trim(),
        studentCode: r.studentCode,
        nationalCodeMasked: r.nationalCode ? r.nationalCode.slice(0, 3) + '******' + r.nationalCode.slice(-1) : '—',
        majorTitle: r.majorName ?? '—',
        courseCode: r.courseCode,
        courseTitle: r.courseTitle,
        isPresent: r.isPresent === 1,
        checkInMethod: r.checkInMethod ?? null,
        hasTemporaryPermit: r.hasTemporaryPermit === 1,
        checkInTime: r.checkInTime ? r.checkInTime.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : null,
      })),
    });
  }

  return <ProctorExamAttendanceClient sessions={sessions} staffName={user.name} />;
}
