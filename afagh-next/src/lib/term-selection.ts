/**
 * ══════════════════════════════════════════════════════════════════════
 *  تجزیهٔ «انتخابِ ترم با تایپ» — منطقِ خالص (کلاینت + سرور)
 * ══════════════════════════════════════════════════════════════════════
 *  کاربر به‌جای کلیک روی ده‌ها چک‌باکس می‌تواند ترم‌ها را تایپ کند:
 *    «14031,14033»         → دو ترم
 *    «14031-14035»         → بازهٔ عددی (شامل دو سر)
 *    «۱۴۰۳۱ تا ۱۴۰۳۵»      → همان بازه با ارقام فارسی و «تا»
 *    «14031، 14032؛ 14035» → ویرگول فارسی/عربی و نقطه‌ویرگول هم جداکننده‌اند
 *
 *  چرا فایلِ جدا؟ همان قاعده‌ای که برای «ادغام کاربران» و «ترم‌بندی» رعایت
 *  شده: قاعدهٔ تجزیه باید بدون React و بدون DB قابلِ تست باشد. خطای رایجِ
 *  این‌جا (بازهٔ معکوس، ارقام فارسی، کدِ کوتاهِ اشتباهی) در UI دیده نمی‌شود
 *  ولی در نتیجهٔ گزارش اثر می‌گذارد.
 * ══════════════════════════════════════════════════════════════════════
 */
import { toEnDigits } from './persian-search';

export type TermSelectionResult = {
  /** کدهای معتبر و یکتا (صعودی) — آمادهٔ ارسال به سرور */
  codes: string[];
  /** توکن‌هایی که کد ترم نیستند (مثل «abc» یا «12») */
  invalid: string[];
  /** کدهای خوش‌شکل که در فهرست ترم‌های همین دانشگاه نیستند */
  unknown: string[];
  /** آیا بازه‌ای باز شده است؟ */
  usedRange: boolean;
  /** آیا سقفِ تعداد کدها اعمال شد؟ */
  truncated: boolean;
};

/** سقفِ تعداد ترم‌های انتخابی — جلوگیری از بازه‌های عجیب (مثل 10000-99999) */
export const MAX_TERM_CODES = 60;

/** کد ترم: ۵ تا ۶ رقم (مثل 14051 یا 13941) — «1403» سال است نه ترم */
const TERM_CODE = /^\d{5,6}$/;

/**
 * تجزیهٔ ورودیِ آزاد کاربر.
 *
 * @param raw   متنِ تایپ‌شده (هر ترکیبی از ارقام فارسی/عربی و جداکننده‌ها)
 * @param known فهرستِ کدهای موجودِ همین دانشگاه؛ اگر بدهید، کدهای ناشناخته
 *              در `unknown` برمی‌گردند و در `codes` نمی‌آیند.
 */
export function parseTermSelection(
  raw: string | null | undefined,
  known?: readonly string[],
): TermSelectionResult {
  const knownSet = known && known.length ? new Set(known.map(String)) : null;
  const text = toEnDigits(String(raw ?? ''))
    .replace(/[؛;]/g, ',')
    .replace(/[،]/g, ',');

  const collected: string[] = [];
  const invalid: string[] = [];
  let usedRange = false;

  // ── گام ۱: بازه‌ها (پیش از تک‌کدها تا «14031 تا 14035» یک واحد بماند) ──
  const rest = text.replace(
    /(\d{5,6})\s*(?:-|–|—|تا|to)\s*(\d{5,6})/gi,
    (_m, a: string, b: string) => {
      usedRange = true;
      const lo = Math.min(Number(a), Number(b));
      const hi = Math.max(Number(a), Number(b));
      if (hi - lo > 400) {
        invalid.push(`${a}-${b}`);
        return ' ';
      }
      for (let n = lo; n <= hi; n += 1) collected.push(String(n));
      return ' ';
    },
  );

  // ── گام ۲: کدهای تک ──
  for (const token of rest.split(/[,\s]+/)) {
    if (!token) continue;
    if (TERM_CODE.test(token)) collected.push(token);
    else if (/\d/.test(token)) invalid.push(token);
    // واژه‌های بی‌عدد (مثل «ترم») نادیده گرفته می‌شوند
  }

  // ── گام ۳: یکتا + صعودی + فیلترِ موجودها ──
  const unique = [...new Set(collected)].sort((a, b) => Number(a) - Number(b));
  const unknown = knownSet ? unique.filter((c) => !knownSet.has(c)) : [];
  const codes = (knownSet ? unique.filter((c) => knownSet.has(c)) : unique).slice(0, MAX_TERM_CODES);

  return {
    codes,
    invalid: [...new Set(invalid)],
    unknown,
    usedRange,
    truncated: unique.length > codes.length,
  };
}
