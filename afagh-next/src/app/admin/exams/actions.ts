'use server';

// ════════════════════════════════════════════════════════════════════════
// فاز ۸ (گام ۵ نقشهٔ ۱۰ گامی) — Server Actions صفحهٔ اداری امتحانات
// ────────────────────────────────────────────────────────────────────────
// D3: الگوی استاندارد «Server Actions» — گارد مستقیم + تراکنش موتور +
// auditChain + { ok,error } فارسی. هیچ دادهٔ Mock در کلاینت؛ همه از DB.
// ════════════════════════════════════════════════════════════════════════

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import {
  academic_terms, course_exam_sessions, course_offerings, courses, exam_attendances,
  exam_halls, exam_sessions, invigilators, schedules, staff, users,
} from '@/db/schema';
import { requireRole } from '@/lib/auth';
import * as engine from '@/lib/exam-engine';
import { jalaliDateOf } from '@/lib/scheduling-core';

const EDITORS = ['ADMIN', 'EDU_EXPERT'];

// ─────────────────────────── helpers (غیر export — گارد CI) ───────────────────────────

async function listRealTerms() {
  return db
    .select({ id: academic_terms.id, code: academic_terms.termCode, title: academic_terms.title, isCurrent: academic_terms.isCurrent })
    .from(academic_terms)
    .orderBy(desc(academic_terms.id));
}

