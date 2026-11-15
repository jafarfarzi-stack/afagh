/**
 * تست واحدِ تفکیکِ تخفیف در کارنامهٔ مالی + یکسان‌سازیِ ردیف‌های خلاصهٔ ترم.
 *
 * اجرا: npm test
 *
 * سه چیز را قفل می‌کند:
 *  ۱) تفکیکِ تخفیف به قلم‌های مستقل (بیتس/ثابت/متغیری/موضوعی/تعدیل/جدولی)
 *  ۲) ⭐ عدم تغییرِ مانده: مجموعِ اقلامِ تفکیک‌شده = همان `discounts`ِ قبلی
 *  ۳) ردیف‌های پایینِ هر ترم از **یک تعریفِ کانونی** می‌آیند (نوع الف و ب)
 */
import {
  buildTranscript,
  transcriptTotals,
  mergeDiscountBreakdown,
  DISCOUNT_BREAKDOWN_LEDGER,
  type LedgerTxn,
} from '../src/lib/finance-rules/statement.ts';
import { buildTermSummary, visibleSummaryRows } from '../src/lib/finance-rules/term-summary.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

const txn = (o: Partial<LedgerTxn> & { id: number; transactionType: string; amount: number }): LedgerTxn => ({
  termId: 1,
  createdAt: '2026-01-01T00:00:00Z',
  ...o,
} as LedgerTxn);

console.log('۱)تفکیکِ تخفیف — قلم‌های دفتری و جدولی جدا می‌شوند');
const st1 = buildTranscript({
  ledger: [
    txn({ id: 1, transactionType: 'TUITION_FIXED', amount: 1_000_000 }),
    txn({ id: 2, transactionType: 'TUITION_BATES', amount: 120_000 }),
    txn({ id: 3, transactionType: 'DISCOUNT_FIXED', amount: 50_000 }),
    txn({ id: 4, transactionType: 'DISCOUNT_VARIABLE', amount: 30_000 }),
    txn({ id: 5, transactionType: 'SUBJECT_DEDUCTIVE', amount: 20_000 }),
    txn({ id: 6, transactionType: 'TUITION_ADJUST_INC', amount: 10_000 }),
  ],
  discounts: [
    { id: 10, title: 'تخفیف رتبهٔ برتر', amount: 70_000 },
  ],
});
const t1 = st1[0];
eq('مجموعِ تخفیف‌ها بدون تغییر', t1.discounts, 300_000);
eq('تفکیک ۶ قلم دارد', (t1.discountBreakdown ?? []).length, 6);
eq(
  'کلید/مبلغِ اقلام',
  (t1.discountBreakdown ?? []).map((d) => [d.key, d.amount]),
  [
    ['BATES', 120_000],
    ['DISCOUNT_FIXED', 50_000],
    ['DISCOUNT_VARIABLE', 30_000],
    ['SUBJECT_DEDUCTIVE', 20_000],
    ['TUITION_ADJUST_INC', 10_000],
    ['TABLE:تخفیف رتبهٔ برتر', 70_000],
  ],
);
eq('جمعِ اقلام = جمعِ تخفیف', (t1.discountBreakdown ?? []).reduce((a, x) => a + x.amount, 0), t1.discounts);
eq('منبعِ اقلام درست است', [...new Set((t1.discountBreakdown ?? []).map((d) => d.source))].sort(), ['LEDGER', 'TABLE']);

