/**
 * Resolver یکتای قواعد شهریه — بدون هیچ وابستگی (دیتابیس/Next نداشته باشد).
 *
 * هر دو موتور شهریه (موتور ترمی و فرمول تخصیص) با همین تابع قاعده را انتخاب
 * می‌کنند تا خروجی آن‌ها نتواند واگرا شود.
 *
 * سلسله‌مراتب اولویت بر اساس بردار اختصاصیت (از مهم‌ترین به کم‌اهمیت‌ترین):
 *   ۱) مقطع (degreeLevelId)          ← مقدم بر همه
 *   ۲) رشته (majorId)
 *   ۳) نوع ترم (termType)
 *   ۴) نوع گذراندن درس (offeringType)
 *   ۵) بازهٔ ورودی (entryYearFrom/To) — هر دو کران > یک کران > بدون کران
 *
 * گره‌شکن‌ها به ترتیب:
 *   ۱) priority (کوچک‌تر برنده؛ غایب = ۱۰۰)
 *   ۲) تازگی entryYearFrom (جدیدتر = برنده — معادل effectiveFromYear قدیمی که
 *      «قاعده از این ورودی به بعد» بود)
 *   ۳) id کوچک‌تر (نتیجه مستقل از ترتیب بازگشت دیتابیس)
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
  termType?: string | null;
  offeringType?: string | null;
  entryYearFrom?: number | null;
  entryYearTo?: number | null;
  fixedAmount: unknown;
  perUnitTheory: unknown;
  perUnitPractical: unknown;
  perUnitGeneral: unknown;
  priority?: number | null;
  isActive?: number | null;
}

/** بافت دانشجو/ترم که قاعده با آن تطبیق داده می‌شود */
export interface TuitionRuleContext {
  degreeLevelId: number | null;
  majorId?: number | null;
  entryYear?: number | null;
  termType?: string | null;
  offeringType?: string | null;
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

/** آیا قاعده با بافت دانشجو سازگار است؟ (فیلد تهی = بدون محدودیت) */
export function tuitionRuleMatches(r: TuitionRuleLike, ctx: TuitionRuleContext): boolean {
  if (r.isActive != null && r.isActive !== 1) return false;
  if (r.degreeLevelId != null && r.degreeLevelId !== ctx.degreeLevelId) return false;
  if (r.majorId != null && r.majorId !== (ctx.majorId ?? null)) return false;
  if (r.termType && ctx.termType && r.termType !== ctx.termType) return false;
  if (r.offeringType && ctx.offeringType && r.offeringType !== ctx.offeringType) return false;
  if (ctx.termLevelOnly && r.offeringType) return false;

  const y = ctx.entryYear ?? null;
  if (r.entryYearFrom != null) {
    if (y === null || y < r.entryYearFrom) return false;
  }
  if (r.entryYearTo != null) {
    if (y === null || y > r.entryYearTo) return false;
  }
  return true;
}

/**
 * ترتیب دو قاعده در انتخاب (منفی = a جلوتر از b است):
 * اختصاصیت بیشتر ← مقدم. سپس priority کوچک‌تر، سپس تازگی ورودی، سپس id کوچک‌تر.
 */
export function compareTuitionRules(a: TuitionRuleLike, b: TuitionRuleLike): number {
  const dims = [
    (a.degreeLevelId != null ? 1 : 0) - (b.degreeLevelId != null ? 1 : 0),
    (a.majorId != null ? 1 : 0) - (b.majorId != null ? 1 : 0),
    (a.termType ? 1 : 0) - (b.termType ? 1 : 0),
    (a.offeringType ? 1 : 0) - (b.offeringType ? 1 : 0),
    yearSpecificity(a) - yearSpecificity(b),
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
}

export function ratesOf(r: TuitionRuleLike): TuitionRates {
  return {
    fixed: toNum(r.fixedAmount),
    theory: toNum(r.perUnitTheory),
    practical: toNum(r.perUnitPractical),
    general: toNum(r.perUnitGeneral),
  };
}