/**
 * Server Actions ماژول نمرات ادمین/کارشناس فارغ‌التحصیلی
 *
 * ثبت/ویرایش نمره توسط ادمین یا کارشناس فارغ‌التحصیلی (بدون OTP استاد)
 * با audit log کامل + محاسبه کد وضعیت سما
 */
'use server';

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { academic_terms, course_offerings, courses, educational_regulations, enrollments, grade_change_log, legacy_grades, students, users } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { logGradeChange } from '@/lib/grade-change-log';
import { resolveSamaGradeStatusCode, syncStudentCourseRegulations } from '@/lib/resolve-sama-code';
import { gradeStatusTitleOf } from '@/lib/grade-status-codes';

export interface AdminGradeState {
  ok: boolean;
  message?: string;
  error?: string;
}

function fail(err: unknown): AdminGradeState {
  return { ok: false, error: (err as Error)?.message || 'خطای ناشناختهٔ سرور.' };
}

/**
 * ثبت/ویرایش نمره توسط ادمین یا کارشناس فارغ‌التحصیلی
 */
export async function adminSetGradeAction(
  _prev: AdminGradeState,
  payload: {
    enrollmentId?: number | null;
    offeringId?: number | null;
    studentId: number;
    studentCode: string;
    termCode?: string | null;
    courseCode?: string | null;
    gradeValue: number | null;
    customSamaStatusCode?: string | null;
    reason: string;
  }
): Promise<AdminGradeState> {
  try {
    const user = await requireRole(['ADMIN', 'GRADUATEAFFAIRS']);

    // اعتبارسنجی
    if (payload.gradeValue !== null &&
        (!Number.isFinite(payload.gradeValue) || payload.gradeValue < 0 || payload.gradeValue > 20)) {
      return { ok: false, error: 'نمره باید بین ۰ تا ۲۰ باشد.' };
    }
    if (!payload.reason || payload.reason.trim().length < 3) {
      return { ok: false, error: 'دلیل تغییر الزامی است (حداقل ۳ نویسه).' };
    }

    const gradeStr = payload.gradeValue !== null ? String(Number(payload.gradeValue.toFixed(2))) : null;
    const role = user.roles.includes('ADMIN') ? 'ADMIN' as const : 'GRADUATEAFFAIRS' as const;

    let targetOfferingId = payload.offeringId ?? null;
    let existingEnrollment: {
      id: number;
      offeringId: number;
      gradeValue: string | null;
      gradeStatus: string;
      samaGradeStatusCode: string | null;
    } | null = null;

    if (payload.enrollmentId) {
      const [e] = await db
        .select({
          id: enrollments.id,
          offeringId: enrollments.offeringId,
          gradeValue: enrollments.gradeValue,
          gradeStatus: enrollments.gradeStatus,
          samaGradeStatusCode: enrollments.samaGradeStatusCode,
        })
        .from(enrollments)
        .where(eq(enrollments.id, payload.enrollmentId))
        .limit(1);
      if (e) {
        existingEnrollment = e;
        targetOfferingId = e.offeringId;
      }
    }

    if (!existingEnrollment && targetOfferingId) {
      const [e] = await db
        .select({
          id: enrollments.id,
          offeringId: enrollments.offeringId,
          gradeValue: enrollments.gradeValue,
          gradeStatus: enrollments.gradeStatus,
          samaGradeStatusCode: enrollments.samaGradeStatusCode,
        })
        .from(enrollments)
        .where(and(eq(enrollments.studentId, payload.studentId), eq(enrollments.offeringId, targetOfferingId)))
        .limit(1);
      if (e) {
        existingEnrollment = e;
      }
    }

    // اگر ارائه پیدا نشد اما ترم و درس مشخص است، سعی در یافتن یا ساختن ارائه
    if (!targetOfferingId && payload.termCode && payload.courseCode) {
      const [c] = await db.select({ id: courses.id }).from(courses).where(eq(courses.code, payload.courseCode)).limit(1);
      const [t] = await db.select({ id: academic_terms.id }).from(academic_terms).where(eq(academic_terms.termCode, payload.termCode)).limit(1);
      if (c && t) {
        let [off] = await db
          .select({ id: course_offerings.id })
          .from(course_offerings)
          .where(and(eq(course_offerings.termId, t.id), eq(course_offerings.courseId, c.id)))
          .limit(1);
        if (!off) {
          const [newOff] = await db
            .insert(course_offerings)
            .values({
              termId: t.id,
              courseId: c.id,
              groupNumber: 1,
              capacity: 999,
              offeringType: 'TRANSFER',
            })
            .returning({ id: course_offerings.id });
          off = newOff;
        }
        if (off) {
          targetOfferingId = off.id;
          const [e] = await db
            .select({
              id: enrollments.id,
              offeringId: enrollments.offeringId,
              gradeValue: enrollments.gradeValue,
              gradeStatus: enrollments.gradeStatus,
              samaGradeStatusCode: enrollments.samaGradeStatusCode,
            })
            .from(enrollments)
            .where(and(eq(enrollments.studentId, payload.studentId), eq(enrollments.offeringId, off.id)))
            .limit(1);
          if (e) existingEnrollment = e;
        }
      }
    }

    if (!targetOfferingId) {
      return { ok: false, error: 'شناسه ارائه درس یا درس و ترم مربوطه یافت نشد.' };
    }

    // محاسبه کد وضعیت سما: اولویت با کد دستی تعیین‌شده توسط ادمین، در غیر اینصورت حل هوشمند از روی درس و آیین‌نامه
    const samaCode = payload.customSamaStatusCode?.trim() ||
      await resolveSamaGradeStatusCode(payload.studentId, targetOfferingId, payload.gradeValue);

    if (existingEnrollment) {
      await db
        .update(enrollments)
        .set({
          gradeValue: gradeStr,
          gradeStatus: 'FINALIZED',
          samaGradeStatusCode: samaCode,
        })
        .where(eq(enrollments.id, existingEnrollment.id));

      await logGradeChange({
        enrollmentId: existingEnrollment.id,
        studentId: payload.studentId,
        offeringId: targetOfferingId,
        action: 'ADMIN_OVERRIDE',
        oldGradeValue: existingEnrollment.gradeValue,
        newGradeValue: gradeStr,
        oldGradeStatus: existingEnrollment.gradeStatus,
        newGradeStatus: 'FINALIZED',
        oldSamaStatusCode: existingEnrollment.samaGradeStatusCode,
        newSamaStatusCode: samaCode,
        reason: payload.reason.trim(),
        actorUserId: user.id,
        actorRole: role,
      });
    } else {
      const [newEnr] = await db
        .insert(enrollments)
        .values({
          studentId: payload.studentId,
          offeringId: targetOfferingId,
          status: 'REGISTERED',
          gradeValue: gradeStr,
          gradeStatus: 'FINALIZED',
          samaGradeStatusCode: samaCode,
        })
        .returning({ id: enrollments.id });

      if (newEnr) {
        await logGradeChange({
          enrollmentId: newEnr.id,
          studentId: payload.studentId,
          offeringId: targetOfferingId,
          action: 'ADMIN_OVERRIDE',
          newGradeValue: gradeStr,
          newGradeStatus: 'FINALIZED',
          newSamaStatusCode: samaCode,
          reason: payload.reason.trim(),
          actorUserId: user.id,
          actorRole: role,
        });
      }
    }

    // همگام‌سازی legacy_grades در صورت تطابق ترم و درس
    if (payload.termCode && payload.courseCode) {
      try {
        await db
          .update(legacy_grades)
          .set({
            gradeValue: gradeStr,
            gradeStatus: 'FINALIZED',
          })
          .where(
            and(
              eq(legacy_grades.studentCode, payload.studentCode),
              eq(legacy_grades.termCode, payload.termCode),
              eq(legacy_grades.courseCode, payload.courseCode)
            )
          );
      } catch {
        // نادیده‌گیری خطای تطابق سوابق قدیمی
      }
    }

    // همگام‌سازی زنجیره‌ای آیین‌نامه برای تمام دفعات اخذ این درس توسط دانشجو
    try {
      const [offRow] = await db
        .select({ courseId: course_offerings.courseId })
        .from(course_offerings)
        .where(eq(course_offerings.id, targetOfferingId))
        .limit(1);
      if (offRow?.courseId) {
        await syncStudentCourseRegulations(payload.studentId, offRow.courseId, {
          actorUserId: user.id,
          actorRole: role,
        });
      }
    } catch {
      // نادیده‌گیری خطای همگام‌سازی زنجیره‌ای در عملیات مستقیم ادمین
    }

    revalidatePath('/admin/students');
    revalidatePath('/professor/grades');
    return { ok: true, message: 'نمره و کد وضعیت با موفقیت ثبت شد.' };
  } catch (err) {
    return fail(err);
  }
}