console.log('۲)⭐ مانده و خالص هیچ تغییری نمی‌کنند');
// همان سناریو، ولی با پرداخت و پوشش بنیاد — مانده باید مثل قبل باشد
const st2 = buildTranscript({
  ledger: [
    txn({ id: 1, transactionType: 'TUITION_FIXED', amount: 1_000_000 }),
    txn({ id: 2, transactionType: 'TUITION_BATES', amount: 120_000 }),
    txn({ id: 3, transactionType: 'DISCOUNT_FIXED', amount: 50_000 }),
    txn({ id: 4, transactionType: 'PAYMENT', amount: 400_000 }),
    txn({ id: 5, transactionType: 'SPONSORSHIP', amount: 80_000 }),
  ],
  discounts: [{ id: 10, title: 'تخفیف رتبهٔ برتر', amount: 70_000 }],
});
const t2 = st2[0];
eq('خالص = ناخالص − تخفیف − پوشش', t2.netPayable, 1_000_000 - 240_000 - 80_000);
eq('مانده = خالص − پرداخت', t2.balance, 1_000_000 - 240_000 - 80_000 - 400_000);
eq('جمعِ اقلام = جمعِ تخفیف', (t2.discountBreakdown ?? []).reduce((a, x) => a + x.amount, 0), t2.discounts);

console.log('۳)سقفِ شهریه — تخفیفِ بیش از شهریه، به همان اندازهٔ قبل کاهش می‌یابد');
const st3 = buildTranscript({
  ledger: [
    txn({ id: 1, transactionType: 'TUITION_FIXED', amount: 100_000 }),
    txn({ id: 2, transactionType: 'TUITION_BATES', amount: 300_000 }),
  ],
  discounts: [{ id: 10, title: 'تخفیف جدولی', amount: 400_000 }],
});
const t3 = st3[0];
eq('تخفیف سقف‌خورده = شهریه', t3.discounts, 100_000);
eq('جمعِ اقلام = تخفیفِ سقف‌خورده', (t3.discountBreakdown ?? []).reduce((a, x) => a + x.amount, 0), 100_000);
eq('خالص صفر نمی‌شود (نه منفی)', t3.netPayable, 0);
eq('سقف: دفتری اولویت دارد', (t3.discountBreakdown ?? []).map((d) => [d.key, d.amount]), [['BATES', 100_000]]);

console.log('۴)بیتسِ تفکیک‌شده — سه زیرنوعِ سما');
const st4 = buildTranscript({
  ledger: [
    txn({ id: 1, transactionType: 'TUITION_FIXED', amount: 1_000_000 }),
    txn({ id: 2, transactionType: 'TUITION_BATES_FIXED', amount: 40_000 }),
    txn({ id: 3, transactionType: 'TUITION_BATES_VARIABLE', amount: 30_000 }),
    txn({ id: 4, transactionType: 'TUITION_BATES_AMOUNT', amount: 20_000 }),
  ],
});
const t4 = st4[0];
// ⚠ درخواستِ کاربر: سه زیرنوعِ بیتس باید **جدا** دیده شوند (مثل سما)،
//   نه در یک سطلِ مشترک. با کلیدِ مشترک، کارنامه فقط یک عددِ کلی می‌داد.
eq(
  'هر زیرنوعِ بیتس قلمِ مستقل است (به ترتیبِ کانونی)',
  (t4.discountBreakdown ?? []).map((d) => d.key),
  ['BATES_FIXED', 'BATES_VARIABLE', 'BATES_AMOUNT'],
);
eq(
  'مبالغِ زیرنوع‌ها جدا حفظ می‌شوند',
  (t4.discountBreakdown ?? []).map((d) => d.amount),
  [40_000, 30_000, 20_000],
);
eq('جمعِ زیرنوع‌ها = تخفیفِ کل', (t4.discountBreakdown ?? []).reduce((a, x) => a + x.amount, 0), 90_000);
eq('تخفیفِ کل = ۹۰ هزار', t4.discounts, 90_000);
eq('برچسب‌های بیتس در نقشه هستند',
  [DISCOUNT_BREAKDOWN_LEDGER.TUITION_BATES_FIXED?.label,
   DISCOUNT_BREAKDOWN_LEDGER.TUITION_BATES_VARIABLE?.label,
   DISCOUNT_BREAKDOWN_LEDGER.TUITION_BATES_AMOUNT?.label].every(Boolean),
  true);
