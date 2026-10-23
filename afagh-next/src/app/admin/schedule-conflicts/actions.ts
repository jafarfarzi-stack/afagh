'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { course_offerings, schedule_conflict_reviews } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { appendAudit } from '@/lib/audit';
import { getCurrentUniversity, isRealUniversityId } from '@/lib/university-scope';
import { loadScheduleConflicts, listTermsForConflicts, type ScheduleConflictReport } from '@/lib/schedule-conflicts';
import { CONFLICT_REASON_CODES } from '@/lib/schedule-conflicts-core';

/**
 * اقداماتِ کارشناس آموزش روی «تداخل‌های واقعی برنامهٔ هفتگی».
 *
 * سه راهِ رفع داریم و هیچ‌کدام داده را بی‌صدا خراب نمی‌کند:
 *  ۱) اصلاحِ واقعی: خودِ کارشناس از «تعریف درس در ترم» ساعت/سالن را عوض می‌کند
 *     (تداخل خودبه‌خود از فهرست می‌رود).
 *  ۲) ادغام: اگر واقعاً یک جلسه است، کلید ادغام می‌گیرند — هم از فهرست می‌روند
 *     و هم در تقویم استاد «کلاس ادغامی» دیده می‌شوند.
 *  ۳) پذیرش: اگر نه اصلاح می‌خواهد نه ادغام است (مثلاً استاد هماهنگ است)،
 *     با ذخیرهٔ دلیل علامت می‌خورد تا هفتهٔ بعد دوباره به‌چشم خطا نیاید.
 */
const EDITORS = ['ADMIN', 'EDU_EXPERT', 'VICE_EDU'] as const;
const PATH = '/admin/schedule-conflicts';

export type LoadResult =
  | { ok: true; report: ScheduleConflictReport }
  | { ok: false; error: string };

export type MutateResult = { ok: true; message?: string } | { ok: false; error: string };

async function scope() {
  const user = await requireRole([...EDITORS]);
  const uni = await getCurrentUniversity().catch(() => null);
  if (!uni || !isRealUniversityId(uni.id)) throw new Error('دانشگاه فعال مشخص نیست.');
  return { user, universityId: uni.id };
}

/** بارگذاریِ گزارش برای یک ترم — هنگام عوض‌شدنِ انتخاب‌گرِ ترم صدا زده می‌شود */
export async function loadConflictsAction(termId: number): Promise<LoadResult> {
  try {
    const { universityId } = await scope();
    const id = Number(termId);
    if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'ترم نامعتبر است.' };
    const report = await loadScheduleConflicts(id, universityId);
    return { ok: true, report };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'خطا در بارگذاری گزارش.' };
  }
}

/** ترم‌های قابل انتخاب (جدیدترین اول) */
export async function listTermsAction(): Promise<{ id: number; termCode: string; title: string }[]> {
  try {
    const { universityId } = await scope();
    return await listTermsForConflicts(universityId);
  } catch {
    return [];
  }
}

export interface MarkReviewedInput {
  termId: number;
  fingerprint: string;
  kind: 'PROFESSOR' | 'ROOM';
  entityId: number;
  dayOfWeek: number;
  scheduleAId: number;
  scheduleBId: number;
  reasonCode: string;
  reasonText?: string;
}

/** علامت‌زدنِ یک تداخل به‌عنوان «بررسی و پذیرفته‌شده» با دلیل */
export async function markConflictReviewedAction(input: MarkReviewedInput): Promise<MutateResult> {
  try {
    const { user, universityId } = await scope();
    const termId = Number(input?.termId);
    const fp = String(input?.fingerprint ?? '').trim();
    if (!Number.isInteger(termId) || termId <= 0) return { ok: false, error: 'ترم نامعتبر است.' };
    if (!fp) return { ok: false, error: 'اثرانگشتِ تداخل نامعتبر است.' };
    if (input.kind !== 'PROFESSOR' && input.kind !== 'ROOM') return { ok: false, error: 'نوع تداخل نامعتبر است.' };
    const reasonCode = CONFLICT_REASON_CODES.includes(String(input.reasonCode ?? ''))
      ? String(input.reasonCode)
      : 'OTHER';

    await db.transaction(async (tx) => {
      await tx.execute(sql`
        insert into schedule_conflict_reviews
          ("termId", "universityId", "kind", "entityId", "dayOfWeek",
           "scheduleAId", "scheduleBId", "fingerprint", "status",
           "reasonCode", "reasonText", "reviewedByUserId", "reviewedAt", "updatedAt")
        values (${termId}, ${universityId}, ${input.kind}, ${Number(input.entityId)}, ${Number(input.dayOfWeek)},
                ${Number(input.scheduleAId)}, ${Number(input.scheduleBId)}, ${fp}, 'REVIEWED',
                ${reasonCode}, ${String(input.reasonText ?? '').slice(0, 500) || null}, ${user.id}, now(), now())
        on conflict ("termId", "fingerprint")
        do update set "status" = 'REVIEWED',
                      "reasonCode" = excluded."reasonCode",
                      "reasonText" = excluded."reasonText",
                      "reviewedByUserId" = excluded."reviewedByUserId",
                      "reviewedAt" = now(),
                      "updatedAt" = now()
      `);
      await appendAudit(tx, {
        actorUserId: user.id,
        action: 'SCHEDULE_CONFLICT_REVIEWED',
        entityType: 'schedule_conflict',
        entityId: termId,
        details: JSON.stringify({ fingerprint: fp, kind: input.kind, reasonCode }),
      });
    });

    revalidatePath(PATH);
    return { ok: true, message: 'بررسی شد.' };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'خطا در ثبت بررسی.' };
  }
}

