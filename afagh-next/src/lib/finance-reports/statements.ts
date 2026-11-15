/**
 * ══════════════════════════════════════════════════════════════════════
 *  موتور خالصِ صورت‌های مالی — سود و زیان، صورت وضعیت مالی، نقدینگی،
 *  انحراف بودجه و بهای تمام‌شده.
 *
 *  چرا این ماژول جدا از لایهٔ SQL؟
 *  ▸ این محاسبات **قراردادِ حسابداری** دارند (این‌که درآمد چطور از فروش
 *    کسر می‌شود، ترازنامه چطور تراز می‌شود، نقدینگی چطور انباشته می‌شود).
 *    اگر داخلِ کوئری‌های SQL زندگی کنند، هیچ‌وقت قابل‌آزمون نبودند.
 *  ▸ این ماژول هیچ importِ DB/React ندارد ⇒ تست واحد، بدون دیتابیس.
 *
 *  قرارداد علامت (یکپارچه با موتور مالیِ دانشجو):
 *    ▸ درآمد و هزینه همیشه **مثبت** گزارش می‌شوند.
 *    ▸ نتیجه/سود همیشه **مثبت = سود** و **منفی = زیان** است.
 * ══════════════════════════════════════════════════════════════════════
 */

export const R = (n: unknown): number => {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? v : 0;
};

// ══════════════════════════════════════════════════════════════════════
//  ۱) صورت سود و زیان
// ══════════════════════════════════════════════════════════════════════

export interface IncomeStatementInput {
  /** عنوان دوره — کد ترم یا بازهٔ گزارش */
  period: string;
  /** شهریهٔ ناخالص (فروش خدمات آموزشی) */
  tuitionGross: number;
  /** کل تخفیف‌ها (دفتری + جدولی، سقف‌خورده) */
  discountTotal: number;
  /** پوشش بنیاد / خیرین — درآمدِ دانشگاه */
  sponsorshipIncome: number;
  /** سایر درآمد (بستانکاری، برگشت، سایر واریزها) */
  otherIncome: number;
  /** هزینهٔ حق‌التدریس (ناخالص) */
  teachingCost: number;
  /** کسوراتِ حق‌التدریس (بیمه و …) */
  payrollDeductions: number;
  /** سایر هزینه‌ها (هزینهٔ شرکت، پیمانکاری، استهلاک …) */
  otherExpenses: number;
}

export interface IncomeStatement {
  period: string;
  revenue: {
    /** فروش خدمات آموزشی (ناخالص) */
    tuitionGross: number;
    /** کسر: تخفیف‌ها */
    discount: number;
    /** فروش خالص */
    tuitionNet: number;
    sponsorship: number;
    other: number;
    /** جمع درآمد */
    total: number;
  };
  costs: {
    teaching: number;
    payrollDeductions: number;
    other: number;
    /** جمع هزینه */
    total: number;
  };
  /** سود (>) یا زیان (<) عملیاتی */
  operatingResult: number;
  /** سود/زیان خالص */
  netResult: number;
}

export function buildIncomeStatement(i: IncomeStatementInput): IncomeStatement {
  const tuitionGross = R(i.tuitionGross);
  const discount = R(i.discountTotal);
  const tuitionNet = tuitionGross - discount;
  const sponsorship = R(i.sponsorshipIncome);
  const other = R(i.otherIncome);
  const revenueTotal = tuitionNet + sponsorship + other;

  const teaching = R(i.teachingCost);
  const deductions = R(i.payrollDeductions);
  const otherCosts = R(i.otherExpenses);
  const costTotal = teaching + deductions + otherCosts;

  const operatingResult = revenueTotal - costTotal;
  return {
    period: i.period,
    revenue: {
      tuitionGross,
      discount,
      tuitionNet,
      sponsorship,
      other,
      total: revenueTotal,
    },
    costs: { teaching, payrollDeductions: deductions, other: otherCosts, total: costTotal },
    operatingResult,
    netResult: operatingResult,
  };
}

// ══════════════════════════════════════════════════════════════════════
//  ۲) صورت وضعیت مالی (ترازنامه)
// ══════════════════════════════════════════════════════════════════════

export interface BalanceSheetInput {
  /** عنوان دوره / تاریخِ گزارش */
  period: string;
  /** مطالبات از دانشجویان (ماندهٔ بدهی) */
  studentReceivables: number;
  /** وام‌های پرداختی به دانشجو (دارایی) */
  studentLoansReceivable: number;
  /** بستانکاری دانشجویان (پولِ دریافتیِ بیشتر از بدهی) */
  studentPayables: number;
  /** پیش‌دریافت بابتِ نیمسال‌های آینده (بدهی) */
  deferredRevenue: number;
  /** تعهداتِ حق‌التدریسِ پرداخت‌نشده (بدهی) */
  payrollPayable: number;
  /** بدهی به پیمانکاران/تأمین‌کنندگان */
  supplierPayable: number;
  /** سود/زیان انباشتهٔ دوره‌های گذشته (حقوق و سرمایه) */
  retainedSurplus: number;
}

