import 'server-only';

import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { majors, students, users } from '@/db/schema';
import { maskNationalCode, type ExamCardData } from '@/lib/verification';
import { studentLedgerBalance } from '@/lib/workflow-engine';

type TermRow = { id: number; title: string };

export async function getExamCardDataForTerm(userId: number, term: TermRow): Promise<ExamCardData | null> {
  const [stu] = await db
    .select({
      studentId: students.id, studentCode: students.studentCode, entryYear: students.entryYear,
      firstName: users.firstName, lastName: users.lastName, nationalCode: users.nationalCode,
      majorName: majors.name,
    })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(majors, eq(majors.id, students.majorId))
    .where(eq(users.id, userId))
    .limit(1);
  if (!stu) return null;

  const balance = await studentLedgerBalance(undefined, stu.studentId);
  const debt = Math.max(0, -Math.round(balance));

  const rows = ((await db.execute(sql`
    select en.id as "enrollmentId",
           c.code as "courseCode", c.title as "courseTitle", coalesce(c.units, 0)::int as "units",
           (pu."firstName" || ' ' || pu."lastName") as "professorName",
           cr.name as "classRoomName",
           coalesce(es."examDate", sc."examDate"::text, '') as "examDate",
           coalesce(es."startTime", sc."startTime"::text, '') as "startTime",
           coalesce(es."endTime", sc."endTime"::text, '') as "endTime",
           eh.name as "hallName", sa."seatNumber" as "seatNumber",
           en."hasEvaluated"::int as "hasEvaluated"
      from enrollments en
      join course_offerings o on o.id = en."offeringId"
      join courses c on c.id = o."courseId"
      left join staff st on st.id = o."professorId"
      left join users pu on pu.id = st."userId"
      left join schedules sc on sc."offeringId" = o.id and sc."scheduleType" = 'EXAM'
      left join classrooms cr on cr.id = sc."roomId"
      left join seat_allocations sa on sa."enrollmentId" = en.id
      left join exam_sessions es on es.id = sa."sessionId"
      left join exam_halls eh on eh.id = sa."hallId"
     where en."studentId" = ${stu.studentId}
       and o."termId" = ${term.id}
     order by coalesce(es."examDate", sc."examDate"::text, ''), coalesce(es."startTime", sc."startTime"::text, '')
  `)).rows ?? []) as unknown as {
    enrollmentId: number; courseCode: string; courseTitle: string; units: number;
    professorName: string | null; classRoomName: string | null; examDate: string;
    startTime: string; endTime: string; hallName: string | null; seatNumber: number | null; hasEvaluated: number;
  }[];

  return {
    studentId: stu.studentId,
    studentCode: stu.studentCode,
    fullName: `${stu.firstName} ${stu.lastName}`,
    nationalIdMasked: maskNationalCode(stu.nationalCode),
    majorName: stu.majorName,
    entryYear: stu.entryYear,
    termTitle: term.title || '—',
    debt,
    isFinancialCleared: debt === 0,
    courses: rows.map(r => ({
      enrollmentId: r.enrollmentId,
      courseCode: r.courseCode,
      courseTitle: r.courseTitle,
      units: r.units,
      professorName: r.professorName,
      classRoomName: r.classRoomName,
      examDate: r.examDate || '—',
      examTime: r.startTime ? `${r.startTime} – ${r.endTime}` : '—',
      examHall: r.hallName,
      seatNumber: r.seatNumber,
      hasEvaluated: r.hasEvaluated === 1,
    })),
  };
}