/**
 * منطق خالص انتخاب قاعدهٔ شهریه — بدون وابستگی به دیتابیس یا Next.
 *
 * جدا نگه‌داشتن این بخش دو فایده دارد:
 *   ۱) قابل تست مستقیم است (بدون DB)؛
 *   ۲) موتور شهریه می‌تواند قواعد را یک‌بار بخواند و برای هر درس فقط
 *      همین تابع خالص را صدا بزند (بدون کوئری تکراری).
 */

export type TermType = 'NORMAL' | 'SUMMER' | 'EQUIVALENCE';

export interface ResolvedRule {
  id: number;
  fixedTuition: number;
  perUnitTuition: number;
  degreeLevelId: number | null;
  termType: string | null;
  offeringType: string | null;
}

export interface FeeRuleParams {
  degreeLevelId: number | null;
  termType: TermType | string | null;
  offeringType?: string | null;
  entryYear?: number | null;
  /**
   * فقط قواعدِ بدون offeringType در نظر گرفته می‌شوند. این برای «شهریهٔ ثابت»
   * ضروری است: شهریهٔ ثابت به ازای نوع ترم است و نباید از قاعده‌ای بیاید که
   * برای یک نوع گذراندن درس خاص (مثلاً TRANSFER) تعریف شده است.
   */
  termLevelOnly?: boolean;
}

/** حداقل شکلی که یک سطر قاعدهٔ شهریه باید داشته باشد */
export interface FeeRuleLike {
  id: number;
  degreeLevelId: number | null;
  termType: string | null;
  offeringType: string | null;
  fixedTuition: unknown;
  perUnitTuition: unknown;
  effectiveFromYear: number | null;
}

export const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * انتخاب خاص‌ترین قاعدهٔ منطبق.
 * خاص‌بودن = تعداد کلیدهای غیرخالی بیشتر (مقطع، نوع ترم، نوع درس).
 * تساوی → جدیدترین effectiveFromYear و سپس id بزرگ‌تر.
 */
export function pickFeeRule<T extends FeeRuleLike>(rows: T[], params: FeeRuleParams): ResolvedRule | null {
  const matches = rows.filter((r) => {
    // قاعدهٔ مقید به مقطع فقط برای همان مقطع است
    if (r.degreeLevelId != null && r.degreeLevelId !== params.degreeLevelId) return false;
    if (r.termType && params.termType && r.termType !== params.termType) return false;
    if (params.termLevelOnly && r.offeringType) return false;
    if (r.offeringType && params.offeringType && r.offeringType !== params.offeringType) return false;
    if (r.effectiveFromYear != null && params.entryYear != null && r.effectiveFromYear > params.entryYear) return false;
    return true;
  });

  if (matches.length === 0) return null;

  const specificity = (r: T) =>
    (r.degreeLevelId != null ? 1 : 0) + (r.termType ? 1 : 0) + (r.offeringType ? 1 : 0);

  const sorted = [...matches].sort((a, b) => {
    const s = specificity(b) - specificity(a);
    if (s !== 0) return s;
    const y = (b.effectiveFromYear ?? 0) - (a.effectiveFromYear ?? 0);
    if (y !== 0) return y;
    return b.id - a.id;
  });

  const best = sorted[0];
  return {
    id: best.id,
    fixedTuition: toNum(best.fixedTuition),
    perUnitTuition: toNum(best.perUnitTuition),
    degreeLevelId: best.degreeLevelId,
    termType: best.termType,
    offeringType: best.offeringType,
  };
}
