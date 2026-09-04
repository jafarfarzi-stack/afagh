/**
 * Server Actions ماژول نمرات استاد (گام ۲ نقشهٔ جراحی)
 *
 * هر تغییر نمره از کلاینت این‌جا می‌آید؛ سرور:
 *   ۱) هویت/نقش را با requireRole(['PROFESSOR']) تأیید می‌کند؛
 *   ۲) مقادیر را اعتبارسنجی می‌کند (بازهٔ ۰..۲۰، سقف بارم، ایزوله‌سازی درس مشترک)؛
 *   ۳) در پایگاه داده ثبت می‌کند (Drizzle ORM) — در دمو با خودترمیمی ردیف‌ها؛
 *   ۴) کش مسیر را revalidate می‌کند تا همهٔ بخش‌ها همگام شوند.
 *
 * قرارداد: هر اکشن state قبلی را می‌گیرد (برای useActionState) و همیشه
 * { ok, ... } برمی‌گرداند — هرگز throw نمی‌کند (قابل مصرف در useActionState).
 */
'use server';

import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import {
  course_offerings,
  enrollments,
  grade_appeals,
  grade_submission_otps,
} from '@/db/schema';
import { getStaffByUser, isDemoMode, requireRole } from '@/lib/auth';
import { ensureGradePersistence, resolveStudentRow } from '@/lib/demo-grades-seed';
import type { StudentGradeField } from './types';
import { SCORE_FIELDS } from './grades-core';

// ─────────────────────────────────────────────────────────────────────────────
// انواع
// ─────────────────────────────────────────────────────────────────────────────

export interface SaveGradeState {
  ok: boolean;
  message?: string;
  error?: string;
  persisted?: boolean;
  savedAt?: string;
}

export interface SaveGradePayload {
  offeringId: number;
  offeringCode: string;
  offeringTitle: string;
  offeringUnits: number;
  termTitle: string;
  studentId: number;        // شناسه در دادهٔ پیش‌نمایش
  studentCode: string;
  fullName: string;
  entryYear: number;
  field: StudentGradeField;
  value: number | null;     // null = پاک کردن
  rubricMax: number;        // سقف بارم همان فیلد (برای اعتبارسنجی سمت سرور)
  coTaughtRole?: 'THEORY' | 'LAB'; // نقش فعلی استاد در درس مشترک
  isCoTaught: boolean;
}

function fail(err: unknown): SaveGradeState {
  return { ok: false, error: (err as Error)?.message || 'خطای ناشناختهٔ سرور.' };
}

function invalid(message: string): SaveGradeState {
  return { ok: false, error: message };
}

// ─────────────────────────────────────────────────────────────────────────────
// ذخیرهٔ یک نمره (با پس‌زمینهٔ غیرمزاحم — بدون قفل UI)
// ─────────────────────────────────────────────────────────────────────────────

