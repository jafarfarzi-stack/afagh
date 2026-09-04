'use server';

import { findCardTokenByStudentCode } from '@/lib/verification';
import { clientIp, guardedRateLimit } from '@/lib/rateLimit';

/**
 * استعلام توکن کارت با شمارهٔ دانشجویی — کمک به نگهبان وقتی QR خوانده نمی‌شود.
 *
 * این مسیر عمومی است و عمداً فقط «توکن + نام» برمی‌گرداند (بدون کد ملی،
 * رشته یا وضعیت مالی)؛ جزئیات کامل فقط در صفحهٔ استعلام با همان توکن دیده
 * می‌شود.
 *
 * 🔒 M-1: بدون rate-limit این مسیر «شمارش کد دانشجویی + کشف نام» را برای هر
 * کسی ممکن می‌کرد — سقف ۱۰ استعلام/۱۰ دقیقه به ازای هر IP اعمال شده است.
 */
export async function findCardTokenByStudentCodeAction(studentCode: string): Promise<
  { ok: true; found: true; token: string; fullName: string } | { ok: true; found: false } | { ok: false; error: string }
> {
  const rl = await guardedRateLimit(`verify-card:${await clientIp()}`, 10, 10 * 60);
  if (!rl.ok) return { ok: false, error: rl.error };

  const code = String(studentCode ?? '').trim();
  if (!code) return { ok: false, error: 'شمارهٔ دانشجویی را وارد کنید.' };
  try {
    const row = await findCardTokenByStudentCode(code);
    if (!row) return { ok: true, found: false };
    return { ok: true, found: true, token: row.token, fullName: row.fullName };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'خطا در استعلام.' };
  }
}
