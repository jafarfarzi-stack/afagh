'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { courses } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { MALI_TYPE_LABELS } from '@/lib/mali-types';

/**
 * نقش‌های مجاز به تغییر «نوع درس مالی».
 *
 * چرا این‌ها؟ چون این فیلد مستقیماً پول دانشجو را تعیین می‌کند: هر درسی که
 * `legacyMaliType` نداشته باشد در موتور شهریه **صفر** حساب می‌شود. پس فقط
 * کارشناس آموزش (که تعریف درس را می‌شناسد) و مدیر/کارشناس مالی حق تغییر دارند؛
 * مدیر گروه و استاد نه.
 */
const EDITOR_ROLES = ['ADMIN', 'EDU_EXPERT', 'FINANCE_EXPERT', 'FINANCE'];

const PATH = '/admin/course-finance';

export interface SetMaliResult {
  ok: boolean;
  error?: string;
  maliType?: number | null;
}

/**
 * تعیین/حذف «نوع درس مالی» یک درس.
 * `null` یعنی برگرداندن به حالت «تعیین‌نشده» (شهریهٔ صفر) — عمداً مجاز است تا
 * اشتباهِ ثبت‌شده قابل بازگشت باشد.
 */
export async function setCourseMaliTypeAction(
  courseId: number,
  maliType: number | null,
): Promise<SetMaliResult> {
  await requireRole(EDITOR_ROLES);

  const id = Number(courseId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'شناسهٔ درس نامعتبر است.' };

  let value: number | null = null;
  if (maliType != null && String(maliType) !== '') {
    const n = Number(maliType);
    if (!Number.isInteger(n) || n < 0 || n > 99) return { ok: false, error: 'نوع درس مالی نامعتبر است.' };
    // فقط کدهای شناخته‌شدهٔ سما پذیرفته می‌شوند تا تایپویی در تعرفه گم نشود
    if (!(n in MALI_TYPE_LABELS) && n !== 0) {
      return { ok: false, error: `نوع ${n} در فهرست انواع درس مالی سما نیست.` };
    }
    value = n;
  }

  // مرز دانشگاهی: درس باید مال دانشگاه فعال باشد (جلوگیری از ویرایش بین‌دانشگاهی)
  const uni = await getCurrentUniversity().catch(() => null);
  if (!uni || !(uni.id > 0)) return { ok: false, error: 'دانشگاه فعال مشخص نیست.' };

  const updated = await db
    .update(courses)
    .set({ legacyMaliType: value })
    .where(and(eq(courses.id, id), eq(courses.universityId, uni.id)))
    .returning({ id: courses.id });

  if (!updated.length) return { ok: false, error: 'درس یافت نشد یا به دانشگاه فعال تعلق ندارد.' };

  revalidatePath(PATH);
  // کارتابل‌هایی که این عدد را نشان می‌دهند هم تازه شوند
  revalidatePath('/admin/tuition');
  revalidatePath('/group-manager/courses');
  return { ok: true, maliType: value };
}
