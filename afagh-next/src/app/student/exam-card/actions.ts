'use server';

import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { course_offerings, enrollments, evaluation_responses, students } from '@/db/schema';
import { getSessionUser } from '@/lib/auth';
import { createLogger } from '@/lib/logger';

const log = createLogger({ mod: 'exam-card' });

export type EvaluationPayload = {
  profMastery: number;
  profTeachingSkill: number;
  profDiscipline: number;
  profRespect: number;
  roomProjector: number;
  roomAirCondition: number;
  roomLighting: number;
  roomCleanliness: number;
  comment?: string;
};

const clampScore = (n: unknown) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(5, Math.max(1, v)) : 3;
};

/**
 * ثبت ارزشیابی دانشجو از درس/استاد/امکانات کلاس.
 *
 * پیش‌تر دکمهٔ «ثبت قطعی ارزشیابی» فقط وضعیت را در حافظهٔ مرورگر عوض می‌کرد و
 * هیچ ردیفی در پایگاه داده نوشته نمی‌شد؛ یعنی گیت صدور کارت عملاً با یک کلیک
 * باز می‌شد. حالا پاسخ‌ها در `evaluation_responses` نوشته و
 * `enrollments.hasEvaluated` در همان تراکنش به‌روز می‌شود.
 */
export async function submitCourseEvaluationAction(
  enrollmentId: number,
  payload: EvaluationPayload,
): Promise<{ ok: true; responseId: number } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'نشست شما منقضی شده است؛ دوباره وارد شوید.' };

  const [stu] = await db.select({ id: students.id }).from(students).where(eq(students.userId, user.id)).limit(1);
  if (!stu) return { ok: false, error: 'رکورد دانشجویی یافت نشد.' };

  const [en] = await db
    .select({ id: enrollments.id, offeringId: enrollments.offeringId, hasEvaluated: enrollments.hasEvaluated })
    .from(enrollments)
    .where(and(eq(enrollments.id, enrollmentId), eq(enrollments.studentId, stu.id)))
    .limit(1);
  if (!en) return { ok: false, error: 'این درس در فهرست ثبت‌نام شما نیست.' };
  if (en.hasEvaluated) return { ok: false, error: 'برای این درس پیش‌تر ارزشیابی ثبت کرده‌اید.' };

  const [off] = await db.select({ id: course_offerings.id }).from(course_offerings).where(eq(course_offerings.id, en.offeringId)).limit(1);

  const answers: { key: string; value: number }[] = [
    { key: 'profMastery', value: clampScore(payload.profMastery) },
    { key: 'profTeachingSkill', value: clampScore(payload.profTeachingSkill) },
    { key: 'profDiscipline', value: clampScore(payload.profDiscipline) },
    { key: 'profRespect', value: clampScore(payload.profRespect) },
    { key: 'roomProjector', value: clampScore(payload.roomProjector) },
    { key: 'roomAirCondition', value: clampScore(payload.roomAirCondition) },
    { key: 'roomLighting', value: clampScore(payload.roomLighting) },
    { key: 'roomCleanliness', value: clampScore(payload.roomCleanliness) },
  ];

  const comment = String(payload.comment ?? '').trim().slice(0, 2000);

  return await db.transaction(async tx => {
    // یک ردیف به ازای هر سؤال؛ `textAnswer` کلید سؤال را نگه می‌دارد تا بدون
    // نیاز به جدول سؤالاتِ پیکربندی‌شده هم قابل تفکیک و گزارش‌گیری باشد.
    const inserted = await tx
      .insert(evaluation_responses)
      .values(
        answers.map(a => ({
          offeringId: off.id,
          textAnswer: `${a.key}=${a.value}`,
        })),
      )
      .returning({ id: evaluation_responses.id });

    if (comment) {
      await tx.insert(evaluation_responses).values({ offeringId: off.id, textAnswer: `comment=${comment}` });
    }

    await tx.update(enrollments).set({ hasEvaluated: 1 }).where(eq(enrollments.id, en.id));

    log.info('course_evaluation_saved', { enrollmentId: en.id, offeringId: off.id, rows: inserted.length });
    return { ok: true as const, responseId: inserted[0]?.id ?? 0 };
  });
}
