/**
 * تست واحدِ موتور خالصِ صورت‌های مالی — بدون React، بدون DB، بدون DOM.
 *
 * اجرا: npm test
 *
 * این ماژول قراردادِ حسابداری را قفل می‌کند: سود و زیان، ترازنامه،
 * نقدینگی، انحراف بودجه، بهای تمام‌شده و تخصیص.
 */
import {
  allocate,
  buildBalanceSheet,
  buildBudgetVariance,
  buildCashFlow,
  buildCosting,
  buildIncomeStatement,
} from '../src/lib/finance-reports/statements.ts';

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
};
const close = (name: string, got: number | null, want: number | null) => {
  const ok = got === null || want === null ? got === want : Math.abs(got - want) < 1e-6;
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${got}\n      want: ${want}`); }
};

console.log('۱)سود و زیان — درآمد منهای هزینه');
const is = buildIncomeStatement({
  period: '14051',
  tuitionGross: 1_000_000,
  discountTotal: 150_000,
  sponsorshipIncome: 80_000,
  otherIncome: 20_000,
  teachingCost: 600_000,
  payrollDeductions: 0,
  otherExpenses: 50_000,
});
eq('فروش خالص = ناخالص − تخفیف', is.revenue.tuitionNet, 850_000);
eq('جمع درآمد', is.revenue.total, 950_000);
eq('جمع هزینه', is.costs.total, 650_000);
eq('سود عملیاتی = درآمد − هزینه', is.operatingResult, 300_000);
eq('سود خالص = سود عملیاتی', is.netResult, 300_000);

const isLoss = buildIncomeStatement({
  period: '14052',
  tuitionGross: 100,
  discountTotal: 0,
  sponsorshipIncome: 0,
  otherIncome: 0,
  teachingCost: 500,
  payrollDeductions: 0,
  otherExpenses: 0,
});
eq('زیان: نتیجه منفی می‌شود', isLoss.operatingResult, -400);

console.log('۲)سود و زیان — ورودی نامعتبر و رشته‌ای');
const isDirty = buildIncomeStatement({
  period: 'x',
  tuitionGross: '1000' as unknown as number,
  discountTotal: NaN as unknown as number,
  sponsorshipIncome: null as unknown as number,
  otherIncome: undefined as unknown as number,
  teachingCost: '250' as unknown as number,
  payrollDeductions: 0,
  otherExpenses: 0,
});
eq('رشتهٔ عددی پذیرفته می‌شود', isDirty.revenue.tuitionGross, 1000);
eq('NaN ⇒ صفر', isDirty.revenue.discount, 0);
eq('null ⇒ صفر', isDirty.revenue.sponsorship, 0);
eq('undefined ⇒ صفر', isDirty.revenue.other, 0);
eq('هزینهٔ رشته‌ای هم پذیرفته می‌شود', isDirty.costs.teaching, 250);

console.log('۳)ترازنامه — دارایی = بدهی + حقوق');
const bs = buildBalanceSheet({
  period: '14051',
  studentReceivables: 500_000,
  studentLoansReceivable: 100_000,
  studentPayables: 40_000,
  deferredRevenue: 60_000,
  payrollPayable: 200_000,
  supplierPayable: 50_000,
  retainedSurplus: 250_000,
});
eq('جمع دارایی', bs.assets.total, 600_000);
eq('جمع بدهی', bs.liabilities.total, 350_000);
eq('جمع حقوق', bs.equity.total, 250_000);
eq('ترازنامه تراز است', bs.isBalanced, true);
eq('اختلاف تراز صفر', bs.difference, 0);

const bsUnbalanced = buildBalanceSheet({
  period: '14051',
  studentReceivables: 500_000,
  studentLoansReceivable: 0,
  studentPayables: 0,
  deferredRevenue: 0,
  payrollPayable: 0,
  supplierPayable: 0,
  retainedSurplus: 0,
});
eq('ترازنامهٔ ناتراز «نیازمند بررسی» است', bsUnbalanced.isBalanced, false);
eq('اختلاف = دارایی − بدهی − حقوق', bsUnbalanced.difference, 500_000);

console.log('۴)ترازنامه — بستانکاری و مطالبه در یک سنجه');
const bsBoth = buildBalanceSheet({
  period: 'x',
  studentReceivables: 1_000,
  studentLoansReceivable: 0,
  studentPayables: 300,
  deferredRevenue: 0,
  payrollPayable: 0,
  supplierPayable: 0,
  retainedSurplus: 700,
});
eq('تراز است', bsBoth.isBalanced, true);

console.log('۵)جریان نقدی — دریافت منهای پرداخت');
const cf = buildCashFlow({
  period: '1405-08',
  tuitionReceipts: 900,
  sponsorshipReceipts: 100,
  otherReceipts: 0,
  teachingPayments: 700,
  otherPayments: 50,
});
eq('جمع دریافت', cf.receipts.total, 1_000);
eq('جمع پرداخت', cf.payments.total, 750);
eq('خالص حرکت نقد', cf.netMovement, 250);
eq('بدون موجودی اولیه ⇒ ماندهٔ پایانی ندارد', cf.closingCash, null);

const cf2 = buildCashFlow({
  period: 'x',
  tuitionReceipts: 900,
  sponsorshipReceipts: 100,
  otherReceipts: 0,
  teachingPayments: 700,
  otherPayments: 50,
  openingCash: 3_000,
});
eq('با موجودی اولیه ⇒ ماندهٔ پایانی', cf2.closingCash, 3_250);

console.log('۶)انحراف بودجه — جهت مطلوب');
const bvExp = buildBudgetVariance({ line: 'هزینهٔ اداری', budget: 1_000, actual: 800, direction: 'EXPENSE' });
eq('هزینهٔ کمتر ⇒ UNDER', bvExp.status, 'UNDER');
eq('انحرافِ مطلوب مثبت است', bvExp.variance, 200);
close('انحراف درصدی', bvExp.variancePercent, -20);
close('مصرف بودجه (٪)', bvExp.usagePercent, 80);

const bvExpOver = buildBudgetVariance({ line: 'x', budget: 1_000, actual: 1_500, direction: 'EXPENSE' });
eq('هزینهٔ بیشتر ⇒ OVER', bvExpOver.status, 'OVER');
eq('انحرافِ مطلوب منفی است', bvExpOver.variance, -500);

const bvRev = buildBudgetVariance({ line: 'y', budget: 1_000, actual: 1_200, direction: 'REVENUE' });
eq('درآمدِ بیشتر ⇒ OVER (مطلوب)', bvRev.status, 'OVER');
eq('انحرافِ مطلوب مثبت است', bvRev.variance, 200);

const bvOn = buildBudgetVariance({ line: 'z', budget: 1_000, actual: 1_000, direction: 'EXPENSE' });
eq('مطابق بودجه', bvOn.status, 'ON_TARGET');

const bvZero = buildBudgetVariance({ line: 'w', budget: 0, actual: 500, direction: 'EXPENSE' });
eq('بودجهٔ صفر ⇒ انحراف درصدی ندارد', bvZero.variancePercent, null);
eq('بودجهٔ صفر ⇒ مصرف درصدی ندارد', bvZero.usagePercent, null);

console.log('۷)بهای تمام‌شده و حاشیه');
const co = buildCosting({
  period: '14051',
  revenue: 1_000_000,
  directCost: 400_000,
  allocatedCost: 100_000,
  units: 10_000,
  students: 500,
});
eq('بهای تمام‌شده = مستقیم + تخصیص', co.totalCost, 500_000);
eq('حاشیهٔ ناخالص', co.grossMargin, 500_000);
close('درصد حاشیه', co.grossMarginPercent, 50);
close('بهای هر واحد', co.costPerUnit, 50);
close('درآمد هر واحد', co.revenuePerUnit, 100);
close('بهای هر دانشجو', co.costPerStudent, 1_000);

const coZero = buildCosting({ period: 'x', revenue: 0, directCost: 0, allocatedCost: 0, units: 0, students: 0 });
eq('درآمد صفر ⇒ درصد حاشیه ندارد', coZero.grossMarginPercent, null);
eq('واحد صفر ⇒ بهای واحد ندارد', coZero.costPerUnit, null);

console.log('۸)تخصیص هزینهٔ مشترک');
const al = allocate(1_000, [
  { unit: 'دانشکده الف', weight: 300 },
  { unit: 'دانشکده ب', weight: 100 },
]);
eq('سهم اول', al[0].share, 750);
eq('سهم دوم', al[1].share, 250);
close('درصد اول', al[0].percent, 75);
eq('مجموع سهم‌ها = کل استخر', al.reduce((a, x) => a + x.share, 0), 1_000);

const alZero = allocate(500, [{ unit: 'الف', weight: 0 }]);
eq('وزنِ صفر ⇒ سهمِ صفر', alZero[0].share, 0);
close('درصدِ صفر', alZero[0].percent, 0);

const alNone = allocate(500, []);
eq('فهرست خالی ⇒ بدون ردیف', alNone.length, 0);

console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
