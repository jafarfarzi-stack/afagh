'use server';

import { getSessionUser } from '@/lib/auth';
import { findCardTokenByStudentCode } from '@/lib/verification';
import { clientIp, guardedRateLimit } from '@/lib/rateLimit';

/**
 * استعلام توکن کارت با شمارهٔ دانشجویی — کمک به نگهبان/کارشناس وقتی QR خوانده نمی‌شود.
 *
 * 🔒 H-1: پیش‌تر این اکشن عمومی بود؛ چون «شمارهٔ دانشجویی» ترتیبی است، هر کسی
 * می‌توانست با پیمایش شماره‌ها نام و توکن کارت دانشجویان را جمع کند و بعد با
 * همان توکن صفحهٔ عمومی `/id/[token]` (نام، عکس، وضعیت مالی) را ببیند. حالا
 * فقط کاربران دارای نقش اداری (هم‌راستا با گارد شاخهٔ `/admin`) مجازند و
 * محدودیت نرخ نیز روی «کاربر + IP» اعمال می‌شود. صفحهٔ توکن (`/id/[token]`)
 * همچنان عمومی است تا اسکن QR کارت روی گیت بدون ورود کار کند.
 */
const CARD_LOOKUP_ROLES = [
  'ADMIN',
  'EDU_EXPERT',
  'ARCHIVE_EXPERT',
  'FINANCE_EXPERT',
  'FINANCE',
  'MILITARY_OFFICER',
  'VAULT_MANAGER',
  'DEP_HEAD',
  'VICE_EDU',
];

export async function findCardTokenByStudentCodeAction(studentCode: string): Promise<
  { ok: true; found: true; token: string; fullName: string } | { ok: true; found: false } | { ok: false; error: string }
> {
  const user = await getSessionUser().catch(() => null);
  if (!user) return { ok: false, error: 'برای استعلام با شمارهٔ دانشجویی باید وارد سامانه شوید.' };
  if (!(user.roles ?? []).some(r => CARD_LOOKUP_ROLES.includes(r))) {
    return { ok: false, error: 'این استعلام فقط برای کاربران دارای نقش اداری/حراست مجاز است.' };
  }

  const rl = await guardedRateLimit(`verify-card:${user.id}:${await clientIp()}`, 10, 10 * 60);
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
