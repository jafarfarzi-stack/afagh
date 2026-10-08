'use server';

import { and, eq, max, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import {
  class_sessions, classrooms, course_offerings, enrollments, offering_professors, professor_class_attendance,
  schedules, student_class_attendance,
} from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';
import { generateClassSessionsForTerm } from '@/lib/class-session-generator';
import { logger } from '@/lib/logger';
import type { HardConflict } from '@/lib/scheduling-core';

export interface AttendanceEntry {
  studentId: number;
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED';
  lateMinutes?: number;
}

/** ذخیرهٔ حضور و غیاب یک جلسهٔ کلاس (استادِ خودِ درس) — تراکنشی: بازنویسی همان جلسه */
export async function saveSessionAttendanceAction(sessionId: number, entries: AttendanceEntry[]): Promise<{ ok: boolean; error?: string; savedCount?: number }> {
  try {
    const user = await requireRole(['PROFESSOR']);
    const me = await getStaffByUser(user.id);
    if (!me) return { ok: false, error: 'پروندهٔ هیئت علمی یافت نشد.' };

    const [session] = await db.select().from(class_sessions).where(eq(class_sessions.id, Number(sessionId))).limit(1);
    if (!session) return { ok: false, error: 'جلسه یافت نشد.' };
    const [offering] = await db.select({ professorId: course_offerings.professorId }).from(course_offerings)
      .where(eq(course_offerings.id, session.offeringId)).limit(1);
    if (!offering || offering.professorId !== me.id) return { ok: false, error: 'شما استاد این درس نیستید.' };

    const validStatuses = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'];
    const clean = entries.filter(e =>
      Number.isInteger(e.studentId) && validStatuses.includes(e.status),
    );
    if (clean.length === 0) return { ok: false, error: 'ردیف حضوری برای ذخیره وجود ندارد.' };

    await db.transaction(async tx => {
      await tx.delete(student_class_attendance).where(eq(student_class_attendance.sessionId, Number(sessionId)));
      const rows: (typeof student_class_attendance.$inferInsert)[] = [];
      for (const e of clean) {
        const [en] = await tx.select({ id: enrollments.id }).from(enrollments)
          .where(and(eq(enrollments.offeringId, session.offeringId), eq(enrollments.studentId, e.studentId))).limit(1);
        if (en) rows.push({ sessionId: Number(sessionId), enrollmentId: en.id, status: e.status });
      }
      if (rows.length) await tx.insert(student_class_attendance).values(rows);
      // ثبت حضور استاد — همان جلسه (بدون تکرار)
      await tx.delete(professor_class_attendance).where(and(
        eq(professor_class_attendance.sessionId, Number(sessionId)),
        eq(professor_class_attendance.staffId, me.id),
      ));
      await tx.insert(professor_class_attendance).values({
        sessionId: Number(sessionId), staffId: me.id,
        verificationMethod: 'MANUAL_ATTENDANCE_SHEET', status: 'VALID',
      });
    });

    revalidatePath('/professor/attendance');
    return { ok: true, savedCount: clean.length };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'خطا در ذخیرهٔ حضور و غیاب.' };
  }
}

/** درخواست/ثبت جلسهٔ جبرانی — ردیف واقعی class_sessions (isMakeUpSession=1) */
export async function scheduleMakeupSessionAction(input: {
  offeringId: number;
  replacedSessionId?: number;
  sessionDate: string; // شمسی YYYY/MM/DD
  startTime: string;   // HH:MM
  endTime: string;
  roomName: string;
  isDirect: boolean;   // بدون نیاز به تأیید آموزش
}): Promise<{ ok: boolean; error?: string; sessionId?: number }> {
  try {
    const user = await requireRole(['PROFESSOR']);
    const me = await getStaffByUser(user.id);
    if (!me) return { ok: false, error: 'پروندهٔ هیئت علمی یافت نشد.' };

    const offeringId = Number(input.offeringId);
    const [offering] = await db.select({ professorId: course_offerings.professorId }).from(course_offerings)
      .where(eq(course_offerings.id, offeringId)).limit(1);
    if (!offering || offering.professorId !== me.id) return { ok: false, error: 'شما استاد این درس نیستید.' };

    const [room] = await db.select({ id: classrooms.id }).from(classrooms).where(eq(classrooms.name, String(input.roomName))).limit(1);

    const [maxRow] = await db.select({ m: max(class_sessions.sessionNo) }).from(class_sessions).where(eq(class_sessions.offeringId, offeringId));
    const nextNo = (maxRow?.m ?? 0) + 1;

    const [row] = await db.insert(class_sessions).values({
      offeringId,
      sessionDate: String(input.sessionDate),
      startTime: String(input.startTime),
      endTime: String(input.endTime),
      status: input.isDirect ? 'SCHEDULED' : 'PROPOSED',
      isMakeUpSession: 1,
      replacedSessionId: input.replacedSessionId ? Number(input.replacedSessionId) : null,
      sessionNo: nextNo,
    }).returning({ id: class_sessions.id });

    logger.info('makeup_session_created', { sessionId: row.id, offeringId, direct: input.isDirect });
    revalidatePath('/professor/attendance');
    return { ok: true, sessionId: row.id };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'خطا در ثبت جلسهٔ جبرانی.' };
  }
}

