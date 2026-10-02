import { resolveTuitionRule, type TuitionRuleLike } from '../tuition-resolver';
import { toNum, toRial } from './numbers';

// ══════════════════════════════════════════════════════════════════════
//  فرمول تخصیص
// ══════════════════════════════════════════════════════════════════════

export interface FormulaLike {
  id: number;
  code?: string | null;
  title?: string | null;
  degreeLevelId: number | null;
  majorId: number | null;
  entryYearFrom: number | null;
  entryYearTo: number | null;
  fixedAmount: number | string | null;
  perUnitTheory: number | string | null;
  perUnitPractical: number | string | null;
  perUnitGeneral: number | string | null;
  priority: number | string | null;
  isActive: number | null;
}

export interface FormulaContext {
  degreeLevelId: number | null;
  majorId: number | null;
  entryYear: number | null;
}

/** آیا این فرمول با بافت دانشجو سازگار است؟ (فیلد تهی = بدون محدودیت) */
export function formulaMatches(f: FormulaLike, ctx: FormulaContext): boolean {
  if (!f.isActive) return false;
  if (f.degreeLevelId !== null && f.degreeLevelId !== ctx.degreeLevelId) return false;
  if (f.majorId !== null && f.majorId !== ctx.majorId) return false;

  const year = ctx.entryYear;
  if (f.entryYearFrom !== null && f.entryYearFrom !== undefined) {
    if (year === null || year === undefined || year < f.entryYearFrom) return false;
  }
  if (f.entryYearTo !== null && f.entryYearTo !== undefined) {
    if (year === null || year === undefined || year > f.entryYearTo) return false;
  }
  return true;
}

/**
 * انتخاب فرمول تخصیص.
 *
 * از نسخهٔ یکپارچه، با همان resolver شهریه انتخاب می‌شود (سلسله‌مراتب:
 * مقطع > رشته > بازهٔ ورودی). در این مرتب‌سازی ساختاری، `priority` دیگر
 * معیار اصلی نیست — فقط گره‌شکنِ مساوی‌هاست؛ «مقطع» همیشه بر «رشته» مقدم
 * است حتی اگر رشته، priority کوچک‌تری داشته باشد. گره‌شکن نهایی id کوچک‌تر
 * است تا نتیجه مستقل از ترتیب بازگشت دیتابیس باشد.
 */
export function pickFormula<T extends FormulaLike>(
  formulas: T[],
  ctx: FormulaContext
): T | null {
  const canonical: TuitionRuleLike[] = (formulas || []).map((f) => ({
    id: f.id,
    degreeLevelId: f.degreeLevelId,
    majorId: f.majorId,
    termType: null,
    offeringType: null,
    entryYearFrom: f.entryYearFrom,
    entryYearTo: f.entryYearTo,
    fixedAmount: f.fixedAmount,
    perUnitTheory: f.perUnitTheory,
    perUnitPractical: f.perUnitPractical,
    perUnitGeneral: f.perUnitGeneral,
    priority: toNum(f.priority ?? 100),
    isActive: f.isActive,
  }));

  const best = resolveTuitionRule(canonical, {
    degreeLevelId: ctx.degreeLevelId,
    majorId: ctx.majorId,
    entryYear: ctx.entryYear,
  });
  if (!best) return null;
  return (formulas || []).find((f) => f.id === best.id) ?? null;
}

/** سطل‌های واحد یک درس */
export interface UnitBuckets {
  theory: number;
  practical: number;
  general: number;
}

/**
 * تفکیک واحدهای یک درس به سطل نظری/عملی/عمومی.
 *
 * درس عمومی از روی courseType تشخیص داده می‌شود و کل واحدهایش در سطل عمومی
 * می‌نشیند؛ در غیر این صورت واحدها بر اساس ستون‌های نظری/عملی درس تقسیم
 * می‌شوند و باقی در سطل نظری.
 */
export function bucketCourseUnits(course: {
  units: number | string | null;
  theoreticalUnits?: number | string | null;
  practicalUnits?: number | string | null;
  courseType?: string | null;
}): UnitBuckets {
  const units = toNum(course.units);
  const type = String(course.courseType || '').toUpperCase();
  const isGeneral = type === 'GENERAL' || type === 'عمومی' || type === 'OMOMI';

  if (isGeneral) return { theory: 0, practical: 0, general: units };

  const practical = Math.min(units, Math.max(0, toNum(course.practicalUnits)));
  const theory = Math.min(units - practical, Math.max(0, toNum(course.theoreticalUnits)));
  const leftover = Math.max(0, units - practical - theory);
  return { theory: theory + leftover, practical, general: 0 };
}

/** جمع سطل‌های واحد چند درس */
export function totalBuckets(courses: UnitBuckets[]): UnitBuckets {
  return (courses || []).reduce(
    (acc, c) => ({
      theory: acc.theory + toNum(c.theory),
      practical: acc.practical + toNum(c.practical),
      general: acc.general + toNum(c.general)
    }),
    { theory: 0, practical: 0, general: 0 }
  );
}

/** شهریهٔ ناخالص از یک فرمول تخصیص */
export function tuitionFromFormula(
  f: Pick<FormulaLike, 'fixedAmount' | 'perUnitTheory' | 'perUnitPractical' | 'perUnitGeneral'>,
  buckets: UnitBuckets
): { fixed: number; variable: number; total: number } {
  const fixed = toRial(toNum(f.fixedAmount));
  const variable = toRial(
    toNum(buckets.theory) * toNum(f.perUnitTheory) +
      toNum(buckets.practical) * toNum(f.perUnitPractical) +
      toNum(buckets.general) * toNum(f.perUnitGeneral)
  );
  return { fixed, variable, total: fixed + variable };
}
