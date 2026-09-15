/**
 * منطق خالص انتخاب قاعدهٔ شهریه — بدون وابستگی به دیتابیس یا Next.
 *
 * جدا نگه‌داشتن این بخش دو فایده دارد:
 *   ۱) قابل تست مستقیم است (بدون DB)؛
 *   ۲) موتور شهریه می‌تواند قواعد را یک‌بار بخواند و برای هر درس فقط
 *      همین تابع خالص را صدا بزند (بدون کوئری تکراری).
 *
 * از نسخهٔ یکپارچه، خودِ انتخاب قاعده در src/lib/tuition-resolver.ts است
 * (سلسله‌مراتب: مقطع > رشته > نوع ترم > نوع درس > بازهٔ ورودی) و تابع‌های
 * اینجا برای سازگاری با شکل قدیمی ردیف‌ها (fixedTuition/perUnitTuition)
 * آن را فراخوانی می‌کنند.
 */
import { resolveTuitionRule, type TuitionRuleLike } from './tuition-resolver';

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
  /** کلید دوم اولویت: رشته (برابر majorId دانشجو) — برای قواعد یکپارچهٔ دارای رشته */
  majorId?: number | null;
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
  majorId?: number | null;
  termType: string | null;
  offeringType: string | null;
  fixedTuition: unknown;
  perUnitTuition: unknown;
  effectiveFromYear: number | null;
  priority?: number | null;
}

export const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * تعیین نوع ترم برای محاسبهٔ شهریه.
 * ترتیب اولویت:
 *  1) ستون termType (منبع معتبر، قابل تنظیم از «تنظیمات»/«ترمیم دیتابیس»)،
 *  2) کد ترم با پیشوند 00EQ → معادل‌سازی. این «درمانگر» برای ترم‌های معادل‌سازی‌ای است
 *     که پیش از افزودن ستون termType ساخته شده‌اند و مقدار پیش‌فرض NORMAL دارند؛
 *     بدون آن، نرخ ترم عادی به اشتباه به ترم معادل‌سازی اعمال می‌شد.
 *  3) پرچم isSummer → تابستان.
 */
export function termTypeOf(term: {
  termType?: string | null;
  termCode?: string | null;
  isSummer?: number | null;
}): TermType {
  // ۱) پیشوند 00EQ نشانهٔ قطعی ترم معادل‌سازی است (این ترم‌ها را خودِ موتور معادل‌سازی
  //    می‌سازد). این بررسی عمداً بر ستون termType مقدم است: ترم‌های معادل‌سازیِ ساخته‌شدهٔ
  //    پیش از افزودن آن ستون، مقدار پیش‌فرض NOT NULL یعنی NORMAL دارند و اگر ستون مقدم
  //    بود این ترمیم هرگز اثر نمی‌کرد و نرخ ترم عادی به ترم معادل‌سازی اعمال می‌شد.
  if (term.termCode && /^00EQ/i.test(String(term.termCode).trim())) return 'EQUIVALENCE';
  // ۲) ستون termType (منبع معتبر و قابل تنظیم برای همهٔ ترم‌های دیگر)
  if (term.termType === 'EQUIVALENCE' || term.termType === 'SUMMER' || term.termType === 'NORMAL') {
    return term.termType;
  }
  // ۳) پرچم قدیمی isSummer
  if (term.isSummer) return 'SUMMER';
  return 'NORMAL';
}

/**
 * انتخاب خاص‌ترین قاعدهٔ منطبق (پیاده‌سازی از نسخهٔ یکپارچه با سلسله‌مراتب
 * مقطع > رشته > نوع ترم > نوع درس > بازهٔ ورودی). رشتهٔ ورودی از این‌پس
 * (params.majorId) روی ردیف‌های دارای majorId اثر می‌گذارد.
 */
export function pickFeeRule<T extends FeeRuleLike>(rows: T[], params: FeeRuleParams): ResolvedRule | null {
  const canonical: TuitionRuleLike[] = rows.map((r) => ({
    id: r.id,
    degreeLevelId: r.degreeLevelId,
    majorId: r.majorId ?? null,
    termType: r.termType,
    offeringType: r.offeringType,
    entryYearFrom: r.effectiveFromYear,
    entryYearTo: null,
    fixedAmount: r.fixedTuition,
    perUnitTheory: r.perUnitTuition,
    perUnitPractical: r.perUnitTuition,
    perUnitGeneral: r.perUnitTuition,
    priority: r.priority ?? 100,
  }));

  const best = resolveTuitionRule(canonical, {
    degreeLevelId: params.degreeLevelId,
    majorId: params.majorId ?? null,
    entryYear: params.entryYear ?? null,
    termType: params.termType ?? null,
    offeringType: params.offeringType ?? null,
    termLevelOnly: params.termLevelOnly,
  });
  if (!best) return null;

  return {
    id: best.id,
    fixedTuition: toNum(best.fixedAmount),
    perUnitTuition: toNum(best.perUnitTheory),
    degreeLevelId: best.degreeLevelId,
    termType: best.termType ?? null,
    offeringType: best.offeringType ?? null,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * پل: قواعد مالی قدیمی (term_financial_rules) → قواعد موتور جدید
 *
 * چرا لازم است: ماژول مهاجرت داده‌ها جدول قدیمی `term_financial_rules` را پر
 * می‌کند، ولی موتور شهریه از `tuition_fee_rules` می‌خواند. بدون این پل، پس از
 * مهاجرت، موتور هیچ قاعده‌ای نمی‌بیند و شهریه بی‌صدا «صفر» محاسبه می‌شود.
 *
 * دو تفاوت کلیدی که نگاشت را تعیین می‌کنند:
 *  ۱) قدیمی به ازای «ترم» کلید می‌خورد (termId+degreeLevelId)، جدید به ازای
 *     «نوع ترم» (degreeLevelId+termType+offeringType) → چند ترم هم‌نوع باید در
 *     یک قاعده جمع شوند و نرخ آخرین ترم بماند.
 *  ۲) `effectiveFromYear` در موتور جدید با «سال ورودی دانشجو» مقایسه می‌شود
 *     (params.entryYear ← students.entryYear)، یعنی قیمت‌گذاری بر اساس ورودی است.
 *     جدول قدیمی هیچ بُعد «ورودی» ندارد؛ پر کردن این فیلد از روی «سال ترم»
 *     غلط است: دانشجوی ورودی ۱۴۰۰ که در ترم ۱۴۰۳ درس می‌خواند نرخ را از دست
 *     می‌داد. پس این فیلد عمداً خالی می‌ماند (بدون محدودیت ورودی) و اگر مدیر
 *     قیمت‌گذاری ورودی‌محور خواست، در همین صفحه ویرایش می‌کند.
 * ──────────────────────────────────────────────────────────────────────────── */

