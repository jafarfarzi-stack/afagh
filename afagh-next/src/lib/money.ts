/**
 * ابزار پول و اعداد — محاسبه با اعداد صحیح.
 *
 * مشکل: `0.1 + 0.2 === 0.30000000000000004`. در فیش حق‌التدریس یا تراز مالی
 * دانشجو، این خطا در مقیاس هزاران ردیف جمع می‌شود و در گزارش مغایرت می‌دهد.
 * راهکار اینجا: همهٔ محاسبات روی «مقیاس‌شدهٔ صحیح» انجام می‌شود و فقط در لحظهٔ
 * نمایش/ذخیره گرد می‌شود.
 *
 *   • پول   → ریال صحیح (کوچک‌ترین واحد پولی سامانه)
 *   • واحد   → واحد × ۱۰۰ (عدد صحیح) تا ضرب در ضرایب اعشاری دقیق بماند
 *   • گردکردن پول → مضرب ۱۰ ریال (تومان)، چون پرداخت بانکی زیر تومان معنا ندارد
 */

/** مقیاس اعداد صحیح برای واحد درسی */
export const UNIT_SCALE = 100;
/** کوچک‌ترین واحد قابل پرداخت (۱۰ ریال = ۱ تومان) */
export const RIAL_STEP = 10;

export function mulberryRound(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/** مقدار اعشاری → واحد مقیاس‌شدهٔ صحیح (۲ رقم اعشار) */
export function unitsToInt(value: number | string | null | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  // `1.005 * 100` در ممیز شناور ۱۰۰.۴۹۹۹… می‌شود و به ۱۰۰ گرد می‌شود.
  // پس روی «رشتهٔ اعشاریِ دقیق» (toFixed(4)) و با حساب رقمی گرد می‌کنیم تا
  // ۱.۰۰۵ → ۱۰۱ شود (گردکردن نیمه‌به‌بالا، همان انتظار حسابدار).
  const [i, f = ''] = n.toFixed(4).split('.');
  const digits = (f + '0000').slice(0, 4);
  let out = Number(i) * UNIT_SCALE + Number(digits.slice(0, 2));
  if (Number(digits[2]) >= 5) out += 1;
  return out;
}

/** واحد مقیاس‌شدهٔ صحیح → عدد اعشاری (برای نمایش/ذخیره numeric(6,2)) */
export function intToUnits(value: number): number {
  return Math.round(value) / UNIT_SCALE;
}

/** گردکردن پول به مضرب ۱۰ ریال (تومان) */
export function toRial(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return mulberryRound(n / RIAL_STEP) * RIAL_STEP;
}

/** جمع واحد مقیاس‌شده × ضریب → واحد مقیاس‌شده (بدون خطای اعشاری) */
export function scaleUnits(unitsInt: number, multiplier: number): number {
  return Math.round(unitsInt * (Number.isFinite(Number(multiplier)) ? Number(multiplier) : 0));
}

/** درصد (۰..۱۰۰) از یک عدد صحیح — گرد به نزدیک‌ترین */
export function percentOf(amountInt: number, percent: number): number {
  const p = Number(percent);
  if (!Number.isFinite(p)) return 0;
  return mulberryRound((amountInt * p) / 100);
}

/** نسبت (صورت/مخرج) از یک عدد صحیح — برای کسر غیبت به تناسب جلسات */
export function ratioOf(amountInt: number, numerator: number, denominator: number): number {
  const d = Number(denominator);
  if (!Number.isFinite(d) || d <= 0) return 0;
  return mulberryRound((amountInt * Number(numerator)) / d);
}

/** جمع دقیق فهرستی از واحدهای مقیاس‌شده */
export function sumUnits(values: Iterable<number>): number {
  let s = 0;
  for (const v of values) s += Math.round(Number(v) || 0);
  return s;
}

// ════════════════════════════════════════════════════════════════════════
//  اعتبارسنجی سخت‌گیرانهٔ ریال (بازبینی: «ورودی کلاینت نباید مبلغ بد بدهد»)
//
//  مسیر مالی (تخفیف/پوشش/وام/چک) هر مبلغی از کلاینت می‌گیرد. اگر رشتهٔ
//  `"1e5"` یا عدد `123.456` یا `"۱۰۰۰"` فارسی یا NaN/Infinity از کلاینت
//  برسد و مستقیم در دستور SQL جا بگیرد، یا خطای ۵۰۰ می‌دهد یا (در بدترین
//  حالت) مبلغ اشتباه ثبت می‌کند. این تابع در «مرز ورودی» هر Action مالی
//  صدا زده می‌شود: فقط عدد صحیحِ نامنفیِ ریال می‌پذیرد، وگرنه null
//  برمی‌گرداند تا Action با پیام «مبلغ نامعتبر است» رد شود (fail-closed).
// ════════════════════════════════════════════════════════════════════════

/** ریالِ معتبر (عدد صحیح نامنفی) → خودِ عدد؛ هر چیز دیگر → null */
export function safeRials(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    return value;
  }
  if (typeof value === 'string') {
    const t = value.trim();
    if (!/^\d{1,15}$/.test(t)) return null;            // فقط ارقام، بدون ‍e/نقطه/علامت/فاصله
    const n = Number(t);
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

/** نمایش ریال با جداکنندهٔ هزارگان — فقط برای نمایش، نه محاسبه */
export function fmtRial(value: number): string {
  return new Intl.NumberFormat('fa-IR').format(Math.round(value)) + ' ریال';
}

/** ریال → رشتهٔ ریالیِ خام برای ذخیره در جزئیات/لاگ */
export function rialString(value: number): string {
  return String(Math.round(value));
}
