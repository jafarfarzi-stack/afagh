import 'server-only';
import { NextRequest, NextResponse } from 'next/server';

/**
 * ══════════════════════════════════════════════════════════════
 *  دفاع CSRF برای Route Handlerها (نه Server Actions)
 *
 *  Server Actions در Next.js محافظ داخلی دارند؛ اما Route Handlerهای
 *  POST/PUT/DELETE که با کوکی نشست کار می‌کنند تا قبل از این هیچ
 *  محافظ مبدأ نداشتند — با کوکی SameSite=None (HTTPS) یک حملهٔ
 *  CSRF قابل اجرا بود (C-2).
 *
 *  قواعد (مطابق الگوی رایج Django/OWASP):
 *   ۱) اگر هدر Origin موجود باشد → باید با Host درخواست هم‌مبدأ باشد
 *      (یا در لیست سفید ALLOWED_EXTRA_ORIGINS قرار گیرد).
 *   ۲) اگر Origin نبود ولی Referer بود → Referer باید هم‌مبدأ باشد.
 *   ۳) نه Origin نه Referer → کلاینت غیرمرورگری (curl/cron/server)؛
 *      CSRF واقعی نمی‌تواند بدون Origin/Referer در مرورگر رخ دهد → مجاز.
 *
 *  فقط host مقایسه می‌شود (نه scheme) تا پشت پروکسی Caddy کار کند.
 * ══════════════════════════════════════════════════════════════
 */

const EXTRA_ORIGINS = (process.env.ALLOWED_EXTRA_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function hostOf(urlOrHost: string): string {
  try {
    return new URL(urlOrHost).host;
  } catch {
    return urlOrHost;
  }
}

/** اگر پاسخ برگرداند → باید فوراً همان پاسخ برگردانده شود؛ وگرنه null یعنی مجاز. */
export function assertSameOrigin(req: NextRequest): NextResponse | null {
  const host = req.headers.get('host') ?? hostOf(req.url);

  const origin = req.headers.get('origin');
  if (origin) {
    const originHost = hostOf(origin);
    const ok = originHost === host || EXTRA_ORIGINS.includes(origin);
    if (!ok) {
      return NextResponse.json(
        { error: 'منشأ درخواست با سامانه هم‌خوان نیست (CSRF blocked).' },
        { status: 403 },
      );
    }
    return null;
  }

  const referer = req.headers.get('referer');
  if (referer) {
    const refHost = hostOf(referer);
    if (refHost !== host && !EXTRA_ORIGINS.some((o) => hostOf(o) === refHost)) {
      return NextResponse.json(
        { error: 'منشأ درخواست با سامانه هم‌خوان نیست (CSRF blocked).' },
        { status: 403 },
      );
    }
  }

  return null;
}
