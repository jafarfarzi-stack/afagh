// ══════════════════════════════════════════════════════════════════════
//  منطق خالص امور مالی دانشجویان
//
//  ترتیب قانونی اعمال اقلام مالی — این ترتیب قراردادی است و تغییرش
//  ماندهٔ همهٔ دانشجویان را جابه‌جا می‌کند، پس صریح مستند شده:
//
//    ۱) شهریهٔ ناخالص  = ثابت + متغیر
//    ۲) تخفیف‌ها        روی ناخالص (هر تخفیف روی مأخذ خودش)
//    ۳) خالص           = ناخالص − جمع تخفیف‌ها
//    ۴) پوشش بنیادها    روی خالص (کمیتهٔ امداد، بنیاد شهید و …)
//    ۵) سهم دانشجو     = خالص − جمع پوشش بنیادها
//    ۶) مانده          = سهم دانشجو − پرداخت‌ها − چک وصول‌شده − وام
//
//  چکِ معوق (PENDING) پرداخت شمرده نمی‌شود؛ تنها پس از وصول به مانده اثر
//  می‌گذارد. این تنها تعبیری است که با دفتر مالی واقعی سازگار است —
//  شمردن چکِ وصول‌نشده به‌عنوان پرداخت، بدهی را دروغین صفر می‌کند.
//
//  این ماژول هیچ import ندارد تا بدون دیتابیس و بدون Next قابل آزمون باشد.
//  دسترسی به دیتابیس در finance-engine.ts است.
// ══════════════════════════════════════════════════════════════════════

/** تبدیل امن مقدار numeric/رشته/تهی به عدد */
export function toNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

/** گرد کردن به ریال (بدون کسری) — همهٔ مبالغ سیستم ریالی‌اند */
export function toRial(value: number): number {
  return Math.round(value || 0);
}

const DAY_MS = 86_400_000;

