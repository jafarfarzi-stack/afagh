/**
 * Server Actions ماژول نمرات ادمین/کارشناس فارغ‌التحصیلی
 *
 * ثبت/ویرایش نمره توسط ادمین یا کارشناس فارغ‌التحصیلی (بدون OTP استاد)
 * با audit log کامل + محاسبه کد وضعیت سما
 */
'use server';

import { and, desc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { academic_terms, course_offerings, courses, enrollments, grade_change_log, legacy_grades, users } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { logGradeChange } from '@/lib/grade-change-log';
import { resolveSamaGradeStatusCode } from '@/lib/resolve-sama-code';

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

    // محاسبه کد وضعیت سما
    const samaCode = await resolveSamaGradeStatusCode(payload.studentId, targetOfferingId, payload.gradeValue);

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
    })
    .from(grade_change_log)
    .leftJoin(users, eq(users.id, grade_change_log.actorUserId))
    .where(eq(grade_change_log.studentId, studentId))
    .orderBy(desc(grade_change_log.createdAt));
}
