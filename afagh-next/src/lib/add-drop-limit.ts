import 'server-only';

import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms, course_offerings, enrollments } from '@/db/schema';
import { getSetting } from '@/lib/settings';

/**
 * سقف «حذف و اضافه» — جمعِ حذف + اضافهٔ یک دانشجو در بازهٔ حذف و اضافهٔ ترم.
 *
 * تنظیم: ADD_DROP_MAX_CHANGES (پیش‌فرض ۲ = «حذف و اضافه دو درس»).
 * ۰ = بدون سقف (رفتار پیشین).
 *
 * شمارش:
 *  • حذف: همهٔ ردیف‌های DROPPED همین دانشجو در همین ترم (حذف فقط داخل بازهٔ
 *    addDrop مجاز است ⇒ همهٔ آن‌ها داخل بازه‌اند).
 *  • اضافه: ردیف‌های REGISTERED / PENDING_COUNCIL که registeredAtشان داخل بازه است.
 */
export async function assertAddDropBudget(
  studentId: number,
  termId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const raw = await getSetting('ADD_DROP_MAX_CHANGES').catch(() => '2');
  const max = Math.max(0, Number(raw ?? 2) || 0);
  if (max === 0) return { ok: true };

  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.id, termId)).limit(1);
  if (!term) return { ok: true };
  const start = term.addDropStartDate ? new Date(term.addDropStartDate) : null;
  const end = term.addDropEndDate ? new Date(term.addDropEndDate) : null;
  if (!start || !end) return { ok: true };

  const [drops] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(enrollments)
    .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
    .where(and(
      eq(enrollments.studentId, studentId),
      eq(course_offerings.termId, termId),
      eq(enrollments.status, 'DROPPED'),
    ));

  const [adds] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(enrollments)
    .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
    .where(and(
      eq(enrollments.studentId, studentId),
      eq(course_offerings.termId, termId),
      inArray(enrollments.status, ['REGISTERED', 'PENDING_COUNCIL']),
      gte(enrollments.registeredAt, start),
      lte(enrollments.registeredAt, end),
    ));

  const used = Number(drops?.n ?? 0) + Number(adds?.n ?? 0);
  if (used >= max) {
    return {
      ok: false,
      error: `سقف حذف و اضافه (${max.toLocaleString('fa-IR')} درس) تکمیل است — تاکنون ${used.toLocaleString('fa-IR')} تغییر ثبت شده است.`,
    };
  }
  return { ok: true };
}
