'use server';

import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { getSessionUser, verifyPassword } from '@/lib/auth';
import { STEPUP_TTL, checkStepUpToken, issueStepUpToken, stepUpCookieName } from '@/lib/step-up';

const cookieOpts = (maxAge: number) => ({
  httpOnly: true as const,
  path: '/' as const,
  maxAge,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
});

async function ownPasswordHash(userId: number): Promise<string | null> {
  const [u] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  return typeof u?.passwordHash === 'string' ? u.passwordHash : null;
}

/**
 * تأیید رمز برای یک دامنهٔ حساس (مثلاً grades:edit) — در صورت درستی،
 * توکن ۱۰دقیقه‌ای در کوکی httpOnly می‌نشیند و اکشن حساس آن را می‌پذیرد.
 */
export async function requestStepUpAction(scope: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'ابتدا وارد شوید.' };
  if (!(scope in STEPUP_TTL)) return { ok: false, error: 'دامنهٔ تأیید نامعتبر است.' };
  const hash = await ownPasswordHash(user.id);
  if (!hash || !(await verifyPassword(password, hash))) {
    return { ok: false, error: 'رمز نادرست است.' };
  }
  const token = await issueStepUpToken(user.id, scope);
  (await cookies()).set(stepUpCookieName(scope), token, cookieOpts(STEPUP_TTL[scope]));
  return { ok: true };
}

/** راستی‌آزمایی صرف رمز کاربر جاری (برای قفل بیکاری) — توکن صادر نمی‌کند. */
export async function verifyOwnPasswordAction(password: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'نشست منقضی شده است؛ دوباره وارد شوید.' };
  const hash = await ownPasswordHash(user.id);
  if (!hash || !(await verifyPassword(password, hash))) {
    return { ok: false, error: 'رمز نادرست است.' };
  }
  return { ok: true };
}

/** آیا دامنهٔ حساس هم‌اکنون تأییدشده است؟ (برای نمایش/پنهان دکمه‌ها در UI) */
export async function stepUpStatusAction(scope: string): Promise<{ ok: boolean }> {
  const user = await getSessionUser().catch(() => null);
  if (!user || !(scope in STEPUP_TTL)) return { ok: false };
  return { ok: await checkStepUpToken(user.id, scope) };
}