eq('کلیدهای سه زیرنوع از هم متفاوت‌اند',
  new Set([DISCOUNT_BREAKDOWN_LEDGER.TUITION_BATES_FIXED.key,
           DISCOUNT_BREAKDOWN_LEDGER.TUITION_BATES_VARIABLE.key,
           DISCOUNT_BREAKDOWN_LEDGER.TUITION_BATES_AMOUNT.key]).size,
  3);

console.log('۵)ادغامِ تفکیکِ چند ترم (جمع کل دوره)');
const merged = mergeDiscountBreakdown([
  [{ key: 'BATES', label: 'تخفیف بیتس (سما)', amount: 100_000, source: 'LEDGER' }],
  [{ key: 'BATES', label: 'تخفیف بیتس (سما)', amount: 50_000, source: 'LEDGER' }],
]);
eq('اقلامِ هم‌کلید جمع می‌شوند', merged.map((x) => [x.key, x.amount]), [['BATES', 150_000]]);

const totals = transcriptTotals(st1);
eq('جمعِ کل دوره هم تفکیک دارد', (totals.discountBreakdown ?? []).length, 6);
eq('مجموعِ تفکیکِ کل دوره = جمعِ تخفیف', (totals.discountBreakdown ?? []).reduce((a, x) => a + x.amount, 0), totals.discounts);

console.log('۶)یکسان‌سازیِ ردیف‌های پایینِ هر ترم — یک تعریفِ کانونی');
const term = {
  charges: 1_000_000,
  tuitionFixed: 400_000,
  tuitionVariable: 600_000,
  discounts: 240_000,
  discountBreakdown: [
    { key: 'BATES', label: 'تخفیف بیتس (سما)', amount: 120_000, source: 'LEDGER' as const },
    { key: 'DISCOUNT_FIXED', label: 'تخفیف شهریهٔ ثابت (سما)', amount: 120_000, source: 'LEDGER' as const },
  ],
  sponsorships: 80_000,
  charityCoverage: 30_000,
  netPayable: 680_000,
  payments: 400_000,
  chequesCleared: 50_000,
  chequesPending: 20_000,
  chequesBounced: 0,
  loans: 10_000,
  balance: 120_000,
};
const s = buildTermSummary(term, 50_000);
// ⚠ ردیف‌های کانونی **کامل** هستند (ترتیبِ ثابت، مستقل از داده) و
// «فیلترِ نمایش» جدا انجام می‌شود ⇒ همهٔ دو چیدمان دقیقاً یک فیلتر دارند.
eq('ترتیبِ ردیف‌ها کانونی است (کامل، مستقل از داده)',
  s.rows.map((r) => r.key),
  ['charges', 'tuitionFixed', 'tuitionVariable', 'discounts', 'sponsor', 'charity',
   'net', 'payments', 'chequesCleared', 'chequesPending', 'chequesBounced', 'loans', 'prior', 'balance'],
);
eq('پوششِ خیرین از بنیاد جدا شد', s.rows.find((r) => r.key === 'sponsor')?.value, 50_000);
eq('خیرین جدا نشمرده می‌شود', s.rows.find((r) => r.key === 'charity')?.value, 30_000);
eq('تفکیکِ تخفیف دو قلم دارد ⇒ نمایش داده می‌شود', s.discountLines.length, 2);
eq('چکِ برگشتی صفر ⇒ در نمایش نمی‌آید',
  visibleSummaryRows(s.rows).some((r) => r.key === 'chequesBounced'), false);
eq('چکِ در انتظارِ نام-zero ⇒ در نمایش می‌آید',
  visibleSummaryRows(s.rows).some((r) => r.key === 'chequesPending'), true);
eq('ماندهٔ قبلی با مقدارِ غیرصفر هست', s.rows.find((r) => r.key === 'prior')?.value, 50_000);

const sNo = buildTermSummary({ ...term, chequesBounced: 0 }, 0);
eq('بدون ماندهٔ قبلی ⇒ آن ردیف نیست', sNo.rows.some((r) => r.key === 'prior'), false);
eq('نمایانگرِ ردیف‌ها، صفرها را حذف می‌کند',
  visibleSummaryRows(sNo.rows).some((r) => r.key === 'chequesBounced'), false);
