import { cookies } from 'next/headers';

/**
 * تأیید دومرحله‌ای عملیاتی (step-up): برای بخش‌های حساس (ثبت نمره توسط
 * کارشناس/ادمین، بازگشایی قفل بیکاری) کاربر باید رمزش را در یک پنجرهٔ
 * کوتاه (پیش‌فرض ۱۰ دقیقه) دوباره تأیید کرده باشد.
 *
 * سازوکار: توکن امضاشدهٔ HMAC (همان signToken/verifyTokenSignature در
 * verification.ts) در کوکی httpOnly با نام مخصوص هر دامنه. بدون 'use server'
 * تا هم اکشن‌ها و هم کامپوننت‌های سروری بتوانند واردش کنند.
 */

export const STEPUP_TTL: Record<string, number> = {
  /** ثبت/ویرایش نمره توسط کارشناس و ادمین */
  'grades:edit': 10 * 60,
  /** بازگشایی قفل خودکار بیکاری */
  'session:unlock': 10 * 60,
};

export const stepUpCookieName = (scope: string) =>
  `stepup_${scope.replace(/[^a-z0-9]/gi, '_')}`;

export async function issueStepUpToken(userId: number, scope: string): Promise<string> {
  const { signToken } = await import('@/lib/verification');
  return signToken({ uid: userId, scope }, STEPUP_TTL[scope] ?? 600);
}

/** آیا برای این کاربر در این دامنه، تأیید معتبرِ منقضی‌نشده وجود دارد؟ */
export async function checkStepUpToken(userId: number, scope: string): Promise<boolean> {
  try {
    const token = (await cookies()).get(stepUpCookieName(scope))?.value;
    if (!token) return false;
    const { verifyTokenSignature } = await import('@/lib/verification');
    const v = await verifyTokenSignature<{ uid: number; scope: string }>(token);
    if (!v.ok) return false;
    return Number((v.payload as { uid?: unknown }).uid) === userId
      && (v.payload as { scope?: unknown }).scope === scope;
  } catch {
    return false;
  }
}
