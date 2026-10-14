'use server';

/**
 * تسویهٔ هزینه‌هایی که دانشجو «درخواست» می‌کند ولی **پرداختش را خودش تأیید نمی‌کند**.
 *
 * ⛔ چرا این فایل وجود دارد: هزینهٔ تمبر ابطال دانشنامه و هزینهٔ خدمات
 * دانش‌آموختگان قبلاً مستقیماً از اکشن دانشجو در `student_ledger` ردیف
 * `CREDIT` می‌نوشتند — یعنی بدون پرداخت واقعی، بدهی از دفتر پاک می‌شد
 * (جعل اعتبار). حالا نوشتن به دفتر فقط از این مسیر انجام می‌شود:
 *   • نقش مالی (نه دانشجو، نه کارشناس آموزشی)
 *   • قفل ردیف + تراکنش اتمیک (دو کارشناس همزمان = یک ثبت)
 *   • ثبت در زنجیرهٔ audit_logs
 *   • بررسی مرز دانشگاه
 */

import { revalidatePath } from 'next/cache';
import { requireRole, getSessionUser } from '@/lib/auth';
import { assertServerActionOrigin } from '@/lib/security';
import { settleStampFeeByFinance } from '@/lib/graduation-engine';
import { confirmAlumniFeeByFinance } from '@/lib/alumni';

const PAYMENT_ROLES = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'];

/** تسویهٔ هزینهٔ تمبر ابطال دانشنامه — پس از دریافت وجه نقد یا واریز */
export async function settleStampFeeAction(auditId: number): Promise<{ ok: boolean; error?: string }> {
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  const me = await requireRole(PAYMENT_ROLES);
  try {
    await settleStampFeeByFinance(auditId, me.id);
    revalidatePath('/admin/graduation');
    revalidatePath('/student/graduation');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'ثبت تسویه ناموفق بود' };
  }
}

/** تسویهٔ هزینهٔ خدمت دانش‌آموختگان — پس از دریافت وجه */
export async function confirmAlumniFeeAction(requestId: number): Promise<{ ok: boolean; error?: string }> {
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  const me = await requireRole(PAYMENT_ROLES);
  try {
    await confirmAlumniFeeByFinance(requestId, me.id);
    revalidatePath('/admin/alumni');
    revalidatePath('/alumni');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'ثبت تسویه ناموفق بود' };
  }
}

void getSessionUser;
