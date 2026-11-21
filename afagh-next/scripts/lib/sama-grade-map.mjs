#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  sama-grade-map — نگاشت «کد وضعیت نمرهٔ سما (MarkStat)» → وضعیت نمرهٔ آفاق
 *
 *  Single source برای مهاجرت نمرات. در ابتدا `import-sama-afagh.mjs` این
 *  نگاشت را درست داشت ولی `migrate-legacy-education.mjs` به جای آن
 *  `gradeStatus='FINALIZED'` را **بدون شرط** مینوشت ⇒ ردیفهای ثبتنامِ
 *  بدون نمره (Mark=NULL, MarkStat=10) در پنل «نهایی» نشان میدادند در حالی
 *  که نمرهای ثبت نشده بود. قرارداد:
 *
 *    ▸ نمرهٔ عددی معتبر ⇒ FINALIZED
 *    ▸ بدون نمره ولی تصمیم قطعی سما (معاف / قبول بدون نمره / مردود بدون
 *      نمره / حذف و انصراف) ⇒ FINALIZED
 *    ▸ بدون نمره و بدون تصمیم قطعی (MarkStat=10 = ثبتنام) ⇒ PENDING
 *
 *  همین قواعد در `src/lib/grade-utils.ts` و `GRADE_STATUS_FA`也存在 میشوند.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** معاف — قطعی است حتی بدون نمرهٔ عددی. */
export const EXEMPT_MS = Object.freeze(['3', '16', '17', '32']);
/** قبول بدون نمره — قطعی. */
export const PASSNG_MS = Object.freeze(['12', '18', '23', '27', '40', '50', '53', '54']);
/** مردود بدون نمره — قطعی. */
export const FAILNG_MS = Object.freeze(['2', '22', '51', '24']);
/** موقت. */
export const TEMP_MS = Object.freeze(['10', '13', '19']);
/** حذف/انصراف/حذف آییننامه — قطعی. */
export const DROP_MS = Object.freeze([
  '4', '5', '6', '7', '8', '9', '14', '15', '20', '28', '29', '200', '201', '300',
  '931', '941', '951', '-91', '-1', '-3', '-4', '-5', '-6', '55', '52',
]);

export const FINAL_WITHOUT_GRADE_MS = Object.freeze([
  ...EXEMPT_MS, ...PASSNG_MS, ...FAILNG_MS, ...DROP_MS,
]);

/** مقدار نمرهٔ معتبر وجود دارد؟ */
export function computeGradeStatus(value) {
  if (value == null || isNaN(Number(value))) return 'PENDING';
  return 'FINALIZED';
}

/**
 * وضعیت نمره با درنظرگرفتن MarkStat سما.
 * @param {unknown} markStat کد خام MarkStat (مثلاً '10' یا '7')
 * @param {number|null} gradeValue نمرهٔ عددی استخراجشده
 */
export function mapGradeStatus(markStat, gradeValue) {
  const ms = String(markStat ?? '').trim();
  if (gradeValue != null && !isNaN(Number(gradeValue))) return 'FINALIZED';
  if (FINAL_WITHOUT_GRADE_MS.includes(ms)) return 'FINALIZED';
  return 'PENDING';
}

/** آیا MarkStat نشاندهندهٔ «ثبتنام و نمرهٔ واردنشده» است؟ */
export function isUngradedRegistration(markStat, gradeValue) {
  return gradeValue == null && String(markStat ?? '').trim() === '10';
}
