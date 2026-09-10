// ═══════════════════════════════════════════════════════════════════════
//  محاسبه خودکار وضعیت نمره بر اساس مقدار نمره و حد نصاب قبولی
// ═══════════════════════════════════════════════════════════════════════

/**
 * محاسبه خودکار وضعیت نمره (gradeStatus)
 *
 * @param value        - نمره عددی (null اگر ثبت نشده)
 * @param passingGrade - حد نصاب قبولی (پیش‌فرض ۱۰)
 * @returns            - وضعیت نمره: FINALIZED | PENDING
 */
export function computeGradeStatus(
  value: number | null | undefined,
  passingGrade: number = 10,
): string {
  if (value == null || isNaN(value)) return 'PENDING';
  return 'FINALIZED';
}

/**
 * آیا نمره قبول محسوب می‌شود؟
 */
export function isPassedGrade(
  value: number | null | undefined,
  passingGrade: number,
  gradingType?: string | null,
): boolean {
  if (value == null) return false;
  if (gradingType === 'DESCRIPTIVE') return value === 1;
  return value >= passingGrade;
}