/**
 * واکشی تاریخچهٔ تغییرات نمرهٔ یک enrollment
 */
export async function getEnrollmentGradeHistory(enrollmentId: number) {
  await requireRole(['ADMIN', 'GRADUATEAFFAIRS', 'PROFESSOR']);
  return db
    .select({
      id: grade_change_log.id,
      enrollmentId: grade_change_log.enrollmentId,
      offeringId: grade_change_log.offeringId,
      action: grade_change_log.action,
      oldGradeValue: grade_change_log.oldGradeValue,
      newGradeValue: grade_change_log.newGradeValue,
      oldGradeStatus: grade_change_log.oldGradeStatus,
      newGradeStatus: grade_change_log.newGradeStatus,
      oldSamaStatusCode: grade_change_log.oldSamaStatusCode,
      newSamaStatusCode: grade_change_log.newSamaStatusCode,
      reason: grade_change_log.reason,
      actorUserId: grade_change_log.actorUserId,
      actorRole: grade_change_log.actorRole,
      createdAt: grade_change_log.createdAt,
      actorFirstName: users.firstName,
      actorLastName: users.lastName,
    })
    .from(grade_change_log)
    .leftJoin(users, eq(users.id, grade_change_log.actorUserId))
    .where(eq(grade_change_log.enrollmentId, enrollmentId))
    .orderBy(desc(grade_change_log.createdAt));
}