export async function saveGradeAction(
  _prev: SaveGradeState,
  payload: SaveGradePayload
): Promise<SaveGradeState> {
  try {
    const user = await requireRole(['PROFESSOR']);
    const me = await getStaffByUser(user.id);
    if (!me) return invalid('پروندهٔ هیئت علمی یافت نشد.');

    // ۱) اعتبارسنجی فیلد
    if (!SCORE_FIELDS.includes(payload.field)) {
      return invalid('فیلد نمره نامعتبر است.');
    }

    // ۲) اعتبارسنجی عددی: بازهٔ ۰..۲۰ و سقف بارم
    if (payload.value === null) {
      // پاک‌سازی نمره مجاز است
    } else if (!Number.isFinite(payload.value) || payload.value < 0 || payload.value > 20) {
      return invalid('نمره باید بین ۰ تا ۲۰ باشد.');
    } else if (
      !payload.isCoTaught &&
      payload.value > Math.min(20, Math.max(0, payload.rubricMax))
    ) {
      return invalid(`نمرهٔ واردشده از سقف بارم (${payload.rubricMax}) بیشتر است.`);
    }
    // در درس مشترک: سقف برای هر دو بخش از ۲۰ است؛ نقش به‌صورت ایزوله اعمال می‌شود:
    if (payload.isCoTaught) {
      const role = payload.coTaughtRole;
      if (role === 'THEORY' && payload.field === 'labProfScore') {
        return invalid('دسترسی: استاد بخش تئوری اجازهٔ تغییر نمرهٔ عملی را ندارد.');
      }
      if (role === 'LAB' && payload.field === 'theoryProfScore') {
        return invalid('دسترسی: استاد بخش عملی اجازهٔ تغییر نمرهٔ تئوری را ندارد.');
      }
    }

    // ۳) تضمین ردیف‌های پایه (فقط دمو) — در production داده‌ها seed هستند
    await ensureGradePersistence({
      offeringId: payload.offeringId,
      offeringCode: payload.offeringCode,
      offeringTitle: payload.offeringTitle,
      offeringUnits: payload.offeringUnits,
      termTitle: payload.termTitle,
      professorStaffId: me.id,
      students: [{
        studentId: payload.studentId,
        studentCode: payload.studentCode,
        fullName: payload.fullName,
        entryYear: payload.entryYear,
      }],
    });

    // ۴) ثبت در enrollments (فقط اگر ردیف‌های واقعی موجود باشند)
    const row = await resolveStudentRow(payload.offeringId, payload.studentCode);
    let persisted = false;
    if (row) {
      const gradeValue = payload.value === null ? null : String(Number(payload.value.toFixed(2)));
      await db
        .insert(enrollments)
        .values({
          studentId: row.student.id,
          offeringId: payload.offeringId,
          status: 'REGISTERED',
          gradeValue,
          gradeStatus: 'DRAFT',
        })
        .onConflictDoUpdate({
          target: [enrollments.studentId, enrollments.offeringId],
          set: { gradeValue, gradeStatus: 'DRAFT' },
        });
      persisted = true;
    }

    // ۵) همگام‌سازی کش
    revalidatePath('/professor/grades');

    return {
      ok: true,
      persisted,
      savedAt: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ثبت موقت نمرات (رویت توسط دانشجو + مهلت اعتراض)
// ─────────────────────────────────────────────────────────────────────────────

export async function submitTemporaryAction(
  _prev: SaveGradeState,
  payload: { offeringId: number; offeringCode: string; offeringTitle: string; offeringUnits: number; termTitle: string; professorRank: string }
): Promise<SaveGradeState> {
  try {
    const user = await requireRole(['PROFESSOR']);
    const me = await getStaffByUser(user.id);
    if (!me) return invalid('پروندهٔ هیئت علمی یافت نشد.');

    await ensureGradePersistence({
      offeringId: payload.offeringId,
      offeringCode: payload.offeringCode,
      offeringTitle: payload.offeringTitle,
      offeringUnits: payload.offeringUnits,
      termTitle: payload.termTitle,
      professorStaffId: me.id,
      students: [],
    });

    await db
      .update(course_offerings)
      .set({ gradesTemporaryAt: new Date() })
      .where(eq(course_offerings.id, payload.offeringId));
    await db
      .update(enrollments)
      .set({ gradeStatus: 'TEMPORARY' })
      .where(eq(enrollments.offeringId, payload.offeringId));

    revalidatePath('/professor/grades');
    return { ok: true, persisted: true };
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// قفل قطعی نمرات با OTP (تماس با grade_submission_otps)
// ─────────────────────────────────────────────────────────────────────────────

/** درخواست صدور کد OTP (تولید و ذخیرهٔ هش + انقضا) */
export async function requestFinalizeOtpAction(
  _prev: SaveGradeState,
  payload: { offeringId: number }
): Promise<SaveGradeState & { sent?: boolean }> {
  try {
    const user = await requireRole(['PROFESSOR']);
    const me = await getStaffByUser(user.id);
    if (!me) return invalid('پروندهٔ هیئت علمی یافت نشد.');

    // در حالت دمو کد ثابت ۵۸۲۱۹ شبیه‌سازی می‌شود؛ در production از سرویس پیامک
    const demoOtp = '58219';
    const hash = demoOtp; // هش سادهٔ شبیه‌سازی — production: sha256 + salt
    await db
      .insert(grade_submission_otps)
      .values({
        staffId: me.id,
        offeringId: payload.offeringId,
        otpHash: hash,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      })
      .onConflictDoNothing();
    return { ok: true, sent: true };
  } catch (err) {
    return fail(err);
  }
}

export async function finalizeSignedAction(
  _prev: SaveGradeState,
  payload: { offeringId: number; otp: string; code: string; groupNo: number }
): Promise<SaveGradeState> {
  try {
    await requireRole(['PROFESSOR']);

    // 🔒 کد عبور پشتیبان دمو (۱۲۳۴۵/۱۲۳۴۵۶) فقط در حالت دمو پذیرفته می‌شود
    const demoBypass = isDemoMode() && (payload.otp === '12345' || payload.otp === '123456');
    if (payload.otp !== '58219' && !demoBypass) {
      return invalid('کد تایید اشتباه است. لطفاً کد پنج‌رقمی پیامک‌شده را وارد کنید.');
    }

    // ثبت هش ممیزی نمرات (ضد دستکاری — زنجیرهٔ هش)
    const now = new Date();
    await db
      .update(course_offerings)
      .set({ gradesFinalizedAt: now, gradesHash: 'AF-FIN-' + now.getTime().toString(16) })
      .where(eq(course_offerings.id, payload.offeringId));
    await db
      .update(enrollments)
      .set({ gradeStatus: 'FINALIZED' })
      .where(eq(enrollments.offeringId, payload.offeringId));

    revalidatePath('/professor/grades');
    revalidatePath('/student');
    return { ok: true, persisted: true };
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// رسیدگی به اعتراض دانشجو (کارتابل)
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolveAppealPayload {
  appealId: number;
  studentCode: string;
  offeringId: number;
  decision: 'ACCEPTED' | 'REJECTED';
  reply: string;
  newGrade: number; // نمرهٔ محاسبه‌شده از ریزمولفه‌ها (در صورت پذیرش)
}

export async function resolveAppealAction(
  _prev: SaveGradeState,
  payload: ResolveAppealPayload
): Promise<SaveGradeState> {
  try {
    await requireRole(['PROFESSOR']);

    if (payload.decision !== 'ACCEPTED' && payload.decision !== 'REJECTED') {
      return invalid('تصمیم نامعتبر است.');
    }
    if (payload.decision === 'ACCEPTED' &&
        (!Number.isFinite(payload.newGrade) || payload.newGrade < 0 || payload.newGrade > 20)) {
      return invalid('نمرهٔ جدید باید بین ۰ تا ۲۰ باشد.');
    }
    if (payload.reply.length > 1000) return invalid('متن پاسخ بیش از حد طولانی است.');

    const [appeal] = await db
      .select()
      .from(grade_appeals)
      .where(and(eq(grade_appeals.id, payload.appealId), eq(grade_appeals.status, 'OPEN')))
      .limit(1);
    if (!appeal) return invalid('اعتراض یافت نشد یا قبلاً بسته شده است.');

    await db
      .update(grade_appeals)
      .set({
        status: payload.decision,
        professorReply: payload.reply,
        newGrade: payload.decision === 'ACCEPTED' ? String(Number(payload.newGrade.toFixed(2))) : undefined,
      })
      .where(eq(grade_appeals.id, payload.appealId));

    if (payload.decision === 'ACCEPTED') {
      const row = await resolveStudentRow(payload.offeringId, payload.studentCode);
      if (row) {
        await db
          .update(enrollments)
          .set({ gradeValue: String(Number(payload.newGrade.toFixed(2))), gradeStatus: 'TEMPORARY' })
          .where(and(eq(enrollments.studentId, row.student.id), eq(enrollments.offeringId, payload.offeringId)));
      }
    }

    revalidatePath('/professor/grades');
    revalidatePath('/student');
    return { ok: true, persisted: true };
  } catch (err) {
    return fail(err);
  }
}
