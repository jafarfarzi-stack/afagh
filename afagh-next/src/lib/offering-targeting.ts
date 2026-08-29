// ═══ هدف‌گیری ارائه‌ها: چه دانشجویی چه درسی را می‌بیند ═══
// قواعد: مقطع (کارشناسی/ارشد…)، رشته، بازهٔ سال ورودی — NULL یعنی «بدون محدودیت».
export type Targeting = {
  targetDegreeLevelId: number | null;
  targetMajorId: number | null;
  entryYearStart: number | null;
  entryYearEnd: number | null;
};

export type StudentScope = {
  degreeLevelId: number;
  majorId: number | null;
  entryYear: number;
};

/** آیا این ارائه برای این دانشجو قابل مشاهده/انتخاب است؟ */
export function offeringVisible(o: Targeting, s: StudentScope): boolean {
  if (o.targetDegreeLevelId != null && o.targetDegreeLevelId !== s.degreeLevelId) return false; // ارشد ≠ کارشناسی
  if (o.targetMajorId != null && o.targetMajorId !== s.majorId) return false;                    // رشتهٔ دیگر
  if (o.entryYearStart != null && s.entryYear < o.entryYearStart) return false;                  // ورودی قدیمی‌تر
  if (o.entryYearEnd != null && s.entryYear > o.entryYearEnd) return false;                      // ورودی جدیدتر
  return true;
}

export function targetingLabel(o: Targeting, degreeTitle: (id: number) => string, majorTitle: (id: number) => string): string {
  const parts: string[] = [];
  if (o.targetDegreeLevelId != null) parts.push(degreeTitle(o.targetDegreeLevelId));
  if (o.targetMajorId != null) parts.push('رشتهٔ ' + majorTitle(o.targetMajorId));
  if (o.entryYearStart != null || o.entryYearEnd != null)
    parts.push(`ورودی ${o.entryYearStart ?? '•'} تا ${o.entryYearEnd ?? '•'}`);
  return parts.length ? parts.join(' · ') : 'همه';
}
