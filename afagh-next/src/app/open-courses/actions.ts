'use server';

import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { short_term_courses, short_term_discounts, short_term_learners, short_term_registrations } from '@/db/schema';
import { clientIp, guardedRateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

/** اعتبارسنجی واقعی کد تخفیف (پیش‌نمایش — مصرف نهایی هنگام ثبت انجام می‌شود) */
export async function validateDiscountCodeAction(courseId: number, code: string): Promise<{ ok: boolean; discountAmount?: number; error?: string }> {
  const trimmed = String(code ?? '').trim().toUpperCase();
  if (!trimmed) return { ok: false, error: 'کد تخفیف را وارد کنید.' };
  const rl = await guardedRateLimit(`open-discount:${await clientIp()}`, 30, 60);
  if (!rl.ok) return { ok: false, error: rl.error };
  try {
    const [row] = await db.select().from(short_term_discounts)
      .where(and(
        eq(short_term_discounts.code, trimmed),
        eq(short_term_discounts.isActive, 1),
        or(eq(short_term_discounts.courseId, courseId), isNull(short_term_discounts.courseId)),
      )).limit(1);
    if (!row) return { ok: false, error: 'کد تخفیف نامعتبر یا مخصوص این دوره نیست.' };
    if ((row.usedCount ?? 0) >= (row.maxUsage ?? 100)) return { ok: false, error: 'سهمیهٔ این کد تخفیف تکمیل شده است.' };
    const [course] = await db.select({ tuitionPrice: short_term_courses.tuitionPrice }).from(short_term_courses).where(eq(short_term_courses.id, courseId)).limit(1);
    if (!course) return { ok: false, error: 'دوره یافت نشد.' };
    const raw = Math.round((Number(course.tuitionPrice) * row.discountPercent) / 100);
    const discountAmount = row.maxDiscountAmount ? Math.min(raw, row.maxDiscountAmount) : raw;
    return { ok: true, discountAmount };
  } catch {
    return { ok: false, error: 'خطا در بررسی کد تخفیف.' };
  }
}

/**
 * ثبت‌نام عمومی دورهٔ آزاد (بدون ورود):
 *   • سپر نرخ به ازای IP؛
 *   • کد تخفیف با قفل ردیف و سهمیه (زیرا همزمانی)؛
 *   • ردیف ثبت‌نام با paymentStatus=PENDING و کد رهگیری واقعی سمت سرور.
 *   (پرداخت از طریق درگاه/شعبه — تأیید نهایی با کارشناس آموزش؛ هیچ مبلغی جعلاً «پرداخت‌شده» ثبت نمی‌شود.)
 */
export async function registerOpenCourseAction(input: {
  courseId: number;
  fullName: string;
  fullNameEn?: string;
  nationalId: string;
  mobile: string;
  discountCode?: string;
}): Promise<{ ok: boolean; trackingCode?: string; amountDue?: number; discountAmount?: number; error?: string }> {
  const rl = await guardedRateLimit(`open-register:${await clientIp()}`, 5, 10 * 60);
  if (!rl.ok) return { ok: false, error: rl.error };

  const fullName = String(input.fullName ?? '').trim();
  const mobile = String(input.mobile ?? '').trim();
  const nationalId = String(input.nationalId ?? '').trim();
  const courseId = Number(input.courseId);

  if (!fullName || !mobile) return { ok: false, error: 'نام و شمارهٔ همراه الزامی است.' };
  if (!/^09\d{9}$/.test(mobile)) return { ok: false, error: 'شمارهٔ همراه معتبر نیست (مثال: 09123456789).' };
  if (!/^\d{10}$/.test(nationalId)) return { ok: false, error: 'کد ملی باید ۱۰ رقم باشد.' };

  try {
    const [course] = await db.select().from(short_term_courses)
      .where(and(eq(short_term_courses.id, courseId), eq(short_term_courses.status, 'OPEN'))).limit(1);
    if (!course) return { ok: false, error: 'دوره یافت نشد یا ثبت‌نام آن بسته است.' };
    if ((course.enrolledCount ?? 0) >= course.capacity) {
      return { ok: false, error: 'ظرفیت این دوره تکمیل شده است.' };
    }

    const discountCode = String(input.discountCode ?? '').trim().toUpperCase();
    let discountAmount = 0;
    let usedDiscountId: number | null = null;

    // ── کد تخفیف: اعتبارسنجی + مصرف با قفل (جلوگیری از مصرف همزمان سهمیه) ──
    if (discountCode) {
      const [disc] = await db.select().from(short_term_discounts)
        .where(and(
          eq(short_term_discounts.code, discountCode),
          eq(short_term_discounts.isActive, 1),
          or(eq(short_term_discounts.courseId, courseId), isNull(short_term_discounts.courseId)),
        )).limit(1);
      if (!disc) return { ok: false, error: 'کد تخفیف نامعتبر است.' };
      if ((disc.usedCount ?? 0) >= (disc.maxUsage ?? 100)) return { ok: false, error: 'سهمیهٔ این کد تخفیف تکمیل شده است.' };
      const raw = Math.round((Number(course.tuitionPrice) * disc.discountPercent) / 100);
      discountAmount = disc.maxDiscountAmount ? Math.min(raw, disc.maxDiscountAmount) : raw;
      usedDiscountId = disc.id;
    }

    const amountDue = Math.max(0, Number(course.tuitionPrice) - discountAmount);

    // ── ثبت تراکنشی: یادگیرنده + ثبت‌نام + مصرف کد ──
    const trackingCode = `AFQ-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const result = await db.transaction(async tx => {
      // یادگیرنده: upsert با شمارهٔ همراه (کد ملی فقط در صورت خالی‌بودن ثبت می‌شود)
      const [existingLearner] = await tx.select().from(short_term_learners).where(eq(short_term_learners.mobile, mobile)).limit(1);
      let learnerId: number;
      if (existingLearner) {
        if (existingLearner.nationalId && existingLearner.nationalId !== nationalId) {
          throw new Error('این شمارهٔ همراه قبلاً با کد ملی دیگری ثبت شده است.');
        }
        learnerId = existingLearner.id;
        await tx.update(short_term_learners).set({ fullName, nationalId }).where(eq(short_term_learners.id, learnerId));
      } else {
        const [learner] = await tx.insert(short_term_learners).values({
          mobile, fullName,
          fullNameEn: String(input.fullNameEn ?? '').trim() || null,
          nationalId,
        }).returning({ id: short_term_learners.id });
        learnerId = learner.id;
      }

      const [reg] = await tx.insert(short_term_registrations).values({
        learnerId,
        courseId,
        trackingCode,
        discountAmount: discountAmount || null,
        discountCode: discountCode || null,
        amountPaid: 0,
        paymentStatus: 'PENDING',
        totalSessions: Math.max(8, Math.min(16, Math.round(Number(course.hours) / 5))),
      }).returning({ id: short_term_registrations.id });

      // مصرف سهمیهٔ کد تخفیف (همزمانی امن: شرط در WHERE)
      if (usedDiscountId) {
        const upd = await tx.update(short_term_discounts)
          .set({ usedCount: sql`coalesce(${short_term_discounts.usedCount}, 0) + 1` })
          .where(and(
            eq(short_term_discounts.id, usedDiscountId),
            eq(short_term_discounts.isActive, 1),
            sql`coalesce(${short_term_discounts.usedCount}, 0) < coalesce(${short_term_discounts.maxUsage}, 100)`,
          ))
          .returning({ id: short_term_discounts.id });
        if (upd.length === 0) throw new Error('سهمیهٔ کد تخفیف در همین لحظه تکمیل شد؛ دوباره تلاش کنید.');
      }

      // شمارش واقعی ظرفیت
      await tx.update(short_term_courses).set({ enrolledCount: sql`coalesce(${short_term_courses.enrolledCount}, 0) + 1` }).where(eq(short_term_courses.id, courseId));
      return reg.id;
    });

    logger.info('open_course_registered', { courseId, registrationId: result, trackingCode });
    revalidatePath('/open-courses');
    return { ok: true, trackingCode, amountDue, discountAmount: discountAmount || undefined };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'ثبت‌نام ناموفق بود.' };
  }
}
