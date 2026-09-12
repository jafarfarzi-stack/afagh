/**
 * ثبت تغییرات نمره — audit trail
 *
 * هر تغییر (ذخیره/موقت/نهایی/اعتراض/اعمال ادمین) یک ردیف append-only ثبت می‌کند.
 */
'use server';

import { db } from '@/db';
import { grade_change_log, enrollments } from '@/db/schema';
import { eq } from 'drizzle-orm';

export type GradeAction = 'DRAFT' | 'TEMPORARY' | 'FINALIZED' | 'APPEAL' | 'ADMIN_OVERRIDE';
export type ActorRole = 'PROFESSOR' | 'ADMIN' | 'GRADUATEAFFAIRS';

export interface LogGradeChangeParams {
  enrollmentId: number;
  studentId: number;
  offeringId: number;
  action: GradeAction;
  oldGradeValue?: string | null;
  newGradeValue?: string | null;
  oldGradeStatus?: string | null;
  newGradeStatus?: string | null;
  oldSamaStatusCode?: string | null;
  newSamaStatusCode?: string | null;
  reason?: string;
  actorUserId?: number;
  actorRole?: ActorRole;
}

/**
 * یک ردیف جدید به grade_change_log اضافه می‌کند.
 * اگر enrollment یافت نشد، خطا نمی‌دهد (سکوت).
 */
export async function logGradeChange(params: LogGradeChangeParams): Promise<void> {
  try {
    await db.insert(grade_change_log).values({
      enrollmentId: params.enrollmentId,
      studentId: params.studentId,
      offeringId: params.offeringId,
      action: params.action,
      oldGradeValue: params.oldGradeValue ?? null,
      newGradeValue: params.newGradeValue ?? null,
      oldGradeStatus: params.oldGradeStatus ?? null,
      newGradeStatus: params.newGradeStatus ?? null,
      oldSamaStatusCode: params.oldSamaStatusCode ?? null,
      newSamaStatusCode: params.newSamaStatusCode ?? null,
      reason: params.reason ?? null,
      actorUserId: params.actorUserId ?? null,
      actorRole: params.actorRole ?? null,
    });
  } catch {
    // ثبت log نباید فرآیند اصلی را متوقف کند
  }
}

/**
 * ثبت تغییر نمره برای یک ارائهٔ درس (همزمان برای همهٔ دانشجویان)
 * مثلاً هنگام submitTemporary یا finalizeSigned
 */
export async function logBulkGradeChange(
  offeringId: number,
  action: GradeAction,
  actorUserId?: number,
  actorRole?: ActorRole,
  reason?: string,
): Promise<void> {
  const rows = await db
    .select({
      id: enrollments.id,
      studentId: enrollments.studentId,
      gradeValue: enrollments.gradeValue,
      gradeStatus: enrollments.gradeStatus,
      samaGradeStatusCode: enrollments.samaGradeStatusCode,
    })
    .from(enrollments)
    .where(eq(enrollments.offeringId, offeringId));

  for (const r of rows) {
    await logGradeChange({
      enrollmentId: r.id,
      studentId: r.studentId,
      offeringId,
      action,
      oldGradeValue: r.gradeValue,
      newGradeValue: r.gradeValue,
      oldGradeStatus: r.gradeStatus,
      newGradeStatus: action === 'TEMPORARY' ? 'TEMPORARY' : action === 'FINALIZED' ? 'FINALIZED' : r.gradeStatus,
      oldSamaStatusCode: r.samaGradeStatusCode,
      actorUserId,
      actorRole,
      reason,
    });
  }
}

/**
 * واکشی تاریخچهٔ تغییرات نمرهٔ یک دانشجو
 */
export async function getGradeHistory(studentId: number, limit = 50) {
  return db
    .select()
    .from(grade_change_log)
    .where(eq(grade_change_log.studentId, studentId))
    .orderBy(grade_change_log.createdAt)
    .limit(limit);
}