/**
 * واکشی کلیه لاگ‌های تغییر نمرهٔ یک دانشجو (برای ادمین و کارشناس فارغ‌التحصیلان)
 * + نام درس/کد درس/ترم تا در modal مشخص باشد کدام درس عوض شده.
 */
export async function getStudentGradeAuditLog(studentId: number) {
  await requireRole(['ADMIN', 'GRADUATEAFFAIRS', 'EDU_EXPERT']);
  return db
    .select({
      id: grade_change_log.id,
      enrollmentId: grade_change_log.enrollmentId,
      offeringId: grade_change_log.offeringId,
      action: grade_change_log.action,
      oldGradeValue: grade_change_log.oldGradeValue,
      newGradeValue: grade_change_log.newGradeValue,
      oldGradeStatus: grade_change_log.oldGradeStatus,
      newGradeStatus: grade_change_log.newGradeStatus,
      oldSamaStatusCode: grade_change_log.oldSamaStatusCode,
      newSamaStatusCode: grade_change_log.newSamaStatusCode,
      reason: grade_change_log.reason,
      actorUserId: grade_change_log.actorUserId,
      actorRole: grade_change_log.actorRole,
      createdAt: grade_change_log.createdAt,
      actorFirstName: users.firstName,
      actorLastName: users.lastName,
      courseCode: courses.code,
      courseTitle: courses.title,
      termCode: academic_terms.termCode,
      termTitle: academic_terms.title,
    })
    .from(grade_change_log)
    .leftJoin(users, eq(users.id, grade_change_log.actorUserId))
    .leftJoin(course_offerings, eq(course_offerings.id, grade_change_log.offeringId))
    .leftJoin(courses, eq(courses.id, course_offerings.courseId))
    .leftJoin(academic_terms, eq(academic_terms.id, course_offerings.termId))
    .where(eq(grade_change_log.studentId, studentId))
    .orderBy(desc(grade_change_log.createdAt));
}