export interface BalanceSheet {
  period: string;
  assets: {
    receivables: number;
    loansReceivable: number;
    total: number;
  };
  liabilities: {
    studentPayables: number;
    deferredRevenue: number;
    payrollPayable: number;
    supplierPayable: number;
    total: number;
  };
  equity: {
    retainedSurplus: number;
    /** سود/زیان دورهٔ جاری (در صورت وجود) */
    currentResult: number;
    total: number;
  };
  /** دارایی − (بدهی + حقوق) — باید صفر باشد */
  difference: number;
  /** آیا ترازنامه تراز است؟ */
  isBalanced: boolean;
}

export function buildBalanceSheet(i: BalanceSheetInput): BalanceSheet {
  const receivables = R(i.studentReceivables);
  const loansReceivable = R(i.studentLoansReceivable);
  const assetsTotal = receivables + loansReceivable;

  const studentPayables = R(i.studentPayables);
  const deferredRevenue = R(i.deferredRevenue);
  const payrollPayable = R(i.payrollPayable);
  const supplierPayable = R(i.supplierPayable);
  const liabilitiesTotal =
    studentPayables + deferredRevenue + payrollPayable + supplierPayable;

  const retainedSurplus = R(i.retainedSurplus);
  const equityTotal = retainedSurplus;
  const difference = assetsTotal - liabilitiesTotal - equityTotal;

  return {
    period: i.period,
    assets: { receivables, loansReceivable, total: assetsTotal },
    liabilities: {
      studentPayables,
      deferredRevenue,
      payrollPayable,
      supplierPayable,
      total: liabilitiesTotal,
    },
    equity: { retainedSurplus, currentResult: 0, total: equityTotal },
    difference,
    // ⚠ اختلافِ کوچک (کمتر از یک ریالِ گرد‌شده) خطای گردکردن است، نه خطای تراز
    isBalanced: Math.abs(difference) < 1,
  };
}

// ══════════════════════════════════════════════════════════════════════
//  ۳) صورت جریان نقدی (نقدینگی / دریافت و پرداخت)
// ══════════════════════════════════════════════════════════════════════

export interface CashFlowInput {
  period: string;
  /** دریافت از شهریه (واریز دانشجو) */
  tuitionReceipts: number;
  /** دریافت از بنیاد/خیرین */
  sponsorshipReceipts: number;
  /** سایر دریافت‌ها (وام، بستانکاری، …) */
  otherReceipts: number;
  /** پرداخت حق‌التدریس */
  teachingPayments: number;
  /** سایر پرداخت‌ها (هزینهٔ شرکت، پیمانکار، …) */
  otherPayments: number;
  /** موجودیِ اولیهٔ دوره (اختیاری) */
  openingCash?: number;
}

export interface CashFlow {
  period: string;
  receipts: { tuition: number; sponsorship: number; other: number; total: number };
  payments: { teaching: number; other: number; total: number };
  /** خالصِ حرکتِ نقد */
  netMovement: number;
  /** موجودیِ پایانی (اگر openingCash داده شده باشد) */
  closingCash: number | null;
}

export function buildCashFlow(i: CashFlowInput): CashFlow {
  const tuition = R(i.tuitionReceipts);
  const sponsorship = R(i.sponsorshipReceipts);
  const other = R(i.otherReceipts);
  const receiptsTotal = tuition + sponsorship + other;

  const teaching = R(i.teachingPayments);
  const otherPayments = R(i.otherPayments);
  const paymentsTotal = teaching + otherPayments;

  const netMovement = receiptsTotal - paymentsTotal;
  const opening = i.openingCash === undefined || i.openingCash === null ? null : R(i.openingCash);

  return {
    period: i.period,
    receipts: { tuition, sponsorship, other, total: receiptsTotal },
    payments: { teaching, other: otherPayments, total: paymentsTotal },
    netMovement,
    closingCash: opening === null ? null : opening + netMovement,
  };
}

// ══════════════════════════════════════════════════════════════════════
//  ۴) انحراف بودجه
// ══════════════════════════════════════════════════════════════════════

export type BudgetVarianceStatus = 'UNDER' | 'ON_TARGET' | 'OVER';

export interface BudgetVarianceInput {
  /** عنوان قلمِ بودجه */
  line: string;
  /** مبلغِ مصوب */
  budget: number;
  /** مبلغِ واقعی */
  actual: number;
  /**
   * جهتِ مطلوب: برای درآمد، بیشتر بهتر است (REVENUE)؛ برای هزینه، کمتر
   * بهتر است (EXPENSE).
   */
  direction?: 'REVENUE' | 'EXPENSE';
}

