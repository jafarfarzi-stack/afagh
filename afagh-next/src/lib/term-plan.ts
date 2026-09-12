/**
 * تعداد ترم چارت بر اساس مقطع + ترم تابستان — تنها منبع حقیقت (کلاینت + سرور).
 *
 * قاعدهٔ مصوب کاربر:
 *   کاردانی / کارشناسی ناپیوسته / کارشناسی ارشد (و دکترا) → چارت ۴ ترمه
 *   کارشناسی پیوسته (و هر مقطع ناشناخته) → چارت ۸ ترمه
 * ترم تابستان همیشه هست و شمارهٔ ثابت ۹ دارد (NULL = بدون ترم).
 *
 * اولویت: مقدار صریح degree_level_configs.termCount (قابل ویرایش در مرکز کدها)
 * وگرنه استنتاج از کد/عنوان مقطع. هیچ‌وقت خطا نمی‌دهد.
 */

export const SUMMER_SEMESTER = 9;
export const MAX_STANDARD_SEMESTER = 8;

export function normalizeDegreeText(t: string | null | undefined): string {
  return (t ?? '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/[‌‍\s]+/g, '')
    .toUpperCase();
}

/** تعداد ترم چارت. مقدار معتبر دیتابیس عیناً برمی‌گردد؛ وگرنه استنتاج (۴ یا ۸). */
export function termCountForDegree(input: {
  termCount?: number | null;
  code?: string | null;
  title?: string | null;
}): number {
  const n = input.termCount;
  if (typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 12) {
    return n;
  }
  const code = normalizeDegreeText(input.code);
  if (code === 'AD' || code === 'MS' || code === 'PHD') return 4;
  if (code === 'BS') return 8;
  const t = normalizeDegreeText(input.title);
  if (/کاردانی|ناپیوسته|ارشد|دکتر|دکتری|فوق|PHD|^MS$|^AD$/.test(t)) return 4;
  return 8;
}

export function isSummerSemester(sem: number | null | undefined): boolean {
  return sem === SUMMER_SEMESTER;
}

/** فهرست ترم‌های عادی چارت: [1..N] */
export function planSemesters(count: number): number[] {
  const n = Math.max(1, Math.min(12, Math.floor(count) || 8));
  return Array.from({ length: n }, (_, i) => i + 1);
}