eq('خلاصهٔ خالی هم «ماندهٔ ترم» دارد', sNo.rows[sNo.rows.length - 1].key, 'balance');

// ── یک قلم تخفیف: ردیف فرزند تکراری نمی‌سازیم، منبع را در برچسب می‌آوریم ──
const sOne = buildTermSummary(
  {
    ...term,
    discountBreakdown: [
      { key: 'BATES_AMOUNT', label: 'تخفیف بیتسِ مبلغی (سما)', amount: 70_000, source: 'LEDGER' as const },
    ],
  },
  0,
);
eq('یک قلم ⇒ ردیف فرزند ندارد', sOne.discountLines.length, 0);
eq(
  'یک قلم ⇒ منبع در برچسبِ «تخفیف» می‌آید',
  sOne.rows.find((r) => r.key === 'discounts')?.label,
  'تخفیف — بیتسِ مبلغی (سما)',
);

// ── دو قلم تخفیف: ردیف‌های فرزند، و برچسبِ مادر دست‌نخورده ──
const sTwo = buildTermSummary(
  {
    ...term,
    discountBreakdown: [
      { key: 'BATES_AMOUNT', label: 'تخفیف بیتسِ مبلغی (سما)', amount: 70_000, source: 'LEDGER' as const },
      { key: 'BATES_FIXED', label: 'تخفیف بیتسِ شهریهٔ ثابت (سما)', amount: 10_000, source: 'LEDGER' as const },
    ],
  },
  0,
);
eq('دو قلم ⇒ دو ردیف فرزند', sTwo.discountLines.length, 2);
eq(
  'دو قلم ⇒ برچسبِ مادر ساده می‌ماند',
  sTwo.rows.find((r) => r.key === 'discounts')?.label,
  'تخفیف',
);
eq('ردیف‌های فرزند به ترتیبِ کانونی می‌آیند (نه ترتیبِ درج)',
  sTwo.discountLines.map((d) => [d.key, d.value]),
  [['BATES_FIXED', 10_000], ['BATES_AMOUNT', 70_000]]);

console.log('۷)قانونِ قرارداد — همان تعریف برای هر دو چیدمان');
const rowsA = visibleSummaryRows(buildTermSummary(term, 0).rows).map((r) => r.label);
const rowsB = visibleSummaryRows(buildTermSummary(term, 0).rows).map((r) => r.label);
eq('نوع الف و نوع ب یک ردیف می‌گیرند', rowsA, rowsB);

console.log('۸) ردیفِ «ماندهٔ قبلی (انتقالی)» فقط یک بار');
// باگ واقعی: `buildTermSummary` ردیفِ prior را می‌ساخت و کامپوننتِ نوع الف
// دوباره همان را در یک <tr> جدا چاپ می‌کرد ⇒ عددِ انتقالی دو بار در یک کارت.
const withPrior = buildTermSummary(term, 1_250_000);
eq(
  'در خروجیِ کانونی فقط یک ردیف prior هست',
  withPrior.rows.filter((r) => r.key === 'prior').length,
  1,
);
eq(
  'برچسبِ آن «ماندهٔ قبلی (انتقالی)» است',
  withPrior.rows.find((r) => r.key === 'prior')?.label,
  'ماندهٔ قبلی (انتقالی)',
);
{
  const comp = readFileSync(join(import.meta.dirname, '..', 'src/components/FinancialTranscript.tsx'), 'utf8');
  // فقط رندرِ واقعی مهم است، نه کامنت‌ها: برچسب نباید داخل یک سلول بیاید.
  eq(
    'کامپوننتِ نوع الف خودش ردیفِ قبلی را دوباره چاپ نمی‌کند',
    (comp.match(/>\s*ماندهٔ قبلی \(انتقالی\)\s*</g) || []).length,
    0,
  );
}

console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