export interface BudgetVariance {
  line: string;
  budget: number;
  actual: number;
  /** انحرافِ مثبت یعنی بهتر از بودجه (بسته به جهت) */
  variance: number;
  /** انحرافِ درصدی */
  variancePercent: number | null;
  status: BudgetVarianceStatus;
  /** مصرفِ بودجه (درصد) */
  usagePercent: number | null;
}

export function buildBudgetVariance(i: BudgetVarianceInput): BudgetVariance {
  const budget = R(i.budget);
  const actual = R(i.actual);
  const dir = i.direction ?? 'EXPENSE';

  // انحرافِ خام = واقعی − بودجه
  const raw = actual - budget;
  // برای درآمد، انحرافِ مثبت مطلوب است؛ برای هزینه، انحرافِ منفی مطلوب.
  const signed = dir === 'REVENUE' ? raw : -raw;

  const variancePercent = budget === 0 ? null : (raw / Math.abs(budget)) * 100;
  const usagePercent = budget === 0 ? null : (actual / Math.abs(budget)) * 100;

  const EPS = 1; // یک ریال
  let status: BudgetVarianceStatus;
  if (Math.abs(raw) <= EPS) status = 'ON_TARGET';
  else if (signed > 0) status = dir === 'REVENUE' ? 'OVER' : 'UNDER';
  else status = dir === 'REVENUE' ? 'UNDER' : 'OVER';

  return { line: i.line, budget, actual, variance: signed, variancePercent, status, usagePercent };
}

// ══════════════════════════════════════════════════════════════════════
//  ۵) بهای تمام‌شده و حاشیه
// ══════════════════════════════════════════════════════════════════════

export interface CostingInput {
  period: string;
  /** درآمدِ خالصِ آموزشی */
  revenue: number;
  /** هزینهٔ مستقیم (حق‌التدریس) */
  directCost: number;
  /** هزینهٔ تخصیص‌یافته (سربار) */
  allocatedCost: number;
  /** واحدهای ارائه‌شده */
  units: number;
  /** تعداد دانشجویان */
  students: number;
}

export interface Costing {
  period: string;
  revenue: number;
  directCost: number;
  allocatedCost: number;
  /** بهای تمام‌شده = مستقیم + تخصیص‌یافته */
  totalCost: number;
  /** حاشیهٔ ناخالص */
  grossMargin: number;
  /** حاشیهٔ ناخالص (درصد) */
  grossMarginPercent: number | null;
  /** بهای هر واحد */
  costPerUnit: number | null;
  /** درآمدِ هر واحد */
  revenuePerUnit: number | null;
  /** بهای هر دانشجو */
  costPerStudent: number | null;
  units: number;
  students: number;
}

export function buildCosting(i: CostingInput): Costing {
  const revenue = R(i.revenue);
  const directCost = R(i.directCost);
  const allocatedCost = R(i.allocatedCost);
  const totalCost = directCost + allocatedCost;
  const grossMargin = revenue - totalCost;
  const units = R(i.units);
  const students = R(i.students);

  return {
    period: i.period,
    revenue,
    directCost,
    allocatedCost,
    totalCost,
    grossMargin,
    grossMarginPercent: revenue === 0 ? null : (grossMargin / revenue) * 100,
    costPerUnit: units === 0 ? null : totalCost / units,
    revenuePerUnit: units === 0 ? null : revenue / units,
    costPerStudent: students === 0 ? null : totalCost / students,
    units,
    students,
  };
}

// ══════════════════════════════════════════════════════════════════════
//  ۶) تخصیص هزینهٔ مشترک
// ══════════════════════════════════════════════════════════════════════

export interface AllocationInput {
  /** نامِ مرکز/واحدِ دریافت‌کننده */
  unit: string;
  /** سهمِ مرکز از مبنای تخصیص (واحد، دانشجو، …) */
  weight: number;
}

/** مجموع وزن‌ها باید > 0 باشد؛ در غیر این صورت همه سهم‌ها صفر می‌شوند. */
export function allocate(amount: number, items: AllocationInput[]): {
  unit: string;
  weight: number;
  share: number;
  percent: number;
}[] {
  const total = (items || []).reduce((a, x) => a + R(x.weight), 0);
  const pool = R(amount);
  return (items || []).map((x) => {
    const weight = R(x.weight);
    const share = total > 0 ? (pool * weight) / total : 0;
    return {
      unit: x.unit,
      weight,
      share,
      percent: total > 0 ? (weight / total) * 100 : 0,
    };
  });
}
