import 'server-only';

import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * ══════════════════════════════════════════════════════════════════════
 *  کد تأیید یک‌بارمصرف (OTP) — صدور، هش‌کردن و مقایسه
 *
 *  چرا این ماژول وجود دارد: کدهای تأییدِ قفل نمره و امضای قرارداد با
 *  `sha256(code)` ساده و ۵ رقمی ساخته می‌شدند (فضای کد ۹۰٬۰۰۰). با
 *  کمتر از یک میلی‌ثانیه و یک جدول رنگین‌آماده، هر هشِ خوانده‌شده از
 *  دیتابیس یا بکاپ به کد اصلی تبدیل می‌شد ⇒ جعل قفل نمره و امضای قرارداد.
 *
 *  قاعدهٔ اینجا (همان الگوی امضای اسناد، ولی سراسری):
 *   ۱) کد **۶ رقمی** (فضای ۱٬۰۰۰٬۰۰۰)
 *   ۲) ذخیره به‌صورت **HMAC-SHA256** با فلفل سرور و **بافتِ یکتا** (context)
 *      تا کدِ یک سند در سند دیگر معتبر نباشد
 *   ۳) مقایسه با **زمان-ثابت** (timingSafeEqual) — بدون oracle زمانی
 *   ۴) در production بدون `AFAGH_OTP_PEPPER` **fail-closed**
 * ══════════════════════════════════════════════════════════════════════
 */

/** فلفل HMAC از ENV — در production بدون آن اصلاً کد صادر نمی‌شود. */
export function otpPepper(): string {
  const p = (process.env.AFAGH_OTP_PEPPER || '').trim();
  if (p) return p;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[otp] AFAGH_OTP_PEPPER در production ست نشده است — صدور OTP متوقف شد (fail-closed).');
  }
  console.error('⚠ [otp] AFAGH_OTP_PEPPER ست نشده است — از مقدار توسعه استفاده می‌شود (فقط محیط محلی).');
  return 'afagh-dev-otp-pepper';
}

/**
 * کد شش‌رقمی.
 * ⚠️ `randomInt` از CSPRNG است (Math.random نیست) — حدس تصادفی ممکن نیست.
 */
export function newOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * هش قابل‌ذخیره برای کد OTP.
 * @param code    کد اصلی (فقط لحظهٔ ارسال در اختیار است)
 * @param context بافت یکتا (مثلاً `doc:123` یا `grade:456`) تا کدِ یک
 *               سند با سند دیگر قابل‌جایگزینی نباشد.
 */
export function otpDigest(code: string, context: string): string {
  return createHmac('sha256', otpPepper())
    .update(`${code.trim()}:${context}`)
    .digest('hex');
}

/** مقایسهٔ زمان-ثابت دو هش hex — جلوگیری از oracle زمانی. */
export function otpEqual(a: string, b: string): boolean {
  const ab = Buffer.from(String(a ?? ''), 'utf8');
  const bb = Buffer.from(String(b ?? ''), 'utf8');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * سازگاری با رکوردهای قدیمی: پیش از این ماژول، کد با `sha256(code)` و بافتِ
 * خالی ذخیره می‌شد. برای اینکه کدهای در‌جریان (Issued و هنوز مصرف‌نشده) با
 * ارتقای سامانه از کار نیفتند، این مسیر پذیرفته می‌شود — ولی فقط برای
 * رکوردهایی که **همین حالا** معتبرند و پس از آن به‌تدریج منقضی می‌شوند.
 */
export function legacyOtpDigest(code: string): string {
  return createHash('sha256').update(code.trim()).digest('hex');
}
