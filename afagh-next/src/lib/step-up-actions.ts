'use server';

import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { getSessionUser, verifyPassword } from '@/lib/auth';
import { clientIp, getRateLimitCount, hitRateLimit, peekRateLimit, progressiveDelay } from '@/lib/rateLimit';
import { clearSessionLock, setSessionLock } from '@/lib/session-lock';
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
 * گیت سخت‌گیرانهٔ تأیید رمز (۵ خطا/۱۵دقیقه به‌ازای هر کاربر + هر IP):
 * فقط خطاها می‌شمارند؛ بالای سقف = قفل تصاعدی + لاگ هشدار (احتمال brute-force).
 */
async function stepUpGate(userId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = `stepup:pw:${userId}`;
  const ipKey = `stepup:ip:${(await clientIp()).slice(0, 64)}`;
  const [uRl, iRl] = await Promise.all([
    peekRateLimit(key, 5, 15 * 60),
    peekRateLimit(ipKey, 20, 15 * 60),
  ]);
  if (!uRl.ok || !iRl.ok) {
    const retry = Math.max(!uRl.ok ? uRl.retryAfterSec : 0, !iRl.ok ? iRl.retryAfterSec : 0);
    console.warn(`⚠ [step-up] قفل تأیید رمز برای کاربر ${userId} — ${Math.ceil(retry / 60)} دقیقه (احتمال تلاش فرسایشی).`);
    await progressiveDelay(await getRateLimitCount(key)).catch(() => {});
    return { ok: false, error: `تلاش‌های تأیید رمز بیش از حد مجاز شد. ${Math.ceil(retry / 60)} دقیقهٔ دیگر دوباره تلاش کنید.` };
  }
  return { ok: true };
}

async function stepUpFail(userId: number): Promise<void> {
  const key = `stepup:pw:${userId}`;
  const ipKey = `stepup:ip:${(await clientIp()).slice(0, 64)}`;
  await hitRateLimit(key, 15 * 60).catch(() => {});
  await hitRateLimit(ipKey, 15 * 60).catch(() => {});
}

/**
 * تأیید رمز برای یک دامنهٔ حساس (مثلاً grades:edit) — در صورت درستی،
 * توکن ۱۰دقیقه‌ای در کوکی httpOnly می‌نشیند و اکشن حساس آن را می‌پذیرد.
 */
export async function requestStepUpAction(scope: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'ابتدا وارد شوید.' };
  if (!(scope in STEPUP_TTL)) return { ok: false, error: 'دامنهٔ تأیید نامعتبر است.' };
  const gate = await stepUpGate(user.id);
  if (!gate.ok) return gate;
  const hash = await ownPasswordHash(user.id);
  if (!hash || !(await verifyPassword(password, hash))) {
    await stepUpFail(user.id);
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
  const gate = await stepUpGate(user.id);
  if (!gate.ok) return gate;
  const hash = await ownPasswordHash(user.id);
  if (!hash || !(await verifyPassword(password, hash))) {
    await stepUpFail(user.id);
    return { ok: false, error: 'رمز نادرث است.' };
  }
  await setSessionLock(user.id);
  return { ok: true };
}

/** آیا دامنهٔ حساس هم‌اکنون تأییدشده است؟ (برای نمایش/پنهان دکمه‌ها در UI) */
export async function stepUpStatusAction(scope: string): Promise<{ ok: boolean }> {
  const user = await getSessionUser().catch(() => null);
  if (!user || !(scope in STEPUP_TTL)) return { ok: false };
  return { ok: await checkStepUpToken(user.id, scope) };
}
