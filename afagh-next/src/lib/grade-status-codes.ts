// ═══════════════════════════════════════════════════════════════════════
//  فهرست مرجع کدهای «وضع نمره» سما (میز تطبیق GRADE_STATUS)
//  منبع: فایل رسمی صادرشده توسط سامانهٔ سما (کدگذاری اصلی Windows-1256).
//  این جدول ثابت و سراسری است (مستقل از دانشگاه)، برای همین این‌جا به‌عنوان
//  مرجع کد نگه داشته می‌شود؛ در کنارش legacy_code_maps (اگر از فایل migration
//  ایمپورت شده باشد) هم می‌تواند استفاده شود، ولی نبودنش نباید UI را بشکند.
// ═══════════════════════════════════════════════════════════════════════

export type GradeStatusCode = {
  code: string;
  title: string;
  /** آیا این کد به‌عنوان «قبول» تلقی می‌شود (پاس شده) */
  passed: boolean;
  /** آیا در معدل تاثیر دارد */
  affectsGpa: boolean;
};

export const GRADE_STATUS_CODES: GradeStatusCode[] = [
  { code: '1', title: 'درس عادي - قبول', passed: true, affectsGpa: true },
  { code: '2', title: 'درس عادي - مردود', passed: false, affectsGpa: true },
  { code: '3', title: 'در معادل سازي پذيرفته شده با احتساب در معدل کل', passed: true, affectsGpa: true },
  { code: '4', title: 'در معادل سازي پذيرفته نشده', passed: false, affectsGpa: false },
  { code: '10', title: 'نمره گزارش نشده', passed: false, affectsGpa: false },
  { code: '11', title: 'جبراني - با احتساب در معدل', passed: true, affectsGpa: true },
  { code: '12', title: 'جبراني بدون احتساب در معدل - قبول', passed: true, affectsGpa: false },
  { code: '13', title: 'ناتمام', passed: false, affectsGpa: false },
  { code: '14', title: 'حذف پزشکي', passed: false, affectsGpa: false },
  { code: '16', title: 'در معادل سازي پذيرفته شده بدون احتساب معدل', passed: true, affectsGpa: false },
  { code: '17', title: 'درمعادل‌سازي‌پذيرفته‌شده‌جزواحدبدون‌احتسابمعدل', passed: true, affectsGpa: false },
  { code: '20', title: 'بدون تاثير در معدل ترم و معدل کل', passed: false, affectsGpa: false },
  { code: '22', title: 'جبراني بدون احتساب در معدل - مردود', passed: false, affectsGpa: false },
  { code: '23', title: 'پيش نياز - قبول موثر در نيمسال', passed: true, affectsGpa: false },
  { code: '24', title: 'پيش نياز - مردود موثر در نيمسال', passed: false, affectsGpa: false },
  { code: '27', title: 'رساله دکتري', passed: true, affectsGpa: true },
  { code: '28', title: 'بدون احتساب در معدل', passed: false, affectsGpa: false },
  { code: '29', title: 'دروس کمبود بدون احتساب در معدل', passed: false, affectsGpa: false },
  { code: '32', title: 'جبراني - معادل‌سازي', passed: false, affectsGpa: false },
  { code: '40', title: 'معرفي به استاد', passed: true, affectsGpa: true },
  { code: '50', title: 'خودخوان - قبول', passed: true, affectsGpa: true },
  { code: '51', title: 'خودخوان - مردود', passed: false, affectsGpa: true },
  { code: '54', title: 'فوت', passed: true, affectsGpa: true },
];

/** برچسب نمایشی «کد — عنوان» برای dropdown */
export function gradeStatusOptionLabel(g: GradeStatusCode): string {
  return `${g.code} — ${g.title}`;
}

/** جست‌وجوی عنوان از روی کد (برای نمایش/tooltip) */
export function gradeStatusTitleOf(code: string | null | undefined): string | null {
  if (!code) return null;
  return GRADE_STATUS_CODES.find(g => g.code === code)?.title ?? null;
}
