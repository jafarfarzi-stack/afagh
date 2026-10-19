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
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms, course_offerings, enrollments, exam_sessions, grade_appeals } from '@/db/schema';
import { getStaffByUser, getStudentByUser, requireRole } from '@/lib/auth';
import { verifyExamHandover, verifyExamTicket } from '@/lib/verification';
import * as engine from '@/lib/exam-engine';
import type { ExamAppealRecheck, ExamCheckIn, ExamGradeEntry } from '@/lib/exam-engine';
import { canActOnUniversity } from '@/lib/university-scope';
import { auditChain } from '@/lib/audit-chain';

type Res<T extends object = object> = ({ ok: true } & T) | ({ ok: false; error: string });

const DENY_UNI_MSG = 'دسترسی: این مورد متعلق به دانشگاه شما نیست.';

async function sessionUniversityId(sessionId: number): Promise<number | null> {
  const [row] = await db
    .select({ universityId: exam_sessions.universityId, termUniversityId: academic_terms.universityId })
    .from(exam_sessions)
    .leftJoin(academic_terms, eq(academic_terms.id, exam_sessions.termId))
    .where(eq(exam_sessions.id, sessionId))
    .limit(1);
  return row ? (row.universityId ?? row.termUniversityId ?? null) : null;
}

async function offeringUniversityId(offeringId: number): Promise<number | null> {
  const [row] = await db
    .select({ universityId: course_offerings.universityId })
    .from(course_offerings)
    .where(eq(course_offerings.id, offeringId))
    .limit(1);
  return row?.universityId ?? null;
}

async function sessionInScope(sessionId: number): Promise<boolean> {
  return canActOnUniversity(await sessionUniversityId(sessionId));
}

async function offeringInScope(offeringId: number): Promise<boolean> {
  return canActOnUniversity(await offeringUniversityId(offeringId));
}

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
  if (!(await sessionInScope(sessionId))) return { ok: false, error: DENY_UNI_MSG };
  const out = await wrap(() => engine.issueExamAttendance(user.id, sessionId));
  reval();
  return out;
}

// ── ② ورود مراقب (خودِ مراقب — هویت از نشست) ──
export async function examProctorClockInAction(sessionId: number) {
  const user = await requireRole(['PROCTOR', 'ADMIN', 'EDU_EXPERT']);
  const me = await getStaffByUser(user.id);
  if (!me) return { ok: false, error: 'پروندهٔ پرسنلی یافت نشد.' };
  if (!(await sessionInScope(sessionId))) return { ok: false, error: DENY_UNI_MSG };
  const out = await wrap(() => engine.proctorClockIn(user.id, sessionId, [me.id]));
  reval();
  return out;
}

