#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  student-status-map — نگاشت مشترک «کد وضعیت سما/UEMS» → وضعیت داخلی آفاق
 *
 *  Single Source برای اسکریپتهای .mjs (نمیتوانند مستقیماً .ts import کنند).
 *  قرارداد با `src/lib/student-labels.ts` → `SAMA_STATUS_TO_INTERNAL` است و
 *  `tests/student-sync-contract.test.ts` برابری دوتابه دوی آنها را گارد میکند.
 *
 *  تفاوت عمدی با `samaStatusToInternal()`:
 *    ▸ آن تابع کد ناشناخته را `'UNKNOWN'` برمیگرداند (برای نمایش UI مناسب است).
 *    ▸ این تابع `null` برمیگرداند تا مسیر «نوشتن در دیتابیس» fail-closed باشد:
 *      کد ناشناخته/تهی/لیترال NULL هرگز وضعیت دانشجو را به UNKNOWN تغییر نمیدهد؛
 *      ردیف رد شده و شمارش میگردد تا اپراتور نگاشت را بهروز کند.
 *
 *  استثنای دانشگاه (ZARINE: کد ۴۳ = عدم مراجعه) در لایهٔ UI اعمال میشود؛
 *  منبع هفتگی فعلی uni=1 (AFAGH) است، پس اینجا نگاشت پایه کافی است. اگر
 *  بعداً دانشگاه دیگری به خط لوله اضافه شد، `uniCode` را به mapSamaStatus بدهید.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** کد خام سما → وضعیت داخلی students.status (همان جدول student-labels.ts). */
export const SAMA_STATUS_MAP = Object.freeze({
  '1': 'ACTIVE', '5': 'ACTIVE', '10': 'ACTIVE', '23': 'ACTIVE', '26': 'ACTIVE',
  '2': 'GRADUATED', '9': 'GRADUATED', '25': 'GRADUATED',
  '41': 'GRADUATED', '42': 'GRADUATED', '43': 'GRADUATED',
  '44': 'GRADUATED', '45': 'GRADUATED', '46': 'GRADUATED',
  '16': 'EXPELLED', '34': 'EXPELLED',
  '17': 'WITHDRAWN', '18': 'WITHDRAWN', '35': 'WITHDRAWN', '12': 'WITHDRAWN',
  '22': 'SUSPENDED',
  '3': 'TRANSFERRED', '4': 'TRANSFERRED', '14': 'TRANSFERRED',
  '15': 'TRANSFERRED', '24': 'TRANSFERRED', '37': 'TRANSFERRED',
  '0': 'UNKNOWN', '11': 'UNKNOWN', '8': 'UNKNOWN',
  '21': 'NO_SHOW', '29': 'NO_SHOW', '7': 'NO_SHOW',
  '20': 'DECEASED', '6': 'DECEASED',
});

/** استثنای دانشگاهی (نگاشت UI). فعلاً فقط ZARINE. */
export const SAMA_STATUS_UNI_OVERRIDE = Object.freeze({
  ZARINE: Object.freeze({ '39': 'GRADUATED', '40': 'GRADUATED', '41': 'GRADUATED', '42': 'GRADUATED', '43': 'NO_SHOW' }),
});

export const STUDENT_STATUS_VALUES = Object.freeze([
  'ACTIVE', 'GRADUATED', 'EXPELLED', 'WITHDRAWN', 'SUSPENDED',
  'TRANSFERRED', 'UNKNOWN', 'NO_SHOW', 'DECEASED',
]);

/**
 * نگاشت امن: کد ناشناخته/تهی/لیترال «NULL» ⇒ null (ردیف باید رد شود، نه UNKNOWN).
 * @param {unknown} raw کد خام ستون STATUS در MAININFO
 * @param {string} [uniCode] کد دانشگاه برای استثناها (پیشفرض AFAGH)
 * @returns {string|null}
 */
export function mapSamaStatus(raw, uniCode = '') {
  const c = String(raw ?? '').trim();
  if (!c || /^null$/i.test(c)) return null;
  const uni = String(uniCode ?? '').trim().toUpperCase();
  if (uni && SAMA_STATUS_UNI_OVERRIDE[uni]?.[c]) return SAMA_STATUS_UNI_OVERRIDE[uni][c];
  return SAMA_STATUS_MAP[c] ?? null;
}

/**
 * شمارهٔ دانشجویی معتبر: فقط ارقام، ۷ تا ۱۴ رقم (ستون students.studentCode
 * varchar(14) است). کدهای ۱/۳ رقمی UEMS شمارهٔ پرسنلی/اداریاند و کد ۱۵ رقمی
 * از سقف ستون فراتر میرود؛ هیچکدام نباید وارد همگامسازی شوند.
 */
export const STUDENT_CODE_RE = /^\d{7,14}$/;

/** @param {unknown} code */
export function isValidStudentCode(code) {
  return STUDENT_CODE_RE.test(String(code ?? '').trim());
}