export interface GenerateOfferingSessionsResult {
  ok: boolean;
  error?: string;
  generated?: number;
  skipped?: number;
  offerings?: number;
  perOffering?: number;
  already?: boolean;
  conflicts?: HardConflict[];
  termStart?: string | null;
}

export async function generateOfferingSessionsAction(offeringId: number): Promise<GenerateOfferingSessionsResult> {
  try {
    const user = await requireRole(['PROFESSOR']);
    const me = await getStaffByUser(user.id);
    if (!me) return { ok: false, error: 'پروندهٔ هیئت علمی یافت نشد.' };

    const oid = Number(offeringId);
    if (!Number.isInteger(oid) || oid <= 0) return { ok: false, error: 'درس نامعتبر است.' };

    const [offering] = await db
      .select({ id: course_offerings.id, professorId: course_offerings.professorId, termId: course_offerings.termId })
      .from(course_offerings)
      .where(eq(course_offerings.id, oid))
      .limit(1);
    if (!offering) return { ok: false, error: 'درس یافت نشد.' };

    let owned = offering.professorId === me.id;
    if (!owned) {
      const [shared] = await db
        .select({ id: offering_professors.id })
        .from(offering_professors)
        .where(and(eq(offering_professors.offeringId, oid), eq(offering_professors.staffId, me.id)))
        .limit(1);
      owned = !!shared;
    }
    if (!owned) return { ok: false, error: 'شما استاد این درس نیستید.' };

    const classRows = await db
      .select({ id: schedules.id })
      .from(schedules)
      .where(and(
        eq(schedules.offeringId, oid),
        eq(schedules.scheduleType, 'CLASS'),
        sql`${schedules.dayOfWeek} is not null`,
      ))
      .limit(1);
    if (classRows.length === 0) {
      return { ok: false, error: 'برای این درس زمان‌بندی هفتگی (CLASS) ثبت نشده است؛ با ادارهٔ آموزش هماهنگ کنید.' };
    }

    const regular = await db
      .select({ id: class_sessions.id })
      .from(class_sessions)
      .where(and(eq(class_sessions.offeringId, oid), eq(class_sessions.isMakeUpSession, 0)))
      .limit(1);
    if (regular.length > 0) {
      return { ok: true, generated: 0, skipped: 0, offerings: 0, perOffering: 0, already: true };
    }

    const preview = await generateClassSessionsForTerm(user.id, offering.termId, { dryRun: true, failOnHardConflict: false });
    if (!preview.ok) {
      return { ok: false, error: preview.error || 'تولید جلسات ناموفق بود.' };
    }
    const scoped = preview.hardConflicts.filter(h => h.offeringIds.includes(oid));
    if (scoped.length > 0) {
      return {
        ok: false,
        error: `زمان‌بندی این درس ${scoped.length} تداخل سخت دارد؛ پیش از تولید جلسات با ادارهٔ آموزش رفع کنید. نمونه: ${scoped[0].message}`,
        conflicts: scoped,
      };
    }

    const result = await generateClassSessionsForTerm(user.id, offering.termId, { failOnHardConflict: false });
    if (!result.ok) {
      return { ok: false, error: result.error || 'تولید جلسات ناموفق بود.' };
    }
    logger.info('offering_sessions_generated_by_professor', { offeringId: oid, termId: offering.termId, generated: result.generated });
    revalidatePath('/professor/attendance');
    return {
      ok: true,
      generated: result.generated,
      skipped: result.skipped,
      offerings: result.offerings,
      perOffering: result.sessionsPerOffering[oid] ?? 0,
      conflicts: result.hardConflicts.filter(h => h.offeringIds.includes(oid)),
      termStart: result.termStart,
    };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'خطا در تولید جلسات.' };
  }
}
