/** تبدیل مقدار numeric/رشته/تهی به عدد — سخت‌گیرانه ولی سازگار.
 *
 *  چرا سخت‌گیرانه: نسخهٔ قبلی با parseFloat کار می‌کرد و «1e5» را ۱۰۰٬۰۰۰ و
 *  «123abc» را ۱۲۳ می‌خواند؛ چنین رشته‌هایی از مرز کلاینت نباید هرگز مبلغ
 *  شوند (نمونه: recordPayment). پس رشته فقط در قالب اعشاریِ سادهٔ
 *  ‎`[+-]?(digits[.digits] | .digits)`‎ پذیرفته می‌شود؛ نما (e/E)، هگز،
 *  درصد، حروف و ارقام فارسی → ۰.
 *
 *  چرا همچنان «lenient» در برابر تهی/NaN: ورودی‌های دیتابیس/legacy (NULL،
 *  ‎''‎، NaN) در صدها جمع مالی صفر فرض می‌شوند؛ تغییرش به throw همهٔ
 *  کارنامه‌ها را می‌شکست. اعتبارسنجی مرز ورودی (fail-closed با پیام
 *  «مبلغ نامعتبر») وظیفهٔ safeRials در src/lib/money.ts است، نه این تابع.
 *  رفتار برای ورودی‌های معتبر (عدد، رشتهٔ اعشاری ساده، تهی → ۰) بی‌تغییر است. */
export function toNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const s = String(value).trim();
  if (!s) return 0;
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s)) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** گرد کردن به ریال (بدون کسری) — همهٔ مبالغ سیستم ریالی‌اند.
 *  توجه: این تابع اعتبارسنجی مرز نیست؛ ثبت پرداخت (recordPayment) صریحاً با
 *  ‎`safeRials(Math.round(toNum(amount)))`‎ گرد + اعتبارسنجی می‌کند تا هیچ
 *  کسری/نمای علمی بی‌صدا ثبت نشود. */
export function toRial(value: number): number {
  return Math.round(value || 0);
}

/** تبدیل تاریخ (رشته/Date/تهی) به میلی‌ثانیهٔ epoch؛ تهی → null */
export function toMs(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}
