/**
 * منطق خالصِ «ثبت حضور استاد با اسکن QR سردر کلاسی» — بدون دیتابیس، بدون React.
 *
 * چرا جدا: پنجرهٔ زمانیِ مجاز و پارس‌کردن کدِ اتاق، تنها قواعدِ کسب‌وکاری‌اند که
 * هم صفحه (برای نمایش وضعیت) و هم سرور اکشن (برای تصمیم نهایی) به آن نیاز دارند.
 * اگر این دو از هم جدا نوشته شوند، دیر یا زود ناهماهنگ می‌شوند و نتیجه‌اش این است
 * که دکمه در UI فعال است ولی سرور رد می‌کند. پس هر دو از همین‌جا می‌خوانند.
 *
 * ⚠ قاعدهٔ امنیتی: تصمیمِ «مجاز است یا نه» فقط در سرور اکشن گرفته می‌شود؛ خروجی
 * این ماژول در صفحه تنها برای نمایش است و هرگز جای اعتبارسنجی سمت سرور را نمی‌گیرد.
 */

import { toGregorian, toJalali } from '@/lib/calendar';

/** چند دقیقه قبل از شروعِ کلاس، پنجرهٔ ثبت حضور باز می‌شود. */
export const CHECKIN_OPEN_MIN_BEFORE = 30;

/** چند دقیقه بعد از پایانِ کلاس، پنجره بسته می‌شود (فرصتِ اسکنِ دیرهنگام). */
export const CHECKIN_OPEN_MIN_AFTER = 20;

export type CheckinState = 'BEFORE' | 'OPEN' | 'CLOSED';

/**
 * کدِ داخل QR به شکل `room-<id>` است (مثلاً `room-203`).
 * هر چیز دیگری — از جمله `room-0` که QRِ جای‌نگهدار تولید می‌کند — نامعتبر است.
 */
export function parseRoomCode(code: string | null | undefined): number | null {
  const m = /^room-(\d{1,9})$/.exec(String(code ?? '').trim());
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** 'HH:MM' → دقیقه از نیمه‌شب؛ ورودی نامعتبر → null */
export function hmToMinutes(value: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

/** دقیقه از نیمه‌شب → 'HH:MM' */
export function minutesToHm(total: number): string {
  const t = ((Math.trunc(total) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export interface TehranNow {
  /** تاریخ شمسی امروز به شکل 'YYYY/MM/DD' — دقیقاً همان قالبی که در class_sessions.sessionDate ذخیره می‌شود */
  jalali: string;
  /** دقیقه از نیمه‌شب به وقت تهران */
  minutes: number;
}

/**
 * «اکنون» به وقت تهران.
 *
 * چرا از `new Date()` مستقیم استفاده نمی‌کنیم: کانتینر معمولاً UTC است و ایران
 * +۳:۳۰ دارد؛ پس بین ۲۰:۳۰ و ۲۴:۰۰ UTC، تاریخِ تهران یک روز جلوتر است و
 * جلسهٔ امشب با «امروزِ» UTC پیدا نمی‌شد.
 */
export function tehranNow(now: Date = new Date()): TehranNow {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const pick = (type: string): number => {
    const v = parts.find(p => p.type === type)?.value;
    return v == null ? 0 : Number(v);
  };

  const gy = pick('year');
  const gm = pick('month');
  const gd = pick('day');
  const minutes = pick('hour') * 60 + pick('minute');

  // تبدیل میلادی → شمسی با همان موتورِ تقویمِ خودِ پروژه (src/lib/calendar.ts)
  const j = toJalali(gy, gm, gd);
  const pad2 = (n: number) => String(n).padStart(2, '0');

  return { jalali: `${j.jy}/${pad2(j.jm)}/${pad2(j.jd)}`, minutes };
}

/**
 * وضعیت پنجرهٔ ثبت حضور برای یک جلسه.
 * جلسه‌ای که ساعتش نامعتبر است «بسته» تلقی می‌شود (fail-closed).
 */
export function checkinState(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  nowMinutes: number,
): CheckinState {
  const start = hmToMinutes(startTime);
  const end = hmToMinutes(endTime);
  if (start == null || end == null) return 'CLOSED';

  const openAt = start - CHECKIN_OPEN_MIN_BEFORE;
  const closeAt = end + CHECKIN_OPEN_MIN_AFTER;

  if (nowMinutes < openAt) return 'BEFORE';
  if (nowMinutes > closeAt) return 'CLOSED';
  return 'OPEN';
}

/** بازهٔ مجاز به شکل خوانا برای نمایش در UI: «۰۹:۳۰ تا ۱۲:۲۰» */
export function checkinWindowLabel(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): { from: string; to: string } | null {
  const start = hmToMinutes(startTime);
  const end = hmToMinutes(endTime);
  if (start == null || end == null) return null;
  return {
    from: minutesToHm(start - CHECKIN_OPEN_MIN_BEFORE),
    to: minutesToHm(end + CHECKIN_OPEN_MIN_AFTER),
  };
}

/** مقایسهٔ تاریخ‌های شمسیِ 'YYYY/MM/DD' — بدون تبدیل به Date (رشته‌ای امن است چون صفرپر است) */
export function compareJalali(a: string, b: string): number {
  return String(a).localeCompare(String(b));
}

/**
 * روزِ هفتهٔ ایرانی از تاریخِ شمسی — با همان شماره‌گذاریِ `schedules.dayOfWeek`
 * (شنبه=۰ … جمعه=۶).
 *
 * چرا لازم است: اتاقِ هر جلسه از اسلاتِ هفتگی حل می‌شود، و اسلات با
 * (ارائه، روزِ هفته، ساعت) کلید می‌خورد. تاریخِ جلسه شمسی است ولی روزِ هفته
 * را باید از تقویمِ میلادی گرفت، چون فقط آن‌جا روزِ هفته هست.
 */
export function iranDowFromJalali(jalali: string | null | undefined): number | null {
  const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(String(jalali ?? '').trim());
  if (!m) return null;
  const jy = Number(m[1]);
  const jm = Number(m[2]);
  const jd = Number(m[3]);
  if (jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;

  const g = toGregorian(jy, jm, jd);
  // getUTCDay: یکشنبه=۰ … شنبه=۶ → شیفت تا شنبه=۰
  const jsDay = new Date(Date.UTC(g.gy, g.gm - 1, g.gd)).getUTCDay();
  return (jsDay + 1) % 7;
}