/** یک سطر قاعدهٔ مالی قدیمی به‌همراه اطلاعات ترمِ مربوطه */
export interface LegacyFeeRuleLike {
  degreeLevelId: number | null;
  /** نوع ترمِ از پیش تعیین‌شده (با termTypeOf به دست می‌آید) */
  termType: TermType;
  /** کد ترم؛ فقط برای یادداشتِ رهگیری استفاده می‌شود */
  termCode: string | null;
  fixedTuition: unknown;
  perUnitTuition: unknown;
  /** کلید تازگی ترم (معمولاً id ترم)؛ در هر گروه بزرگ‌ترین برنده است */
  termSortKey: number;
}

export interface FeeRuleDraft {
  degreeLevelId: number | null;
  termType: TermType;
  offeringType: null;
  fixedTuition: number;
  perUnitTuition: number;
  /**
   * همیشه null — عمداً. توضیح در هدر همین بخش (بند ۲).
   */
  effectiveFromYear: null;
  note: string;
}

/**
 * تبدیل قواعد قدیمی به پیش‌نویس قواعد جدید.
 *  - گروه‌بندی بر (مقطع، نوع ترم)؛
 *  - در هر گروه، تازه‌ترین ترم برنده است تا نرخ ترم‌های قدیمیِ هم‌نوع جای آن را نگیرد؛
 *  - قواعدی که هر دو نرخشان صفر است دور ریخته می‌شوند (قاعدهٔ بی‌اثر).
 */
export function mapLegacyFeeRules<T extends LegacyFeeRuleLike>(rows: T[]): FeeRuleDraft[] {
  const groups = new Map<string, T>();
  for (const r of rows) {
    const key = `${r.degreeLevelId ?? 'null'}|${r.termType}`;
    const prev = groups.get(key);
    if (!prev || r.termSortKey > prev.termSortKey) groups.set(key, r);
  }

  const drafts: FeeRuleDraft[] = [];
  for (const r of groups.values()) {
    const fixedTuition = Math.round(toNum(r.fixedTuition));
    const perUnitTuition = Math.round(toNum(r.perUnitTuition));
    if (fixedTuition <= 0 && perUnitTuition <= 0) continue;
    drafts.push({
      degreeLevelId: r.degreeLevelId,
      termType: r.termType,
      offeringType: null,
      fixedTuition,
      perUnitTuition,
      effectiveFromYear: null,
      note: r.termCode
        ? `درون‌ریزی از قواعد مالی قدیمی — نرخ ترم ${r.termCode}`
        : 'درون‌ریزی از قواعد مالی قدیمی',
    });
  }

  return drafts.sort((a, b) =>
    (a.degreeLevelId ?? 0) - (b.degreeLevelId ?? 0) ||
    a.termType.localeCompare(b.termType));
}

/* ─────────────────────────────────────────────────────────────────────────────
 * سیاست شهریهٔ ثابت معادل‌سازی
 *
 * چرا لازم است: دروس معادل‌سازی هر ۲۰ واحد در یک نیمسال جدا (00EQ1، 00EQ2، …)
 * ثبت می‌شوند. اگر شهریهٔ ثابت به ازای هر نیمسال شارژ شود، دانشجویی با ۴۵ واحد
 * معادل‌سازی سه بار شهریهٔ ثابت می‌دهد. اینکه کدام رفتار درست است یک تصمیم
 * سیاستی است، پس به مدیر واگذار شده و در کد سخت‌کد نیست.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * ONCE     → شهریهٔ ثابت یک بار، روی اولین نیمسال معادل‌سازی دانشجو
 * PER_TERM → به ازای هر نیمسال معادل‌سازی (۰۰EQ) جداگانه
 * NONE     → بدون شهریهٔ ثابت برای معادل‌سازی
 *
 * شهریهٔ متغیر در هر سه حالت به ازای هر واحد محاسبه می‌شود.
 */
export type EquivFixedMode = 'ONCE' | 'PER_TERM' | 'NONE';

/** نرمال‌سازی مقدار تنظیم؛ هر مقدار ناشناخته به پیش‌فرض امن ONCE برمی‌گردد */
export function normalizeEquivFixedMode(value: unknown): EquivFixedMode {
  const v = String(value ?? '').trim().toUpperCase();
  return v === 'PER_TERM' || v === 'NONE' ? v : 'ONCE';
}

/** آیا برای این نیمسال باید شهریهٔ ثابت شارژ شود؟ */
export function shouldChargeFixed(mode: EquivFixedMode, isFirstTerm: boolean): boolean {
  if (mode === 'NONE') return false;
  if (mode === 'PER_TERM') return true;
  return isFirstTerm;
}