/** لاگ سراسری (همهٔ دانشجویان) — برای صفحهٔ «همهٔ لاگ‌های نمرات» */
export async function getAllGradeAuditLogs(opts?: { limit?: number; offset?: number; q?: string }) {
  await requireRole(['ADMIN', 'GRADUATEAFFAIRS', 'EDU_EXPERT']);
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
  const offset = Math.max(opts?.offset ?? 0, 0);
  // q: فیلتر روی نام درس/کددرس/شماره‌دانشجویی/نام دانشجو (ساده - LIKE)
  const { sql } = await import('drizzle-orm');
  const q = opts?.q?.trim() ?? '';
  const rows = await db
    .select({
      id: grade_change_log.id,
      enrollmentId: grade_change_log.enrollmentId,
      offeringId: grade_change_log.offeringId,
      studentId: grade_change_log.studentId,
      action: grade_change_log.action,
      oldGradeValue: grade_change_log.oldGradeValue,
      newGradeValue: grade_change_log.newGradeValue,
      reason: grade_change_log.reason,
      actorUserId: grade_change_log.actorUserId,
      actorRole: grade_change_log.actorRole,
      createdAt: grade_change_log.createdAt,
      actorFirstName: users.firstName,
      actorLastName: users.lastName,
      courseCode: courses.code,
      courseTitle: courses.title,
      termCode: academic_terms.termCode,
    })
    .from(grade_change_log)
    .leftJoin(users, eq(users.id, grade_change_log.actorUserId))
    .leftJoin(course_offerings, eq(course_offerings.id, grade_change_log.offeringId))
    .leftJoin(courses, eq(courses.id, course_offerings.courseId))
    .leftJoin(academic_terms, eq(academic_terms.id, course_offerings.termId))
    .orderBy(desc(grade_change_log.createdAt))
    .limit(limit)
    .offset(offset);
  // فیلتر کلاینتی ساده اگر q داده شد (برای اینکه LIKE فارسی نرمال هم بخورد، فعلاً exact)
  if (!q) return rows;
  const nq = q.toLowerCase();
  return rows.filter(r =>
    (r.courseCode ?? '').toLowerCase().includes(nq) ||
    (r.courseTitle ?? '').toLowerCase().includes(nq) ||
    (r.termCode ?? '').includes(nq) ||
    String(r.studentId).includes(nq),
  );
}

/**
 * پیش‌نمایش کد وضعیت سما برای نمرهٔ ورودی در کلاینت
 */
export async function resolveSamaCodeForGradeAction(
  studentId: number,
  offeringId: number,
  gradeValue: number | null,
): Promise<{ code: string | null; title: string }> {
  const code = await resolveSamaGradeStatusCode(studentId, offeringId, gradeValue);
  const title = gradeStatusTitleOf(code) || 'نامشخص';
  return { code, title };
}

// ═══════════════════════════════════════════════════════════════════
//  بازمحاسبه دسته‌ای کدهای وضعیت سما بر اساس آیین‌نامه
// ═══════════════════════════════════════════════════════════════════

export interface MismatchRow {
  enrollmentId: number;
  studentId: number;
  studentCode: string;
  studentName: string;
  courseCode: string;
  courseTitle: string;
  termCode: string;
  gradeValue: string | null;
  currentCode: string | null;
  correctCode: string | null;
  correctTitle: string;
  originalCode: string | null; // کد اصلی وارداتی سما
  regulationTitle: string | null;
}

/**
 * بررسی همه enrollmentها و برگرداندن لیست نمراتی که کد وضعیتشان نادرست است
 */