/** بازگرداندنِ یک تداخل به فهرستِ باز (لغوِ پذیرش) */
export async function undoConflictReviewAction(termId: number, fingerprint: string): Promise<MutateResult> {
  try {
    const { user } = await scope();
    const id = Number(termId);
    const fp = String(fingerprint ?? '').trim();
    if (!Number.isInteger(id) || id <= 0 || !fp) return { ok: false, error: 'ورودی نامعتبر است.' };
    await db.transaction(async (tx) => {
      await tx.delete(schedule_conflict_reviews).where(
        and(eq(schedule_conflict_reviews.termId, id), eq(schedule_conflict_reviews.fingerprint, fp)),
      );
      await appendAudit(tx, {
        actorUserId: user.id,
        action: 'SCHEDULE_CONFLICT_REVIEW_UNDO',
        entityType: 'schedule_conflict',
        entityId: id,
        details: JSON.stringify({ fingerprint: fp }),
      });
    });
    revalidatePath(PATH);
    return { ok: true, message: 'به فهرستِ باز برگشت.' };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'خطا در بازگردانی.' };
  }
}

/**
 * «ادغام کردنی است» — کلید ادغامِ مشترک می‌گیرند.
 *
 * نتیجه: این جفت از گزارش می‌رود (چون ادغامی حساب می‌شود) و در تقویمِ استاد
 * و برنامهٔ دانشجو با برچسبِ «کلاس ادغامی» دیده می‌شود. کلید با `MC-` شروع
 * می‌شود تا در صفحهٔ «ادغام دروس» به‌عنوان ادغامِ دستی شناخته شود.
 */
export async function markOfferingsMergedAction(termId: number, offeringIds: number[]): Promise<MutateResult> {
  try {
    const { user, universityId } = await scope();
    const id = Number(termId);
    const ids = [...new Set((offeringIds ?? []).map(Number))].filter(n => Number.isInteger(n) && n > 0);
    if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'ترم نامعتبر است.' };
    if (ids.length < 2) return { ok: false, error: 'حداقل دو کلاس برای ادغام لازم است.' };

    const rows = await db
      .select({ id: course_offerings.id, termId: course_offerings.termId })
      .from(course_offerings)
      .where(and(
        inArray(course_offerings.id, ids),
        eq(course_offerings.termId, id),
        eq(course_offerings.universityId, universityId),
      ));
    if (rows.length !== ids.length) {
      return { ok: false, error: 'یکی از کلاس‌ها یافت نشد یا به این ترم/دانشگاه تعلق ندارد.' };
    }

    const key = `MC-${id}-${Math.min(...ids)}`;
    await db.transaction(async (tx) => {
      await tx
        .update(course_offerings)
        .set({ sharedScheduleGroupKey: key })
        .where(and(inArray(course_offerings.id, ids), eq(course_offerings.termId, id)));
      await appendAudit(tx, {
        actorUserId: user.id,
        action: 'SCHEDULE_CONFLICT_MERGED',
        entityType: 'course_offering',
        entityId: Math.min(...ids),
        details: JSON.stringify({ offeringIds: ids, termId: id, key }),
      });
    });

    revalidatePath(PATH);
    revalidatePath('/admin/course-merge');
    return { ok: true, message: `${ids.length} کلاس با کلید «${key}» ادغام شد.` };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'خطا در ادغام.' };
  }
}
