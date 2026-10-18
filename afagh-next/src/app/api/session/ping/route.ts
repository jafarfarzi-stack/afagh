import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { isIdle, isSessionLocked, resolveIdleTimeoutMinutes, setSessionLock, touchActivity } from '@/lib/session-lock';

export const dynamic = 'force-dynamic';

/**
 * ضربان نشست — منبع حقیقتِ قفل بیکاری.
 *
 * کلاینت دو حالت صدا می‌زند:
 *  • { active: true }  → کاربر در حال کار است؛ زمان فعالیت تازه می‌شود (قفل نشود).
 *  • { active: false } → تایمر بیکاری کلاینت تمام شده؛ فقط می‌پرسیم سرور چه می‌گوید.
 *
 * چرا route handler و نه server action: Server Actionها پشت پروکسی/آی‌فریم به
 * دلیل بررسی Origin/Host ممکن است رد شوند و آن‌وقت قفل دور زده می‌شد. این مسیر
 * فقط با کوکی نشست کار می‌کند و چون تصمیم نهایی در layout و بر پایهٔ همین زمان
 * گرفته می‌شود، رفرش هم قفل را نشان می‌دهد.
 */
export async function POST(req: Request) {
  const user = await getSessionUser().catch(() => null);
  if (!user) return NextResponse.json({ ok: false, locked: false, reason: 'no-session' }, { status: 401 });

  const timeoutMin = await resolveIdleTimeoutMinutes(user.roles).catch(() => 15);

  // پرچم قفل صریح (مثلاً قفل دستی/step-up) بر هر چیز مقدم است
  const explicit = await isSessionLocked(user.id).catch(() => false);
  if (explicit) return NextResponse.json({ ok: true, locked: true, timeoutMin });

  let active = false;
  try {
    const body = (await req.json()) as { active?: unknown } | null;
    active = body?.active === true;
  } catch { /* بدنهٔ خالی = پرسش وضعیت */ }

  if (active) {
    await touchActivity(user.id).catch(() => {});
    return NextResponse.json({ ok: true, locked: false, timeoutMin });
  }

  const idle = await isIdle(user.id, timeoutMin).catch(() => false);
  if (idle) {
    /**
     * 🔒 خودِ سرور قفل را **ثبت** می‌کند (نه فقط گزارش).
     *
     * چرا: پیش‌تر این مسیر فقط «قفل هست/نیست» را می‌گفت و ثبت پرچم به server
     * action کلاینت (`lockNowAction`) سپرده شده بود؛ اگر آن اکشن رد می‌شد
     * (ناهم‌خوانی Origin/Host پشت پروکسی، آی‌فریم، قطع لحظه‌ای شبکه) یا درخواست
     * به پروسهٔ دیگری می‌رفت، بستن تب و بازکردن مجدد آدرس، کارتابل را **بی‌رمز**
     * باز می‌کرد. حالا قفل با همین تشخیص بیکاری در سرور ثبت می‌شود و
     * `evaluateIdleLock` در layout هم همین کار را می‌کند؛ پس رفرش/تب جدید هم
     * قفل می‌ماند تا رمز درست وارد شود.
     */
    await setSessionLock(user.id).catch(() => {});
    return NextResponse.json({ ok: true, locked: true, timeoutMin });
  }
  return NextResponse.json({ ok: true, locked: false, timeoutMin });
}
