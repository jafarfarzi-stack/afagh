/** مقاطع — عین seed فاز صفر + کاردانی و دکتری حرفه‌ای
 *  این آرایه برای استفاده در سمت کلاینت (Client-side) امن است
 * و وابستگی به دیتابیس/pg/drizzle-orm ندارد
 */
export const DEGREE_LEVEL_CONFIGS = [
  { id: 1, title: 'کارشناسی پیوسته', code: 'BS', defaultPassingGrade: '10.00', conditionalGpaThreshold: '12.00', maxUnitsPerTerm: 20 },
  { id: 2, title: 'کارشناسی ارشد', code: 'MS', defaultPassingGrade: '12.00', conditionalGpaThreshold: '14.00', maxUnitsPerTerm: 12 },
  { id: 3, title: 'کاردانی پیوسته', code: 'AD', defaultPassingGrade: '10.00', conditionalGpaThreshold: '12.00', maxUnitsPerTerm: 18 },
  { id: 4, title: 'دکتری حرفه‌ای', code: 'PHD', defaultPassingGrade: '14.00', conditionalGpaThreshold: '16.00', maxUnitsPerTerm: 12 },
];

/** @deprecated Use DEGREE_LEVEL_CONFIGS instead */
export const BASE_DEGREES = DEGREE_LEVEL_CONFIGS;