/**
 * Resolver یکتای قواعد شهریه — بدون هیچ وابستگی (دیتابیس/Next نداشته باشد).
 *
 * هر دو موتور شهریه (موتور ترمی و فرمول تخصیص) با همین تابع قاعده را انتخاب
 * می‌کنند تا خروجی آن‌ها نتواند واگرا شود.
 *
 * سلسله‌مراتب اولویت بر اساس بردار اختصاصیت (از مهم‌ترین به کم‌اهمیت‌ترین):
 *   ۱) مقطع (degreeLevelId)
 *   ۲) رشته (majorId)
 *   ۳) دانشکده (facultyId)
 *   ۴) نوع ترم (termType)
 *   ۵) نوع گذراندن درس (offeringType)
 *   ۶) فاز بالینی (clinicalPhase)
 *   ۷) بازهٔ ورودی (entryYearFrom/To) — هر دو کران > یک کران > بدون کران
 *   ۸) نیمسال ورود (entryTermId)
 *   ۹) نیمسال جاری (currentTermId)
 *
 * گره‌شکن‌ها به ترتیب:
 *   ۱) priority (کوچک‌تر برنده؛ غایب = ۱۰۰)
 *   ۲) تازگی entryYearFrom (جدیدتر = برنده)
 *   ۳) id کوچک‌تر
 */

export const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** حداقل شکل یک ردیف قاعدهٔ شهریه (مطابق با جدول `tuition_rules`) */
export interface TuitionRuleLike {
  id: number;
  degreeLevelId: number | null;
  majorId?: number | null;
  facultyId?: number | null;
  termType?: string | null;
  offeringType?: string | null;
  clinicalPhase?: string | null;
  entryYearFrom?: number | null;
  entryYearTo?: number | null;
  entryTermId?: number | null;
  currentTermId?: number | null;
  fixedAmount: unknown;
  perUnitTheory: unknown;
  perUnitPractical: unknown;
  perUnitGeneral: unknown;
  minSummerUnits?: number | null;
  percentUnderMin?: number | null;
  priority?: number | null;
  isActive?: number | null;
}

/** بافت دانشجو/ترم که قاعده با آن تطبیق داده می‌شود */
export interface TuitionRuleContext {
  degreeLevelId: number | null;
  majorId?: number | null;
  facultyId?: number | null;
  entryYear?: number | null;
  termType?: string | null;
  offeringType?: string | null;
  clinicalPhase?: string | null;
  entryTermId?: number | null;
  currentTermId?: number | null;
  /**
   * فقط قواعدِ بدون offeringType در نظر گرفته می‌شوند. برای شهریهٔ ثابت ضروری
   * است: شهریهٔ ثابت به ازای نوع ترم است و نباید از قاعده‌ای بیاید که برای
   * یک نوع گذراندن درس خاص (مثلا TRANSFER) تعریف شده است.
   */
  termLevelOnly?: boolean;
}

/** اختصاصیت بازهٔ ورودی: بدون کران ۰، یک کران ۱، هر دو کران ۲ */
function yearSpecificity(r: TuitionRuleLike): number {
  const hasFrom = r.entryYearFrom != null;
  const hasTo = r.entryYearTo != null;
  return hasFrom && hasTo ? 2 : hasFrom || hasTo ? 1 : 0;
}

function termSpecificity(r: TuitionRuleLike): number {
  const hasEntry = r.entryTermId != null;
  const hasCurrent = r.currentTermId != null;
  return hasEntry && hasCurrent ? 2 : hasEntry || hasCurrent ? 1 : 0;
}

