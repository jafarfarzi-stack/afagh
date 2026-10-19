'use server';

import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { getSessionUser, verifyPassword } from '@/lib/auth';
import { clientIp as rateLimitClientIp, getRateLimitCount, hitRateLimit, peekRateLimit, progressiveDelay } from '@/lib/rateLimit';
import { requestClientIp } from '@/lib/request-context';
import { clearSessionLock, setSessionLock } from '@/lib/session-lock';
import { STEPUP_TTL, checkStepUpToken, issueStepUpToken, stepUpCookieName } from '@/lib/step-up';
import { assertServerActionOrigin } from '@/lib/security';
import { createLogger } from '@/lib/logger';

const log = createLogger({ mod: 'step-up' });

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
 * کلید هویتِ IP برای گیت step-up — از منبعِ سخت‌شده.
 *
 * مدل اعتماد: منبع اصلی `requestClientIp()` است و فقط هویتی را می‌پذیرد که
 * پروکسیِ مورداعتماد با توکنِ مشترک تأیید کرده باشد (x-afagh-proxy-token +
 * x-afagh-client-ip). اگر استقرار پیکربندی نشده باشد، به `rateLimitClientIp()`
 * برمی‌گردیم که به‌جای سطلِ مشترکِ 'local'، کلیدِ اثرانگشتِ HMAC‌شده می‌سازد.
 * بدون این fallback، هدر قابل‌جعل بود (مهاجم با هر درخواست سطلِ تازه) و در
 * حالتِ «بدون پیکربندی»، ۲۰ خطای عمدی گیتِ step-up *همهٔ کاربران* را قفل می‌کرد.
 */
async function stepUpIpKey(): Promise<string> {
  const id = (await requestClientIp()) ?? (await rateLimitClientIp());
  return `stepup:ip:${id.slice(0, 64)}`;
}

/**
 * گیت سخت‌گیرانهٔ تأیید رمز (۵ خطا/۱۵دقیقه به‌ازای هر کاربر + هر IP):
 * فقط خطاها می‌شمارند؛ بالای سقف = قفل تصاعدی + لاگ هشدار (احتمال brute-force).
 * این گیت هم توسط `requestStepUpAction` و هم `verifyOwnPasswordCore` استفاده
 * می‌شود، پس هر دو از منبعِ سخت‌شدهٔ بالا بهره می‌برند.
 */
async function stepUpGate(userId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = `stepup:pw:${userId}`;
  const ipKey = await stepUpIpKey();
  const [uRl, iRl] = await Promise.all([
    peekRateLimit(key, 5, 15 * 60),
    peekRateLimit(ipKey, 20, 15 * 60),
  ]);
  if (!uRl.ok || !iRl.ok) {
    const retry = Math.max(!uRl.ok ? uRl.retryAfterSec : 0, !iRl.ok ? iRl.retryAfterSec : 0);
    log.warn('stepup_lockout', { userId, retryMinutes: Math.ceil(retry / 60) });
    await progressiveDelay(await getRateLimitCount(key)).catch(() => {});
    return { ok: false, error: `تلاش‌های تأیید رمز بیش از حد مجاز شد. ${Math.ceil(retry / 60)} دقیقهٔ دیگر دوباره تلاش کنید.` };
  }
  return { ok: true };
}

async function stepUpFail(userId: number): Promise<void> {
  const key = `stepup:pw:${userId}`;
  const ipKey = await stepUpIpKey();
  await hitRateLimit(key, 15 * 60).catch(() => {});
  await hitRateLimit(ipKey, 15 * 60).catch(() => {});
}

/**
 * تأیید رمز برای یک دامنهٔ حساس (مثلاً grades:edit) — در صورت درستی،
 * توکن ۱۰دقیقه‌ای در کوکی httpOnly می‌نشیند و اکشن حساس آن را می‌پذیرد.
 */
export async function requestStepUpAction(scope: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
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
export async function verifyOwnPasswordCore(password: string): Promise<{ ok: boolean; error?: string }> {
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'نشست منقضی شده است؛ دوباره وارد شوید.' };
  const gate = await stepUpGate(user.id);
  if (!gate.ok) return gate;
  const hash = await ownPasswordHash(user.id);
  if (!hash || !(await verifyPassword(password, hash))) {
    await stepUpFail(user.id);
    return { ok: false, error: 'رمز نادرست است.' };
  }
  await clearSessionLock(user.id);
  return { ok: true };
}

export async function verifyOwnPasswordAction(password: string): Promise<{ ok: boolean; error?: string }> {
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  return verifyOwnPasswordCore(password);
}

/**
 * ثبت قفل بیکاری در سمت سرور (کلاینت هنگام فعال‌شدن تایمر صدا می‌زند).
 * بدون این، رفرش صفحه قفلِ فقط-کلاینتی را دور می‌زد. نیازی به رمز ندارد چون
 * فقط برای نشستِ خودِ کاربر پرچم می‌گذارد؛ برداشتنش رمز می‌خواهد.
 */
export async function lockNowAction(): Promise<{ ok: boolean }> {
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false };
  const user = await getSessionUser().catch(() => null);
  if (!user) return { ok: false };
  await setSessionLock(user.id);
  return { ok: true };
}

/** آیا دامنهٔ حساس هم‌اکنون تأییدشده است؟ (برای نمایش/پنهان دکمه‌ها در UI) */
export async function stepUpStatusAction(scope: string): Promise<{ ok: boolean }> {
  const user = await getSessionUser().catch(() => null);
  if (!user || !(scope in STEPUP_TTL)) return { ok: false };
  return { ok: await checkStepUpToken(user.id, scope) };
}
