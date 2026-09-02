'use server';

import { findCardTokenByStudentCode } from '@/lib/verification';

/**
 * استعلام توکن کارت با شمارهٔ دانشجویی — کمک به نگهبان وقتی QR خوانده نمی‌شود.
 *
 * این مسیر عمومی است و عمداً فقط «توکن + نام» برمی‌گرداند (بدون کد ملی،
 * رشته یا وضعیت مالی)؛ جزئیات کامل فقط در صفحهٔ استعلام با همان توکن دیده
 * می‌شود.
 */
export async function findCardTokenByStudentCodeAction(studentCode: string): Promise<
  { ok: true; found: true; token: string; fullName: string } | { ok: true; found: false } | { ok: false; error: string }
> {
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