export async function scanMismatchedSamaCodes(): Promise<MismatchRow[]> {
  await requireRole(['ADMIN']);

  const allEnrs = await db
    .select({
      enrollmentId: enrollments.id,
      studentId: enrollments.studentId,
      studentCode: students.studentCode,
      courseId: course_offerings.courseId,
      offeringId: enrollments.offeringId,
      termCode: academic_terms.termCode,
      gradeValue: enrollments.gradeValue,
      gradeStatus: enrollments.gradeStatus,
      currentCode: enrollments.samaGradeStatusCode,
      originalCode: enrollments.originalSamaCode,
      regTitle: educational_regulations.title,
    })
    .from(enrollments)
    .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
    .innerJoin(academic_terms, eq(academic_terms.id, course_offerings.termId))
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .leftJoin(educational_regulations, eq(educational_regulations.id, students.regulationId))
    .where(eq(enrollments.gradeStatus, 'FINALIZED'))
    .orderBy(students.studentCode, academic_terms.termCode);

  const mismatches: MismatchRow[] = [];

  // پردازش دسته‌ای برای جلوگیری از overload سرور
  const BATCH = 20;
  for (let i = 0; i < allEnrs.length; i += BATCH) {
    const batch = allEnrs.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (enr) => {
        const correctCode = await resolveSamaGradeStatusCode(enr.studentId, enr.offeringId, enr.gradeValue);
        const cur = enr.currentCode?.trim() || null;
        if (cur !== correctCode) {
          return {
            enrollmentId: enr.enrollmentId,
            studentId: enr.studentId,
            studentCode: enr.studentCode,
            studentName: '',
            courseCode: '',
            courseTitle: '',
            termCode: enr.termCode,
            gradeValue: enr.gradeValue,
            currentCode: cur,
            correctCode,
            correctTitle: gradeStatusTitleOf(correctCode) || 'نامشخص',
            originalCode: enr.originalCode?.trim() || null,
            regulationTitle: enr.regTitle,
          } as MismatchRow;
        }
        return null;
      })
    );
    for (const r of results) {
      if (r) mismatches.push(r);
    }
  }

  // گرفتن نام و نام درس برای رکوردهای mismatch
  if (mismatches.length > 0) {
    const enrIds = mismatches.map(m => m.enrollmentId);
    const details = await db
      .select({
        enrollmentId: enrollments.id,
        studentName: sql<string>`(${users.firstName} || ' ' || ${users.lastName})`,
        courseCode: courses.code,
        courseTitle: courses.title,
      })
      .from(enrollments)
      .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
      .innerJoin(courses, eq(courses.id, course_offerings.courseId))
      .innerJoin(students, eq(students.id, enrollments.studentId))
      .innerJoin(users, eq(users.id, students.userId))
      .where(inArray(enrollments.id, enrIds));

    const detailMap = new Map(details.map(d => [d.enrollmentId, d]));
    for (const m of mismatches) {
      const d = detailMap.get(m.enrollmentId);
      if (d) {
        m.studentName = d.studentName;
        m.courseCode = d.courseCode;
        m.courseTitle = d.courseTitle;
      }
    }
  }

  return mismatches;
}

/**
 * اعمال کدهای صحیح روی نمرات نادرست (بچ اصلاح)
 */
export async function applyCorrectedSamaCodes(enrollmentIds: number[]): Promise<{ applied: number }> {
  await requireRole(['ADMIN']);
  let applied = 0;

  for (const eid of enrollmentIds) {
    const [enr] = await db
      .select({
        id: enrollments.id,
        studentId: enrollments.studentId,
        offeringId: enrollments.offeringId,
        gradeValue: enrollments.gradeValue,
        currentCode: enrollments.samaGradeStatusCode,
        originalCode: enrollments.originalSamaCode,
      })
      .from(enrollments)
      .where(eq(enrollments.id, eid))
      .limit(1);
    if (!enr) continue;

    const correctCode = await resolveSamaGradeStatusCode(enr.studentId, enr.offeringId, enr.gradeValue);
    const cur = enr.currentCode?.trim() || null;
    if (cur === correctCode) continue;

    await db
      .update(enrollments)
      .set({
        samaGradeStatusCode: correctCode,
        originalSamaCode: enr.originalCode ?? enr.currentCode,
      })
      .where(eq(enrollments.id, eid));

    await logGradeChange({
      enrollmentId: eid,
      studentId: enr.studentId,
      offeringId: enr.offeringId,
      action: 'ADMIN_OVERRIDE',
      oldGradeValue: enr.gradeValue,
      newGradeValue: enr.gradeValue,
      oldGradeStatus: 'FINALIZED',
      newGradeStatus: 'FINALIZED',
      oldSamaStatusCode: cur,
      newSamaStatusCode: correctCode,
      reason: `بازمحاسبه خودکار کد وضعیت سما بر اساس آیین‌نامه (قبلی: ${cur})`,
    });
    applied++;
  }

  revalidatePath('/admin/regulation-check');
  return { applied };
}