/** تبدیل تاریخ (رشته/Date/تهی) به میلی‌ثانیهٔ epoch؛ تهی → null */
export function toMs(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

// ══════════════════════════════════════════════════════════════════════
//  تخفیف شهریه
// ══════════════════════════════════════════════════════════════════════

export type DiscountKind = 'PERCENT' | 'FIXED';
/** قلمرو اثر تخفیف: شهریهٔ ثابت، متغیر، یا هر دو */
export type DiscountScope = 'FIXED' | 'VARIABLE' | 'BOTH';

export interface DiscountLike {
  id: number;
  kind: DiscountKind | string;
  percent: number | string | null;
  amount: number | string | null;
  appliesTo: DiscountScope | string | null;
  /** سقف درصد مجاز از تعریف نوع تخفیف؛ null/تهی = بدون سقف */
  maxPercent?: number | string | null;
  /** عنوان نوع تخفیف — فقط برای نمایش در کارنامه */
  title?: string | null;
}

export interface AppliedAmount {
  id: number;
  title?: string | null;
  amount: number;
}

/** مأخذ محاسبهٔ یک تخفیف بر اساس قلمروی اثر آن */
export function discountBase(
  appliesTo: DiscountScope | string | null,
  fixedTuition: number,
  variableTuition: number
): number {
  if (appliesTo === 'FIXED') return toNum(fixedTuition);
  if (appliesTo === 'VARIABLE') return toNum(variableTuition);
  return toNum(fixedTuition) + toNum(variableTuition);
}

/** درصد مؤثر یک تخفیف با اعمال سقف مجاز نوع تخفیف */
export function effectivePercent(d: DiscountLike): number {
  const cap = d.maxPercent === null || d.maxPercent === undefined || d.maxPercent === ''
    ? 100
    : Math.max(0, toNum(d.maxPercent));
  const p = Math.max(0, toNum(d.percent));
  return Math.min(p, cap);
}

/** مبلغ یک تخفیف پیش از اعمال سقفِ «بیش از کل شهریه نشود» */
export function discountAmount(
  d: DiscountLike,
  fixedTuition: number,
  variableTuition: number
): number {
  if (d.kind === 'PERCENT') {
    const base = discountBase(d.appliesTo, fixedTuition, variableTuition);
    return toRial((base * effectivePercent(d)) / 100);
  }
  return toRial(Math.max(0, toNum(d.amount)));
}

export interface DiscountOutcome {
  total: number;
  net: number;
  applied: AppliedAmount[];
}

/**
 * اعمال زنجیرهٔ تخفیف‌ها.
 *
 * ترتیب ورودی مؤثر است: چون جمع تخفیف‌ها هرگز از کل شهریه بیشتر نمی‌شود،
 * تخفیفی که دیرتر برسد ممکن است صفر شود. فراخوان مسئول مرتب‌سازی است
 * (معمولاً درصد بالاتر زودتر، تا دانشجو بیشترین سود را ببرد).
 */
export function applyDiscounts(
  list: DiscountLike[],
  fixedTuition: number,
  variableTuition: number
): DiscountOutcome {
  const gross = toNum(fixedTuition) + toNum(variableTuition);
  let remaining = gross;
  const applied: AppliedAmount[] = [];

  for (const d of list || []) {
    let amount = discountAmount(d, fixedTuition, variableTuition);
    if (amount > remaining) amount = remaining;
    if (amount < 0) amount = 0;
    remaining -= amount;
    applied.push({ id: d.id, title: d.title ?? null, amount });
  }

  return { total: gross - remaining, net: remaining, applied };
}

// ══════════════════════════════════════════════════════════════════════
//  پوشش بنیادها (کمیتهٔ امداد، بنیاد شهید، خیرین)
// ══════════════════════════════════════════════════════════════════════

export interface SponsorshipLike {
  id: number;
  coverageKind: DiscountKind | string;
  percent: number | string | null;
  amount: number | string | null;
  /** عنوان بنیاد — فقط برای نمایش */
  title?: string | null;
}

export interface SponsorshipOutcome {
  total: number;
  studentShare: number;
  applied: AppliedAmount[];
}

/**
 * پوشش بنیادها روی خالصِ پس از تخفیف اعمال می‌شود، نه روی ناخالص.
 *
 * دلیل: اگر بنیاد درصدی از ناخالص را بپردازد و دانشجو هم تخفیف گرفته باشد،
 * جمع دو مورد از شهریه فراتر می‌رود و دانشگاه بابت یک ترم دوبار پول می‌گیرد.
 */
export function applySponsorships(
  list: SponsorshipLike[],
  netTuition: number
): SponsorshipOutcome {
  const net = Math.max(0, toNum(netTuition));
  let remaining = net;
  const applied: AppliedAmount[] = [];

  for (const s of list || []) {
    let amount: number;
    if (s.coverageKind === 'PERCENT') {
      const p = Math.min(Math.max(0, toNum(s.percent)), 100);
      amount = toRial((net * p) / 100);
    } else {
      amount = toRial(Math.max(0, toNum(s.amount)));
    }
    if (amount > remaining) amount = remaining;
    if (amount < 0) amount = 0;
    remaining -= amount;
    applied.push({ id: s.id, title: s.title ?? null, amount });
  }

  return { total: net - remaining, studentShare: remaining, applied };
}

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
 * معیار: نخست تطابق، سپس اولویتِ عددِ کوچک‌تر، سپس شناسهٔ کوچک‌تر.
 * گره‌شکنی با شناسه عمدی است تا نتیجه مستقل از ترتیب بازگشت دیتابیس باشد.
 */
export function pickFormula<T extends FormulaLike>(
  formulas: T[],
  ctx: FormulaContext
): T | null {
  const matched = (formulas || []).filter((f) => formulaMatches(f, ctx));
  if (matched.length === 0) return null;
  return matched.reduce((best, f) => {
    const bp = toNum(best.priority);
    const fp = toNum(f.priority);
    if (fp !== bp) return fp < bp ? f : best;
    return f.id < best.id ? f : best;
  });
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

// ══════════════════════════════════════════════════════════════════════
//  کارنامهٔ مالی ترم‌به‌ترم
// ══════════════════════════════════════════════════════════════════════

export interface LedgerTxn {
  id: number;
  termId: number | null;
  transactionType: string | null;
  amount: number | string | null;
  description?: string | null;
  createdAt?: string | Date | null;
}

export interface ChequeRow {
  id: number;
  termId: number | null;
  chequeNo?: string | null;
  bankName?: string | null;
  amount: number | string | null;
  dueDate?: string | Date | null;
  status: string | null;
  remindedAt?: string | Date | null;
}

export interface LoanRow {
  id: number;
  termId: number | null;
  amount: number | string | null;
  lender?: string | null;
  status: string | null;
}

/** انواع تراکنش دفتر مالی که «بدهی» می‌سازند */
export const CHARGE_TYPES = ['CHARGE', 'TUITION_CHARGE'] as const;
/** انواع تراکنش دفتر مالی که «پرداخت» شمرده می‌شوند */
export const PAYMENT_TYPES = ['PAYMENT', 'CREDIT'] as const;
/** چک با این وضعیت پرداخت شمرده می‌شود */
export const CHEQUE_CLEARED = 'CLEARED';
/** وام با این وضعیت به مانده اثر می‌گذارد */
export const LOAN_ACTIVE = ['ACTIVE', 'SETTLED'] as const;

export function isChargeType(type: string | null): boolean {
  return CHARGE_TYPES.includes((type || '').toUpperCase() as (typeof CHARGE_TYPES)[number]);
}

export function isPaymentType(type: string | null): boolean {
  return PAYMENT_TYPES.includes((type || '').toUpperCase() as (typeof PAYMENT_TYPES)[number]);
}

/** رویداد کارنامهٔ مالی — «چه اتفاقی افتاده» */
export interface StatementEvent {
  kind: 'CHARGE' | 'DISCOUNT' | 'SPONSOR' | 'PAYMENT' | 'CHEQUE' | 'LOAN' | 'CLEARANCE';
  label: string;
  amount: number;
  dateMs: number | null;
  /** مثبت = به نفع دانشجو (کاهش بدهی)، منفی = به زیان او */
  sign: 1 | -1;
}

export interface TermStatement {
  termId: number;
  termTitle: string;
  charges: number;
  discounts: number;
  sponsorships: number;
  payments: number;
  chequesCleared: number;
  chequesPending: number;
  chequesBounced: number;
  loans: number;
  /** ناخالص − تخفیف − پوشش بنیاد */
  netPayable: number;
  /** مثبت = دانشجو بدهکار است */
  balance: number;
  events: StatementEvent[];
}

export interface TranscriptInput {
  ledger: LedgerTxn[];
  discounts?: AppliedAmount[];
  sponsorships?: AppliedAmount[];
  cheques?: ChequeRow[];
  loans?: LoanRow[];
  /** عنوان ترم‌ها برای نمایش؛ کلید = شناسهٔ ترم */
  termTitles?: Record<string, string>;
}

/**
 * ساخت کارنامهٔ مالی ترم‌به‌ترم از دفتر مالی و اقلام جانبی.
 *
 * تخفیف‌ها و پوشش بنیادها در ورودی «اعمال‌شده» دریافت می‌شوند چون محاسبهٔ
 * آن‌ها به شهریهٔ همان ترم نیاز دارد و در موتور شهریه انجام شده است.
 * تراکنش‌های بدون ترم (termId تهی) در سطر «بدون ترم» جمع می‌شوند تا هیچ
 * رویداد مالی گم نشود.
 */
export function buildTranscript(input: TranscriptInput): TermStatement[] {
  const termIds = new Set<number>();
  const NO_TERM = 0;

  for (const t of input.ledger || []) {
    termIds.add(t.termId === null || t.termId === undefined ? NO_TERM : t.termId);
  }
  for (const c of input.cheques || []) {
    termIds.add(c.termId === null || c.termId === undefined ? NO_TERM : c.termId);
  }
  for (const l of input.loans || []) {
    termIds.add(l.termId === null || l.termId === undefined ? NO_TERM : l.termId);
  }

  const titles = input.termTitles || {};
  const discountByTerm = input.discounts || [];
  const sponsorByTerm = input.sponsorships || [];

  const statements: TermStatement[] = [];

  for (const termId of Array.from(termIds).sort((a, b) => a - b)) {
    const inTerm = <T extends { termId: number | null }>(rows: T[]): T[] =>
      rows.filter((r) => (r.termId === null || r.termId === undefined ? NO_TERM : r.termId) === termId);

    const events: StatementEvent[] = [];
    let charges = 0;
    let payments = 0;

    for (const txn of inTerm(input.ledger || [])) {
      const amount = toNum(txn.amount);
      const dateMs = toMs(txn.createdAt);
      if (isChargeType(txn.transactionType)) {
        charges += amount;
        events.push({
          kind: 'CHARGE',
          label: txn.description || 'ثبت شهریه',
          amount,
          dateMs,
          sign: -1
        });
      } else if (isPaymentType(txn.transactionType)) {
        payments += amount;
        events.push({
          kind: 'PAYMENT',
          label: txn.description || 'پرداخت',
          amount,
          dateMs,
          sign: 1
        });
      }
    }

    let discounts = 0;
    for (const d of discountByTerm) {
      if ((d as { termId?: number | null }).termId !== undefined &&
          ((d as { termId?: number | null }).termId ?? NO_TERM) !== termId) continue;
      discounts += toNum(d.amount);
      events.push({
        kind: 'DISCOUNT',
        label: d.title || 'تخفیف شهریه',
        amount: toNum(d.amount),
        dateMs: null,
        sign: 1
      });
    }

    let sponsorships = 0;
    for (const s of sponsorByTerm) {
      if ((s as { termId?: number | null }).termId !== undefined &&
          ((s as { termId?: number | null }).termId ?? NO_TERM) !== termId) continue;
      sponsorships += toNum(s.amount);
      events.push({
        kind: 'SPONSOR',
        label: s.title || 'پوشش بنیاد',
        amount: toNum(s.amount),
        dateMs: null,
        sign: 1
      });
    }

    let chequesCleared = 0;
    let chequesPending = 0;
    let chequesBounced = 0;

    for (const c of inTerm(input.cheques || [])) {
      const amount = toNum(c.amount);
      const status = String(c.status || '').toUpperCase();
      const label = `چک ${c.chequeNo || ''}${c.bankName ? ` — ${c.bankName}` : ''}`.trim();
      const dateMs = toMs(c.dueDate);

      if (status === CHEQUE_CLEARED) {
        chequesCleared += amount;
        events.push({ kind: 'CHEQUE', label: `${label} (وصول شد)`, amount, dateMs, sign: 1 });
      } else if (status === 'BOUNCED') {
        chequesBounced += amount;
        events.push({ kind: 'CHEQUE', label: `${label} (برگشتی)`, amount, dateMs, sign: -1 });
      } else if (status === 'CANCELLED') {
        events.push({ kind: 'CHEQUE', label: `${label} (باطل‌شده)`, amount, dateMs, sign: 1 });
      } else {
        chequesPending += amount;
        events.push({ kind: 'CHEQUE', label: `${label} (در انتظار وصول)`, amount, dateMs, sign: 1 });
      }
    }

    let loans = 0;
    for (const l of inTerm(input.loans || [])) {
      const status = String(l.status || '').toUpperCase();
      if (!LOAN_ACTIVE.includes(status as (typeof LOAN_ACTIVE)[number])) continue;
      const amount = toNum(l.amount);
      loans += amount;
      events.push({
        kind: 'LOAN',
        label: l.lender ? `وام — ${l.lender}` : 'وام',
        amount,
        dateMs: toMs((l as { createdAt?: string | Date | null }).createdAt),
        sign: 1
      });
    }

    const netPayable = charges - discounts - sponsorships;
    const balance = netPayable - payments - chequesCleared - loans;

    events.sort((a, b) => {
      const am = a.dateMs ?? 0;
      const bm = b.dateMs ?? 0;
      if (am !== bm) return am - bm;
      return a.kind.localeCompare(b.kind);
    });

    statements.push({
      termId,
      termTitle: termId === NO_TERM ? 'بدون ترم' : titles[String(termId)] || `ترم ${termId}`,
      charges,
      discounts,
      sponsorships,
      payments,
      chequesCleared,
      chequesPending,
      chequesBounced,
      loans,
      netPayable,
      balance,
      events
    });
  }

  return statements;
}

/** جمع کل کارنامه — ماندهٔ نهایی دانشجو (مثبت = بدهکار) */
export function transcriptTotals(statements: TermStatement[]): {
  charges: number;
  discounts: number;
  sponsorships: number;
  payments: number;
  chequesCleared: number;
  chequesPending: number;
  chequesBounced: number;
  loans: number;
  balance: number;
} {
  const sum = (key: keyof TermStatement) =>
    (statements || []).reduce((acc, s) => acc + toNum(s[key]), 0);

  return {
    charges: sum('charges'),
    discounts: sum('discounts'),
    sponsorships: sum('sponsorships'),
    payments: sum('payments'),
    chequesCleared: sum('chequesCleared'),
    chequesPending: sum('chequesPending'),
    chequesBounced: sum('chequesBounced'),
    loans: sum('loans'),
    balance: sum('balance')
  };
}

// ══════════════════════════════════════════════════════════════════════
//  یادآوری چک پیش از سررسید
// ══════════════════════════════════════════════════════════════════════

export interface ChequeReminderRow {
  id: number;
  chequeNo?: string | null;
  amount: number | string | null;
  dueDate: string | Date | null;
  status: string | null;
  remindedAt?: string | Date | null;
}

export interface ChequeReminderDecision {
  remind: boolean;
  daysLeft: number | null;
  /** true = سررسید گذشته است */
  overdue: boolean;
}

/**
 * آیا این چک نیاز به یادآوری دارد؟
 *
 * شرط‌ها: وضعیت در انتظار وصول، هنوز یادآوری نشده، و سررسید در افقِ
 * «روزهای پیش از سررسید» باشد. چکِ گذشته از سررسید هم یادآوری می‌شود
 * (daysLeft منفی) — بی‌خبر گذاشتن دانشجو از چک برگشت‌خوردنی کمکی نیست.
 */
export function chequeNeedsReminder(
  c: ChequeReminderRow,
  nowMs: number,
  remindDays: number
): ChequeReminderDecision {
  const none: ChequeReminderDecision = { remind: false, daysLeft: null, overdue: false };

  if (String(c.status || '').toUpperCase() !== 'PENDING') return none;
  if (toMs(c.remindedAt) !== null) return none;

  const due = toMs(c.dueDate);
  if (due === null) return none;

  const daysLeft = Math.ceil((due - nowMs) / DAY_MS);
  const overdue = daysLeft < 0;
  const remind = daysLeft <= Math.max(0, toNum(remindDays));

  return { remind, daysLeft, overdue };
}

/** متن پیام یادآوری چک — فارسی، با مبلغ ریالی و روزهای باقی‌مانده */
export function buildChequeReminderText(c: {
  chequeNo?: string | null;
  amount: number | string | null;
  dueDate?: string | Date | null;
  bankName?: string | null;
}, daysLeft: number | null, overdue: boolean): string {
  const no = c.chequeNo ? ` شمارهٔ ${c.chequeNo}` : '';
  const amount = toNum(c.amount).toLocaleString('fa-IR');
  const bank = c.bankName ? ` بانک ${c.bankName}` : '';

  if (overdue) {
    return `چک${no}${bank} به مبلغ ${amount} ریال از سررسید گذشته است. لطفاً هرچه زودتر برای تعیین تکلیف به امور مالی مراجعه کنید.`;
  }
  const days = daysLeft === null ? '' :
    daysLeft === 0 ? ' امروز' :
    daysLeft === 1 ? ' فردا' :
    ` تا ${daysLeft.toLocaleString('fa-IR')} روز دیگر`;
  return `چک${no}${bank} به مبلغ ${amount} ریال${days} سررسید می‌شود. لطفاً پیش از سررسید نسبت به تأمین موجودی اقدام کنید.`;
}
