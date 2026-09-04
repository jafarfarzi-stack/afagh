/**
 * Server Actions موتور چرخهٔ امتحانات — لایهٔ امنیتی ورود به موتور
 *
 * هر اکشن:
 *   ۱) نقش کاربر را با requireRole تأیید می‌کند؛
 *   ۲) هویت را از نشست می‌گیرد (کاربر/استاد/دانشجو/مراقب) و هرگز از payload؛
 *   ۳) مالکیت را چک می‌کند (IDOR: دانشجو فقط اعتراض خودش، استاد فقط درس خودش)؛
 *   ۴) موتور را با هویت سرور صدا می‌زند (پارامترهای هویتی payload نیستند)؛
 *   ۵) کش مسیرهای وابسته را revalidate می‌کند.
 *
 * قرارداد: هرگز throw نمی‌کند — همیشه { ok: true, ... } یا { ok: false, error }.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { course_offerings, enrollments } from '@/db/schema';
import { getStaffByUser, getStudentByUser, requireRole } from '@/lib/auth';
import * as engine from '@/lib/exam-engine';
import type { ExamAppealRecheck, ExamCheckIn, ExamGradeEntry } from '@/lib/exam-engine';
import type { RubricWeights } from '@/app/professor/grades/types';

type Res<T extends object = object> = ({ ok: true } & T) | ({ ok: false; error: string });

async function wrap<T extends object>(fn: () => Promise<T>): Promise<Res<T>> {
  try {
    const out = await fn();
    return { ok: true, ...out } as Res<T>;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

const reval = () => {
  revalidatePath('/admin/exams');
  revalidatePath('/proctor');
  revalidatePath('/professor/grades');
};

// ── ① صدور حضور و غیاب (اداری) ──
export async function examIssueAttendanceAction(sessionId: number) {
  const user = await requireRole(['ADMIN', 'EDU_EXPERT']);
  const out = await wrap(() => engine.issueExamAttendance(user.id, sessionId));
  reval();
  return out;
}

// ── ② ورود مراقب (خودِ مراقب — هویت از نشست) ──
export async function examProctorClockInAction(sessionId: number) {
  const user = await requireRole(['PROCTOR', 'ADMIN', 'EDU_EXPERT']);
  const me = await getStaffByUser(user.id);
  if (!me) return { ok: false, error: 'پروندهٔ پرسنلی یافت نشد.' };
  const out = await wrap(() => engine.proctorClockIn(user.id, sessionId, [me.id]));
  reval();
  return out;
}

// ── ② بررسی حضور و غیاب توسط مراقبِ خودِ سالن (هویت از نشست) ──
export async function examProctorVerifyAction(px: { sessionId: number; hallId: number; checkIns: ExamCheckIn[] }) {
  const user = await requireRole(['PROCTOR', 'ADMIN', 'EDU_EXPERT']);
  const me = await getStaffByUser(user.id);
  if (!me) return { ok: false, error: 'پروندهٔ پرسنلی یافت نشد.' };
  const out = await wrap(() =>
    engine.proctorVerifyAttendance(user.id, {
      sessionId: px.sessionId,
      hallId: px.hallId,
      proctorStaffId: me.id, // ← هویت سرور، نه payload
      checkIns: px.checkIns,
    }),
  );
  reval();
  return out;
}

// ── ③ امضای صورتجلسه (فقط مراقبِ همان سالن) ──
export async function examSignMinutesAction(px: {
  sessionId: number;
  hallId: number;
  notes?: string;
  cheatingIncidentsCount?: number;
}) {
  const user = await requireRole(['PROCTOR', 'ADMIN', 'EDU_EXPERT']);
  const me = await getStaffByUser(user.id);
  if (!me) return { ok: false, error: 'پروندهٔ پرسنلی یافت نشد.' };
  const out = await wrap(() =>
    engine.signHallMinutes(user.id, {
      sessionId: px.sessionId,
      hallId: px.hallId,
      supervisorStaffId: me.id, // ← هویت سرور
      notes: px.notes,
      cheatingIncidentsCount: px.cheatingIncidentsCount,
    }),
  );
  reval();
  return out;
}

// ── ④ دریافت سالن توسط مخزن + نهایی‌سازی (اداری) ──
export async function examVaultReceiveAction(px: { sessionId: number; hallId: number }) {
  const user = await requireRole(['ADMIN', 'EDU_EXPERT']);
  const me = await getStaffByUser(user.id);
  if (!me) return { ok: false, error: 'پروندهٔ پرسنلی یافت نشد.' };
  const out = await wrap(() =>
    engine.vaultReceiveHall(user.id, { sessionId: px.sessionId, hallId: px.hallId, vaultManagerId: me.id }),
  );
  reval();
  return out;
}

export async function examFinalizeHandoverAction(px: { sessionId: number }) {
  const user = await requireRole(['ADMIN', 'EDU_EXPERT']);
  const me = await getStaffByUser(user.id);
  if (!me) return { ok: false, error: 'پروندهٔ پرسنلی یافت نشد.' };
  const out = await wrap(() => engine.finalizeVaultHandover(user.id, px.sessionId, me.id));
  reval();
  return out;
}

// ── ⑤ تحویل به استادِ مالک درس (اداری؛ استاد از DB خوانده می‌شود نه payload) ──
export async function examDeliverToInstructorAction(px: { offeringId: number }) {
  const user = await requireRole(['ADMIN', 'EDU_EXPERT']);
  const me = await getStaffByUser(user.id);
  if (!me) return { ok: false, error: 'پروندهٔ پرسنلی یافت نشد.' };
  const [offering] = await db
    .select({ professorId: course_offerings.professorId })
    .from(course_offerings)
    .where(eq(course_offerings.id, px.offeringId))
    .limit(1);
  if (!offering?.professorId) return { ok: false, error: 'ارائهٔ درس یا استاد مالک یافت نشد.' };
  const out = await wrap(() =>
    engine.deliverToInstructor(user.id, {
      offeringId: px.offeringId,
      instructorId: Number(offering.professorId),
      vaultManagerId: me.id,
    }),
  );
  reval();
  return out;
}

// ── ⑥ ثبت نمرات (فقط استادِ مالک درس — هویت از نشست) ──
export async function examSubmitGradesAction(px: {
  offeringId: number;
  rubric: RubricWeights;
  entries: ExamGradeEntry[];
}) {
  const user = await requireRole(['PROFESSOR']);
  const me = await getStaffByUser(user.id);
  if (!me) return { ok: false, error: 'پروندهٔ هیئت علمی یافت نشد.' };
  const out = await wrap(() =>
    engine.submitExamGrades(user.id, {
      offeringId: px.offeringId,
      instructorId: me.id, // ← هویت سرور
      rubric: px.rubric,
      entries: px.entries,
    }),
  );
  reval();
  return out;
}

// ── ⑦ اعتراض (فقط دانشجوی خودِ ثبت‌نام — IDOR) ──
export async function examOpenAppealAction(px: { enrollmentId: number; studentMessage: string }) {
  const user = await requireRole(['STUDENT']);
  const stu = await getStudentByUser(user.id);
  if (!stu) return { ok: false, error: 'پروندهٔ دانشجویی یافت نشد.' };
  const [enr] = await db
    .select({ studentId: enrollments.studentId })
    .from(enrollments)
    .where(eq(enrollments.id, px.enrollmentId))
    .limit(1);
  if (!enr) return { ok: false, error: 'ثبت‌نام یافت نشد.' };
  if (Number(enr.studentId) !== Number(stu.id)) {
    return { ok: false, error: 'دسترسی: این ثبت‌نام متعلق به شما نیست.' };
  }
  const out = await wrap(() => engine.openExamAppeal(user.id, px));
  reval();
  return out;
}

// ── ⑧ پاسخ به اعتراض (فقط استاد مالک درس — IDOR) ──
export async function examAnswerAppealAction(px: {
  appealId: number;
  professorReply: string;
  rubric: RubricWeights;
  recheck: ExamAppealRecheck;
}) {
  const user = await requireRole(['PROFESSOR']);
  const me = await getStaffByUser(user.id);
  if (!me) return { ok: false, error: 'پروندهٔ هیئت علمی یافت نشد.' };
  const out = await wrap(() =>
    engine.answerExamAppeal(user.id, { ...px, staffId: me.id }), // ← هویت سرور + چک مالکیت در موتور
  );
  reval();
  return out;
}

// ── نمای کلی چرخه (برای هر نقش مجاز امتحانی) ──
export async function examChainOverviewAction(px: { sessionId: number }) {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'PROFESSOR', 'PROCTOR']);
  return wrap(() => engine.examChainOverview(px.sessionId));
}