/** آیا قاعده با بافت دانشجو سازگار است؟ (فیلد تهی = بدون محدودیت) */
export function tuitionRuleMatches(r: TuitionRuleLike, ctx: TuitionRuleContext): boolean {
  if (r.isActive != null && r.isActive !== 1) return false;
  if (r.degreeLevelId != null && r.degreeLevelId !== ctx.degreeLevelId) return false;
  if (r.majorId != null && r.majorId !== (ctx.majorId ?? null)) return false;
  if (r.facultyId != null && r.facultyId !== (ctx.facultyId ?? null)) return false;
  if (r.termType && ctx.termType && r.termType !== ctx.termType) return false;
  if (r.offeringType && ctx.offeringType && r.offeringType !== ctx.offeringType) return false;
  if (r.clinicalPhase && ctx.clinicalPhase && r.clinicalPhase !== ctx.clinicalPhase) return false;
  if (ctx.termLevelOnly && r.offeringType) return false;

  const y = ctx.entryYear ?? null;
  if (r.entryYearFrom != null) {
    if (y === null || y < r.entryYearFrom) return false;
  }
  if (r.entryYearTo != null) {
    if (y === null || y > r.entryYearTo) return false;
  }
  if (r.entryTermId != null && r.entryTermId !== (ctx.entryTermId ?? null)) return false;
  if (r.currentTermId != null && r.currentTermId !== (ctx.currentTermId ?? null)) return false;
  return true;
}

/**
 * ترتیب دو قاعده در انتخاب (منفی = a جلوتر از b است):
 * اختصاصیت بیشتر ← مقدم. سپس priority کوچک‌تر، затем تازگی ورودی، سپس id کوچک‌تر.
 */
export function compareTuitionRules(a: TuitionRuleLike, b: TuitionRuleLike): number {
  const dims = [
    (a.degreeLevelId != null ? 1 : 0) - (b.degreeLevelId != null ? 1 : 0),
    (a.majorId != null ? 1 : 0) - (b.majorId != null ? 1 : 0),
    (a.facultyId != null ? 1 : 0) - (b.facultyId != null ? 1 : 0),
    (a.termType ? 1 : 0) - (b.termType ? 1 : 0),
    (a.offeringType ? 1 : 0) - (b.offeringType ? 1 : 0),
    (a.clinicalPhase ? 1 : 0) - (b.clinicalPhase ? 1 : 0),
    yearSpecificity(a) - yearSpecificity(b),
    termSpecificity(a) - termSpecificity(b),
  ];
  for (const d of dims) if (d !== 0) return -d;

  const pa = toNum(a.priority ?? 100);
  const pb = toNum(b.priority ?? 100);
  if (pa !== pb) return pa - pb;

  const ya = toNum(a.entryYearFrom ?? 0);
  const yb = toNum(b.entryYearFrom ?? 0);
  if (ya !== yb) return yb - ya;

  return a.id - b.id;
}

/** انتخاب قاعدهٔ برندهٔ منطبق؛ بدون قاعدهٔ منطبق null برمی‌گردد */
export function resolveTuitionRule<T extends TuitionRuleLike>(
  rows: T[] | null | undefined,
  ctx: TuitionRuleContext
): T | null {
  if (!rows || rows.length === 0) return null;
  const matched = rows.filter((r) => tuitionRuleMatches(r, ctx));
  if (matched.length === 0) return null;
  return matched.reduce((best, r) => (compareTuitionRules(r, best) < 0 ? r : best));
}

/** نرخ‌های هر واحد از یک قاعده — برای تطبیق آسان با موتورها */
export interface TuitionRates {
  fixed: number;
  theory: number;
  practical: number;
  general: number;
  minSummerUnits: number | null;
  percentUnderMin: number | null;
}

export function ratesOf(r: TuitionRuleLike): TuitionRates {
  return {
    fixed: toNum(r.fixedAmount),
    theory: toNum(r.perUnitTheory),
    practical: toNum(r.perUnitPractical),
    general: toNum(r.perUnitGeneral),
    minSummerUnits: r.minSummerUnits != null ? toNum(r.minSummerUnits) : null,
    percentUnderMin: r.percentUnderMin != null ? toNum(r.percentUnderMin) : null,
  };
}