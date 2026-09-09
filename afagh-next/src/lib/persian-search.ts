/**
 * نرمال‌سازی جست‌وجوی فارسی/عربی — حروف دو املایی یکسان می‌شوند:
 *   ي (عربی) ↔ ی (فارسی) · ك (عربی) ↔ ک (فارسی) · ة ↔ ه · ؤ→و · ئ→ی · أ/إ/آ→ا
 * + حذف تطویل (ـ) و اعراب + نیم‌فاصله→فاصله.
 * هم سمت کاربر و هم سمت دیتابیس (REPLACE تودرتو) نرمال می‌شود تا «ي» با «ی» همدیگر را پیدا کنند.
 */

import { sql, type SQL } from 'drizzle-orm';

export function normalizeFa(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ی')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ـ/g, '')
    .replace(/[ً-ٰٖ]/g, '')
    .replace(/‌/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * ستون متنی را در SQL نرمال می‌کند تا ILIKE با عبارت نرمال‌شده بخورد.
 * توجه: روی ستون تابع می‌سازد (seq scan) — برای جست‌وجوی ادمین با ilike درصدی
 * که از قبل ایندکس نمی‌خورد، هزینهٔ اضافه ندارد.
 */
export function normCol(col: SQL | unknown): SQL<string> {
  const c = col as SQL;
  // ي→ی · ك→ک · ة→ه · ؤ→و · ئ→ی · أ/إ/آ→ا (باید با normalizeFa هم‌خوان باشد)
  return sql<string>`REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${c}, 'ي', 'ی'), 'ك', 'ک'), 'ة', 'ه'), 'ؤ', 'و'), 'ئ', 'ی'), 'أ', 'ا'), 'إ', 'ا'), 'آ', 'ا')`;
}

/** الگوی LIKE درصدی از روی عبارت خام کاربر (نرمال‌شده). */
export function faLikePattern(raw: string | null | undefined): string {
  return `%${normalizeFa(raw)}%`;
}

/**
 * تطبیق زیررشته‌ای نرمال‌شده برای فیلترهای کلاینتی/حافظه‌ای.
 * هر دو سمت نرمال می‌شوند تا «ي» با «ی» و «ك» با «ک» بخورد.
 */
export function faIncludes(haystack: string | null | undefined, needle: string | null | undefined): boolean {
  const n = normalizeFa(needle);
  if (!n) return true;
  return normalizeFa(haystack).includes(n);
}
