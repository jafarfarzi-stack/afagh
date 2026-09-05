'use server';

import { and, eq, max } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import {
  class_sessions, classrooms, course_offerings, enrollments, professor_class_attendance,
  student_class_attendance,
} from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';

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