/** سشن‌های واقعی ترم + مراقبین هر سشن + آمار حضور */
async function loadSessions(termId: number) {
  const sessions = await db
    .select()
    .from(exam_sessions)
    .where(eq(exam_sessions.termId, termId))
    .orderBy(asc(exam_sessions.examDate), asc(exam_sessions.startTime));

  if (sessions.length === 0) return [];
  const ids = sessions.map(s => s.id);

  const [inv, att] = await Promise.all([
    db
      .select({
        sessionId: invigilators.sessionId,
        hallId: invigilators.hallId,
        role: invigilators.role,
        attendanceStatus: invigilators.attendanceStatus,
        staffId: invigilators.staffId,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(invigilators)
      .leftJoin(staff, eq(staff.id, invigilators.staffId))
      .leftJoin(users, eq(users.id, staff.userId))
      .where(inArray(invigilators.sessionId, ids)),
    db
      .select({
        sessionId: exam_attendances.examId,
        present: sql<number>`count(*) filter (where ${exam_attendances.isPresent} = 1)::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(exam_attendances)
      .where(inArray(exam_attendances.examId, ids))
      .groupBy(exam_attendances.examId),
  ]);

  return sessions.map(s => ({
    id: s.id,
    examDate: s.examDate,
    startTime: s.startTime,
    endTime: s.endTime,
    proctors: inv
      .filter(i => i.sessionId === s.id)
      .map(i => ({
        staffId: i.staffId,
        name: i.firstName ? `${i.firstName} ${i.lastName ?? ''}`.trim() : '—',
        hallId: i.hallId,
        role: i.role ?? 'PROCTOR',
        attendanceStatus: i.attendanceStatus ?? 'PENDING',
      })),
    attendance: {
      present: Number(att.find(a => a.sessionId === s.id)?.present ?? 0),
      total: Number(att.find(a => a.sessionId === s.id)?.total ?? 0),
    },
  }));
}

/** دروس امتحانی: schedules با scheduleType='EXAM' + جزئیات + بستهٔ اوراق */
async function loadExamCourses(termId: number) {
  const rows = await db
    .select({
      offeringId: course_offerings.id,
      courseCode: courses.code,
      courseTitle: courses.title,
      units: courses.units,
      groupNumber: course_offerings.groupNumber,
      professorId: course_offerings.professorId,
      profFirstName: users.firstName,
      profLastName: users.lastName,
      examDate: schedules.examDate,
      startTime: schedules.startTime,
      endTime: schedules.endTime,
      roomId: schedules.roomId,
      roomName: exam_halls.name,
      buildingName: exam_halls.buildingName,
      expectedSheets: course_exam_sessions.totalExpectedSheets,
      deliveredSheets: course_exam_sessions.totalDeliveredSheets,
      isFullyCollected: course_exam_sessions.isFullyCollected,
    })
    .from(schedules)
    .innerJoin(course_offerings, eq(course_offerings.id, schedules.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .leftJoin(staff, eq(staff.id, course_offerings.professorId))
    .leftJoin(users, eq(users.id, staff.userId))
    .leftJoin(exam_halls, eq(exam_halls.id, schedules.roomId))
    .leftJoin(course_exam_sessions, eq(course_exam_sessions.courseOfferingId, course_offerings.id))
    .where(and(eq(schedules.scheduleType, 'EXAM'), sql`${schedules.examDate} is not null`, eq(course_offerings.termId, termId)))
    .orderBy(courses.code);

  return rows.map(r => ({
    offeringId: r.offeringId,
    courseCode: r.courseCode,
    courseTitle: r.courseTitle,
    units: String(r.units),
    groupNumber: r.groupNumber,
    professorId: r.professorId,
    professorName: r.profFirstName ? `${r.profFirstName} ${r.profLastName ?? ''}`.trim() : 'تخصیص‌نیافته',
    examDate: r.examDate ? jalaliDateOf(new Date(r.examDate + 'T00:00:00')) : null,
    startTime: String(r.startTime ?? '').slice(0, 5),
    endTime: String(r.endTime ?? '').slice(0, 5),
    roomName: r.roomName ?? '—',
    buildingName: r.buildingName ?? '—',
    expectedSheets: Number(r.expectedSheets ?? 0),
    deliveredSheets: Number(r.deliveredSheets ?? 0),
    isFullyCollected: Number(r.isFullyCollected ?? 0) === 1,
  }));
}

async function loadHalls() {
  const rows = await db
    .select({
      id: exam_halls.id,
      name: exam_halls.name,
      buildingName: exam_halls.buildingName,
      totalCapacity: exam_halls.totalCapacity,
      rowsCount: exam_halls.rowsCount,
      colsCount: exam_halls.colsCount,
    })
    .from(exam_halls)
    .orderBy(asc(exam_halls.id));
  return rows;
}

// ─────────────────────────── اکشن‌ها ───────────────────────────

export type ExamWorkspaceResult =
  | {
      ok: true;
      data: {
        terms: { id: number; code: string; title: string; isCurrent: boolean }[];
        selectedTermId: number | null;
        sessions: Awaited<ReturnType<typeof loadSessions>>;
        courses: Awaited<ReturnType<typeof loadExamCourses>>;
        halls: Awaited<ReturnType<typeof loadHalls>>;
        /** سشن‌های هم‌زمان (تاریخ + ساعت شروع یکسان) — کاندیدای تداخل */
        concurrentCount: number;
      };
    }
  | { ok: false; error: string };

/** کارتابل واقعی صفحهٔ اداری امتحانات (جایگزین Mock های ۲۶۵۷ خطی) */
export async function getExamWorkspaceAction(termId?: number): Promise<ExamWorkspaceResult> {
  try {
    await requireRole(EDITORS);
    const terms = await listRealTerms();
    const resolvedTermId = termId ?? terms.find(t => t.isCurrent === 1)?.id ?? terms[0]?.id ?? null;

    let sessions: Awaited<ReturnType<typeof loadSessions>> = [];
    let courses: Awaited<ReturnType<typeof loadExamCourses>> = [];
    let concurrentCount = 0;
    if (resolvedTermId != null) {
      [sessions, courses] = await Promise.all([loadSessions(resolvedTermId), loadExamCourses(resolvedTermId)]);
      const seen = new Map<string, number>();
      for (const c of courses) {
        if (!c.examDate || !c.startTime) continue;
        const k = `${c.examDate}|${c.startTime}`;
        seen.set(k, (seen.get(k) ?? 0) + 1);
      }
      concurrentCount = Array.from(seen.values()).filter(n => n > 1).length;
    }
    const halls = await loadHalls();

    return {
      ok: true,
      data: {
        terms: terms.map(t => ({ id: t.id, code: t.code, title: t.title, isCurrent: t.isCurrent === 1 })),
        selectedTermId: resolvedTermId,
        sessions,
        courses,
        halls,
        concurrentCount,
      },
    };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'خطا در بارگذاری کارتابل امتحانات.' };
  }
}

/** صدور حضور و غیاب دسته‌ای برای یک سشن (موتور: exam_attendances + seat allocations) */
export async function issueExamAttendanceAction(sessionId: number) {
  try {
    const user = await requireRole(EDITORS);
    const out = await engine.issueExamAttendance(user.id, sessionId);
    revalidatePath('/admin/exams');
    return { ok: true, issued: Number((out as any).issued ?? 0), skipped: Number((out as any).skipped ?? 0) };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'خطا در صدور حضور و غیاب.' };
  }
}

/** امضای صورت‌جلسهٔ سالن توسط مراقبِ تخصیص‌یافته (موتور: exam_minutes + مش) */
export async function signExamMinutesAction(px: {
  sessionId: number;
  hallId: number;
  supervisorStaffId: number;
  notes?: string;
  cheatingIncidentsCount?: number;
}) {
  try {
    const user = await requireRole(EDITORS);
    const out = await engine.signHallMinutes(user.id, px);
    revalidatePath('/admin/exams');
    return { ok: true, ...(out as object) };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'خطا در امضای صورت‌جلسه.' };
  }
}

/** تحویل اوراق جمع‌آوری‌شده به استاد درس (موتور: instructor_deliveries + pickupToken) */
export async function deliverToInstructorAction(px: { offeringId: number; instructorId: number; vaultManagerId: number }) {
  try {
    const user = await requireRole(EDITORS);
    const out = await engine.deliverToInstructor(user.id, px);
    revalidatePath('/admin/exams');
    return { ok: true, ...(out as object) };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'خطا در تحویل به استاد.' };
  }
}