// ── ② بررسی حضور و غیاب توسط مراقبِ خودِ سالن (هویت از نشست) ──
export async function examProctorVerifyAction(px: { sessionId: number; hallId: number; checkIns: ExamCheckIn[] }) {
  const user = await requireRole(['PROCTOR', 'ADMIN', 'EDU_EXPERT']);
  const me = await getStaffByUser(user.id);
  if (!me) return { ok: false, error: 'پروندهٔ پرسنلی یافت نشد.' };
  if (!(await sessionInScope(px.sessionId))) return { ok: false, error: DENY_UNI_MSG };
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

// ── ②.۱ اسکن QR کارت ورود به جلسه در ورودی سالن → ثبت حضور همان دانشجو ──
/**
 * مراقب QR کارت آزمون دانشجو را اسکن می‌کند (متن اسکن‌شده یا خودِ نشانی
 * `…/exam-ticket/<token>`)، توکن با امضای سامانه اعتبارسنجی می‌شود و حضور فقط
 * برای همان دانشجو در جدول `exam_attendances` ثبت می‌گردد. اگر دانشجو در
 * سالن/جلسهٔ جاری نباشد، هیچ ردیفی به‌روز نمی‌شود و پیام صریح برمی‌گردد.
 */
export async function examProctorScanAction(px: { sessionId: number; hallId: number; raw: string }) {
  const user = await requireRole(['PROCTOR', 'ADMIN', 'EDU_EXPERT']);
  const me = await getStaffByUser(user.id);
  if (!me) return { ok: false, error: 'پروندهٔ پرسنلی یافت نشد.' };

  const raw = String(px.raw ?? '').trim();
  if (!raw) return { ok: false, error: 'چیزی اسکن نشد.' };
  const m = raw.match(/exam-ticket\/([^/?#\s]+)/i);
  const token = decodeURIComponent((m ? m[1] : raw).trim());
  if (!token) return { ok: false, error: 'کد اسکن‌شده خوانا نیست.' };

  const res = await verifyExamTicket(token);
  if (!res.ok) return { ok: false, error: res.message || 'کارت ورود به جلسه نامعتبر است.' };
  if (!(await sessionInScope(px.sessionId))) return { ok: false, error: DENY_UNI_MSG };

  const out = await wrap(() =>
    engine.proctorVerifyAttendance(user.id, {
      sessionId: px.sessionId,
      hallId: px.hallId,
      proctorStaffId: me.id,
      checkIns: [{ studentId: res.studentId, isPresent: 1, method: 'QR_SCAN', hasTemporaryPermit: 0 }],
    }),
  );
  reval();

  const verified = Number((out as { verified?: number } | null)?.verified ?? 0);
  if (!verified) {
    return { ok: false, error: `${res.studentName} در این جلسه/سالن ثبت‌نام نشده است (کارت سالن دیگری است).`, studentName: res.studentName };
  }
  return {
    ok: true,
    studentId: res.studentId,
    studentName: res.studentName,
    studentCode: res.studentCode,
    verified,
  };
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
  if (!(await sessionInScope(px.sessionId))) return { ok: false, error: DENY_UNI_MSG };
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
  if (!(await sessionInScope(px.sessionId))) return { ok: false, error: DENY_UNI_MSG };
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
  if (!(await sessionInScope(px.sessionId))) return { ok: false, error: DENY_UNI_MSG };
  const out = await wrap(() => engine.finalizeVaultHandover(user.id, px.sessionId, me.id));
  reval();
  return out;
}

// ── ⑥ تأیید تحویل با اسکن QR (تحویلگیرنده: مخزن یا استاد) ──
/**
 * تحویلگیرنده کد QR تحویل را اسکن میکند (یا میچسباند) و همین اکشن، مرحلهٔ
 * متناظر زنجیرهٔ تحویل را اجرا میکند:
 *   ▸ VAULT      — مراقب → مخزن: `vaultReceiveHall`
 *   ▸ FINALIZE   — نهاییسازی تحویل همهٔ سالنهای جلسه: `finalizeVaultHandover`
 *   ▸ INSTRUCTOR — مخزن → استاد: `deliverToInstructor` (فقط استادِ مالک درس یا اداری)
 * هویت از نشست گرفته میشود، نه از payload؛ توکن فقط «کدام تحویل» را میگوید.
 */
export async function examHandoverConfirmAction(rawToken: string) {
  const raw = String(rawToken ?? '').trim();
  const m = raw.match(/exam-handover\/([^/?#\s]+)/i);
  const token = decodeURIComponent((m ? m[1] : raw).trim());
  if (!token) return { ok: false, error: 'کد تحویل خوانا نیست.' };

  const res = await verifyExamHandover(token);
  if (!res.ok) return { ok: false, error: res.message };
  if (!res.ok) return { ok: false, error: 'کد تحویل نامعتبر است.' };

  const roles = res.step === 'INSTRUCTOR'
    ? ['ADMIN', 'EDU_EXPERT', 'PROFESSOR']
    : res.step === 'ARCHIVE'
      ? ['ADMIN', 'EDU_EXPERT', 'ARCHIVE_EXPERT']
      : ['ADMIN', 'EDU_EXPERT', 'VAULT_MANAGER'];
  const user = await requireRole(roles);
  const me = await getStaffByUser(user.id);
  if (!me) return { ok: false, error: 'پروندهٔ پرسنلی یافت نشد.' };

  if (res.step === 'ARCHIVE') {
    if (!res.offeringId) return { ok: false, error: 'ارائهٔ درس مشخص نیست.' };
    if (!(await offeringInScope(res.offeringId))) return { ok: false, error: DENY_UNI_MSG };
    const out = await wrap(() =>
      engine.returnPapersToArchive(user.id, { offeringId: res.offeringId as number, archiveStaffId: me.id }),
    );
    reval();
    return { ok: true, message: 'بازگشت اوراق به بایگانی ثبت شد (شرط پرداخت حق‌الزحمهٔ تصحیح).', out };
  }

  if (res.step === 'INSTRUCTOR') {
    if (!res.offeringId) return { ok: false, error: 'ارائهٔ درس مشخص نیست.' };
    if (!(await offeringInScope(res.offeringId))) return { ok: false, error: DENY_UNI_MSG };
    const [offering] = await db
      .select({ professorId: course_offerings.professorId })
      .from(course_offerings)
      .where(eq(course_offerings.id, res.offeringId))
      .limit(1);
    if (!offering?.professorId) return { ok: false, error: 'استاد مالک درس یافت نشد.' };
    const isOwner = Number(offering.professorId) === Number(me.id);
    const isAdmin = user.roles.some(r => r === 'ADMIN' || r === 'EDU_EXPERT');
    if (!isOwner && !isAdmin) return { ok: false, error: 'این اوراق به شما تحویل نشده است.' };
    const out = await wrap(() =>
      engine.deliverToInstructor(user.id, {
        offeringId: res.offeringId as number,
        instructorId: Number(offering.professorId),
        vaultManagerId: me.id,
      }),
    );
    reval();
    return { ok: true, message: 'تحویل اوراق به استاد ثبت شد.', out };
  }

  if (!res.sessionId) return { ok: false, error: 'جلسهٔ امتحان مشخص نیست.' };
  if (!(await sessionInScope(res.sessionId))) return { ok: false, error: DENY_UNI_MSG };
  if (res.step === 'VAULT') {
    if (!res.hallId) return { ok: false, error: 'سالن مشخص نیست.' };
    const out = await wrap(() =>
      engine.vaultReceiveHall(user.id, { sessionId: res.sessionId as number, hallId: res.hallId as number, vaultManagerId: me.id }),
    );
    reval();
    return { ok: true, message: 'دریافت اوراق سالن توسط مخزن ثبت شد.', out };
  }
  const out = await wrap(() => engine.finalizeVaultHandover(user.id, res.sessionId as number, me.id));
  reval();
  return { ok: true, message: 'نهاییسازی تحویل اوراق به مخزن ثبت شد.', out };
}

// ── ⑦ حضور مراقب/استاد در جلسهٔ امتحان (دستی یا با اسکن) ──
/**
 * ثبت حضور مراقب یا استادِ درس در جلسهٔ امتحان.
 * کارشناس آموزش می‌تواند دستی تأیید کند (روش MANUAL_BY_EXPERT) و مراقب هم
 * حضور خودش را با روش CLOCK_IN ثبت می‌کند. یک ردیف به‌ازای هر (جلسه، نفر).
 */
export async function examStaffPresenceAction(px: {
  sessionId: number;
  hallId?: number | null;
  staffId: number;
  role: 'PROCTOR' | 'PROFESSOR';
  isPresent: boolean;
  note?: string | null;
}) {
  const user = await requireRole(['ADMIN', 'EDU_EXPERT', 'PROCTOR']);
  const me = await getStaffByUser(user.id);
  if (!me) return { ok: false, error: 'پروندهٔ پرسنلی یافت نشد.' };
  const sessionId = Number(px.sessionId);
  const staffId = Number(px.staffId);
  if (!sessionId || !staffId) return { ok: false, error: 'جلسه یا شخص نامعتبر است.' };
  if (!(await sessionInScope(sessionId))) return { ok: false, error: DENY_UNI_MSG };

  // مراقب فقط حضور خودش را می‌تواند ثبت کند؛ کارشناس/مدیر همه را
  const canAll = user.roles.some(r => r === 'ADMIN' || r === 'EDU_EXPERT');
  if (!canAll && staffId !== me.id) return { ok: false, error: 'شما فقط می‌توانید حضور خودتان را ثبت کنید.' };

  try {
    await db.transaction(async tx => {
      await tx.execute(sql`
        insert into exam_session_staff_attendance
          ("sessionId","hallId","staffId","role","isPresent","method","confirmedByStaffId","note","universityId")
        values (${sessionId}, ${px.hallId ?? null}, ${staffId}, ${px.role}, ${px.isPresent ? 1 : 0},
                ${px.isPresent ? (canAll ? 'MANUAL_BY_EXPERT' : 'CLOCK_IN') : null},
                ${me.id}, ${px.note ?? null},
                (select "universityId" from exam_sessions where id = ${sessionId}))
        on conflict ("sessionId","staffId") do update set
          "isPresent" = excluded."isPresent",
          "method" = excluded."method",
          "confirmedByStaffId" = excluded."confirmedByStaffId",
          "note" = excluded."note",
          "recordedAt" = now()
      `);
      await auditChain(tx, user.id, 'EXAM_STAFF_PRESENCE_RECORDED', 'exam_session', sessionId, {
        staffId, role: px.role, hallId: px.hallId ?? null, isPresent: px.isPresent ? 1 : 0,
      });
    });
    reval();
    return { ok: true, message: px.isPresent ? 'حضور ثبت شد.' : 'حضور لغو شد.' };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'ثبت حضور ممکن نشد.' };
  }
}

// ── ⑤ تحویل به استادِ مالک درس (اداری؛ استاد از DB خوانده می‌شود نه payload) ──
export async function examDeliverToInstructorAction(px: { offeringId: number }) {
  const user = await requireRole(['ADMIN', 'EDU_EXPERT']);
  const me = await getStaffByUser(user.id);
  if (!me) return { ok: false, error: 'پروندهٔ پرسنلی یافت نشد.' };
  if (!(await offeringInScope(px.offeringId))) return { ok: false, error: DENY_UNI_MSG };
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
  entries: ExamGradeEntry[];
}) {
  const user = await requireRole(['PROFESSOR']);
  const me = await getStaffByUser(user.id);
  if (!me) return { ok: false, error: 'پروندهٔ هیئت علمی یافت نشد.' };
  if (!(await offeringInScope(px.offeringId))) return { ok: false, error: DENY_UNI_MSG };
  const out = await wrap(() =>
    engine.submitExamGrades(user.id, {
      offeringId: px.offeringId,
      instructorId: me.id, // ← هویت سرور
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
    .select({ studentId: enrollments.studentId, universityId: enrollments.universityId })
    .from(enrollments)
    .where(eq(enrollments.id, px.enrollmentId))
    .limit(1);
  if (!enr) return { ok: false, error: 'ثبت‌نام یافت نشد.' };
  if (Number(enr.studentId) !== Number(stu.id)) {
    return { ok: false, error: 'دسترسی: این ثبت‌نام متعلق به شما نیست.' };
  }
  if (!(await canActOnUniversity(enr.universityId))) return { ok: false, error: DENY_UNI_MSG };
  const out = await wrap(() => engine.openExamAppeal(user.id, px));
  reval();
  return out;
}

// ── ⑧ پاسخ به اعتراض (فقط استاد مالک درس — IDOR) ──
export async function examAnswerAppealAction(px: {
  appealId: number;
  professorReply: string;
  recheck: ExamAppealRecheck;
}) {
  const user = await requireRole(['PROFESSOR']);
  const me = await getStaffByUser(user.id);
  if (!me) return { ok: false, error: 'پروندهٔ هیئت علمی یافت نشد.' };
  const [appeal] = await db
    .select({ universityId: grade_appeals.universityId })
    .from(grade_appeals)
    .where(eq(grade_appeals.id, px.appealId))
    .limit(1);
  if (!(await canActOnUniversity(appeal?.universityId))) return { ok: false, error: DENY_UNI_MSG };
  const out = await wrap(() =>
    engine.answerExamAppeal(user.id, {
      appealId: px.appealId,
      professorReply: px.professorReply,
      recheck: px.recheck,
      staffId: me.id, // ← هویت سرور + چک مالکیت در موتور
    }),
  );
  reval();
  return out;
}

// ── نمای کلی چرخه (برای هر نقش مجاز امتحانی) ──
export async function examChainOverviewAction(px: { sessionId: number }) {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'PROFESSOR', 'PROCTOR']);
  const universityId = await sessionUniversityId(px.sessionId);
  if (!(await canActOnUniversity(universityId))) return { ok: false, error: DENY_UNI_MSG };
  return wrap(() => engine.examChainOverview(px.sessionId, universityId as number));
}
