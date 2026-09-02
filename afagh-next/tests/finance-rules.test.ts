/**
 * تست منطق امور مالی دانشجویان — مستقیماً روی کد واقعی اجرا می‌شود:
 *     npm test
 *
 * چون src/lib/finance-rules.ts هیچ وابستگی به دیتابیس یا Next ندارد،
 * بدون نیاز به PostgreSQL قابل اجراست.
 */
import {
  applyDiscounts,
  applySponsorships,
  bucketCourseUnits,
  buildChequeReminderText,
  buildTranscript,
  chequeNeedsReminder,
  discountAmount,
  effectivePercent,
  formulaMatches,
  pickFormula,
  toRial,
  totalBuckets,
  transcriptTotals,
  tuitionFromFormula
} from '../src/lib/finance-rules.ts';

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; } else { fail++; console.error(`✗ ${name}\n    انتظار: ${JSON.stringify(want)}\n    دریافت: ${JSON.stringify(got)}`); }
};
const section = (t: string) => console.log(`\n── ${t}`);

// ── ۱. تخفیف درصدی ───────────────────────────────────────────
section('تخفیف درصدی');
eq('۲۰٪ از کل شهریه', discountAmount(
  { id: 1, kind: 'PERCENT', percent: 20, amount: 0, appliesTo: 'BOTH' }, 1_000_000, 3_000_000
), 800_000);
eq('۲۰٪ فقط از شهریهٔ ثابت', discountAmount(
  { id: 1, kind: 'PERCENT', percent: 20, amount: 0, appliesTo: 'FIXED' }, 1_000_000, 3_000_000
), 200_000);
eq('۲۰٪ فقط از شهریهٔ متغیر', discountAmount(
  { id: 1, kind: 'PERCENT', percent: 20, amount: 0, appliesTo: 'VARIABLE' }, 1_000_000, 3_000_000
), 600_000);
eq('سقف نوع تخفیف درصد را محدود می‌کند', effectivePercent(
  { id: 1, kind: 'PERCENT', percent: 80, amount: 0, appliesTo: 'BOTH', maxPercent: 30 }
), 30);
eq('بدون سقف، درصد کامل مجاز است', effectivePercent(
  { id: 1, kind: 'PERCENT', percent: 80, amount: 0, appliesTo: 'BOTH', maxPercent: null }
), 80);
eq('درصد منفی به صفر می‌چسبد', effectivePercent(
  { id: 1, kind: 'PERCENT', percent: -15, amount: 0, appliesTo: 'BOTH' }
), 0);

// ── ۲. زنجیرهٔ تخفیف و سقف کل ────────────────────────────────
section('زنجیرهٔ تخفیف');
{
  const out = applyDiscounts([
    { id: 1, kind: 'PERCENT', percent: 50, amount: 0, appliesTo: 'BOTH' },
    { id: 2, kind: 'PERCENT', percent: 80, amount: 0, appliesTo: 'BOTH' }
  ], 1_000_000, 1_000_000);
  eq('جمع تخفیف هرگز از کل شهریه بیشتر نمی‌شود', out.total, 2_000_000);
  eq('خالص صفر می‌شود', out.net, 0);
  eq('تخفیف دوم به اندازهٔ باقی‌مانده کوتاه می‌شود', out.applied[1].amount, 1_000_000);
}
{
  const out = applyDiscounts([
    { id: 1, kind: 'FIXED', percent: 0, amount: 500_000, appliesTo: 'BOTH' }
  ], 1_000_000, 0);
  eq('تخفیف مبلغی', out.total, 500_000);
  eq('خالص پس از تخفیف مبلغی', out.net, 500_000);
}
{
  const out = applyDiscounts([
    { id: 1, kind: 'FIXED', percent: 0, amount: 9_000_000, appliesTo: 'BOTH' }
  ], 1_000_000, 1_000_000);
  eq('تخفیف مبلغی بیش از شهریه، به کل شهریه محدود می‌شود', out.total, 2_000_000);
  eq('خالص هرگز منفی نمی‌شود', out.net, 0);
}
eq('فهرست خالی = بدون تخفیف', applyDiscounts([], 1000, 2000).total, 0);

// ── ۳. پوشش بنیادها ──────────────────────────────────────────
section('پوشش بنیادها');
{
  const out = applySponsorships([
    { id: 1, coverageKind: 'PERCENT', percent: 50, amount: 0, title: 'کمیتهٔ امداد' }
  ], 2_000_000);
  eq('۵۰٪ پوشش بنیاد', out.total, 1_000_000);
  eq('سهم دانشجو پس از پوشش', out.studentShare, 1_000_000);
  eq('عنوان بنیاد در کارنامه می‌آید', out.applied[0].title, 'کمیتهٔ امداد');
}
{
  const out = applySponsorships([
    { id: 1, coverageKind: 'PERCENT', percent: 100, amount: 0 },
    { id: 2, coverageKind: 'PERCENT', percent: 100, amount: 0 }
  ], 2_000_000);
  eq('دو بنیاد روی هم از خالص بیشتر نمی‌شوند', out.total, 2_000_000);
  eq('سهم دانشجو صفر', out.studentShare, 0);
  eq('بنیاد دوم چیزی نمی‌پردازد', out.applied[1].amount, 0);
}
{
  const out = applySponsorships([
    { id: 1, coverageKind: 'FIXED', percent: 0, amount: 700_000 }
  ], 500_000);
  eq('پوشش مبلغی بیش از خالص، محدود می‌شود', out.total, 500_000);
}
eq('پوشش روی خالص منفی صفر است', applySponsorships(
  [{ id: 1, coverageKind: 'PERCENT', percent: 50, amount: 0 }], -100
).total, 0);

// ── ۴. ترتیب قانونی: تخفیف پیش از بنیاد ──────────────────────
section('ترتیب اعمال');
{
  const gross = 1_000_000;
  const disc = applyDiscounts([{ id: 1, kind: 'PERCENT', percent: 50, amount: 0, appliesTo: 'BOTH' }], gross, 0);
  const spon = applySponsorships([{ id: 1, coverageKind: 'PERCENT', percent: 50, amount: 0 }], disc.net);
  eq('خالص پس از تخفیف', disc.net, 500_000);
  eq('پوشش بنیاد روی خالص نه ناخالص', spon.total, 250_000);
  eq('سهم نهایی دانشجو', spon.studentShare, 250_000);
}

// ── ۵. فرمول تخصیص ───────────────────────────────────────────
section('فرمول تخصیص');
const baseFormula = {
  id: 1, degreeLevelId: null, majorId: null, entryYearFrom: null, entryYearTo: null,
  fixedAmount: 0, perUnitTheory: 100_000, perUnitPractical: 200_000, perUnitGeneral: 50_000,
  priority: 100, isActive: 1
};
eq('فرمول فعال بدون محدودیت با همه می‌خواند', formulaMatches(baseFormula,
  { degreeLevelId: 2, majorId: 5, entryYear: 1403 }), true);
eq('فرمول غیرفعال انتخاب نمی‌شود', formulaMatches({ ...baseFormula, isActive: 0 },
  { degreeLevelId: 2, majorId: 5, entryYear: 1403 }), false);
eq('فرمول محدود به مقطع، مقطع دیگر را رد می‌کند', formulaMatches({ ...baseFormula, degreeLevelId: 2 },
  { degreeLevelId: 3, majorId: 5, entryYear: 1403 }), false);
eq('ورودی پیش از بازه رد می‌شود', formulaMatches({ ...baseFormula, entryYearFrom: 1400 },
  { degreeLevelId: 2, majorId: 5, entryYear: 1399 }), false);
eq('ورودی درون بازه پذیرفته می‌شود', formulaMatches({ ...baseFormula, entryYearFrom: 1400, entryYearTo: 1405 },
  { degreeLevelId: 2, majorId: 5, entryYear: 1403 }), true);
eq('ورودی پس از بازه رد می‌شود', formulaMatches({ ...baseFormula, entryYearTo: 1405 },
  { degreeLevelId: 2, majorId: 5, entryYear: 1406 }), false);
eq('ورودی نامعلوم با بازهٔ ورودی نمی‌خواند', formulaMatches({ ...baseFormula, entryYearFrom: 1400 },
  { degreeLevelId: 2, majorId: 5, entryYear: null }), false);

{
  const formulas = [
    { ...baseFormula, id: 1, priority: 100 },
    { ...baseFormula, id: 2, priority: 10 },
    { ...baseFormula, id: 3, priority: 50 }
  ];
  eq('اولویت کوچک‌تر برنده است', pickFormula(formulas, { degreeLevelId: 2, majorId: 5, entryYear: 1403 })?.id, 2);
}
{
  const formulas = [
    { ...baseFormula, id: 7, priority: 10 },
    { ...baseFormula, id: 4, priority: 10 }
  ];
  eq('اولویت برابر → شناسهٔ کوچک‌تر (مستقل از ترتیب دیتابیس)',
    pickFormula(formulas, { degreeLevelId: 2, majorId: 5, entryYear: 1403 })?.id, 4);
}
eq('بدون فرمول سازگار → null', pickFormula(
  [{ ...baseFormula, degreeLevelId: 9 }], { degreeLevelId: 2, majorId: 5, entryYear: 1403 }), null);

// ── ۶. تفکیک واحدها و شهریهٔ فرمول ───────────────────────────
section('واحدها و شهریهٔ فرمول');
eq('درس ۲ نظری + ۱ عملی', bucketCourseUnits(
  { units: 3, theoreticalUnits: 2, practicalUnits: 1, courseType: 'SPECIALIZED' }),
  { theory: 2, practical: 1, general: 0 });
eq('درس عمومی تمام واحدهایش در سطل عمومی', bucketCourseUnits(
  { units: 2, theoreticalUnits: 2, practicalUnits: 0, courseType: 'GENERAL' }),
  { theory: 0, practical: 0, general: 2 });
eq('باقی‌ماندهٔ بی‌سطل در نظری می‌نشیند', bucketCourseUnits(
  { units: 3, theoreticalUnits: 1, practicalUnits: 0, courseType: null }),
  { theory: 3, practical: 0, general: 0 });
eq('عملی هیچ‌گاه از کل واحدها بیشتر نمی‌شود', bucketCourseUnits(
  { units: 2, theoreticalUnits: 0, practicalUnits: 9, courseType: null }),
  { theory: 0, practical: 2, general: 0 });
eq('جمع سطل‌ها', totalBuckets([
  { theory: 2, practical: 1, general: 0 },
  { theory: 0, practical: 0, general: 2 }
]), { theory: 2, practical: 1, general: 2 });
{
  const t = tuitionFromFormula(
    { fixedAmount: 1_000_000, perUnitTheory: 100_000, perUnitPractical: 200_000, perUnitGeneral: 50_000 },
    { theory: 10, practical: 3, general: 4 }
  );
  eq('ثابت فرمول', t.fixed, 1_000_000);
  eq('متغیر فرمول = ۱۰×۱۰۰هزار + ۳×۲۰۰هزار + ۴×۵۰هزار', t.variable, 1_800_000);
  eq('جمع فرمول', t.total, 2_800_000);
}
eq('گرد کردن به ریال کسری را حذف می‌کند', toRial(1234.6), 1235);

// ── ۷. کارنامهٔ مالی ترم‌به‌ترم ──────────────────────────────
section('کارنامهٔ مالی');
{
  const st = buildTranscript({
    ledger: [
      { id: 1, termId: 1, transactionType: 'TUITION_CHARGE', amount: 5_000_000, description: 'شهریهٔ ترم', createdAt: '2026-01-01' },
      { id: 2, termId: 1, transactionType: 'PAYMENT', amount: 2_000_000, description: 'پرداخت نقدی', createdAt: '2026-01-10' },
      { id: 3, termId: 2, transactionType: 'TUITION_CHARGE', amount: 4_000_000, description: 'شهریهٔ ترم', createdAt: '2026-06-01' }
    ],
    cheques: [
      { id: 9, termId: 2, chequeNo: '123456', bankName: 'ملت', amount: 1_500_000, dueDate: '2026-07-01', status: 'PENDING' }
    ],
    loans: [
      { id: 8, termId: 2, amount: 500_000, lender: 'صندوق رفاه', status: 'ACTIVE' }
    ],
    termTitles: { '1': 'نیمسال اول ۱۴۰۴-۱۴۰۵', '2': 'نیمسال دوم ۱۴۰۴-۱۴۰۵' }
  });

  eq('دو ترم در کارنامه', st.length, 2);
  eq('عنوان ترم از نگاشت می‌آید', st[0].termTitle, 'نیمسال اول ۱۴۰۴-۱۴۰۵');
  eq('بدهی ترم ۱', st[0].charges, 5_000_000);
  eq('پرداخت ترم ۱', st[0].payments, 2_000_000);
  eq('ماندهٔ ترم ۱', st[0].balance, 3_000_000);
  eq('رویدادهای ترم ۱', st[0].events.length, 2);

  eq('چک در انتظار پرداخت شمرده نمی‌شود', st[1].chequesPending, 1_500_000);
  eq('چک در انتظار در مانده اثر ندارد', st[1].chequesCleared, 0);
  eq('وام فعال مانده را کم می‌کند', st[1].loans, 500_000);
  eq('ماندهٔ ترم ۲ = ۴میلیون − ۵۰۰هزار وام', st[1].balance, 3_500_000);
}
{
  const st = buildTranscript({
    ledger: [{ id: 1, termId: null, transactionType: 'CHARGE', amount: 300_000, description: 'جریمه' }],
    termTitles: {}
  });
  eq('تراکنش بدون ترم گم نمی‌شود', st.length, 1);
  eq('سطر «بدون ترم»', st[0].termTitle, 'بدون ترم');
  eq('مبلغ سطر بدون ترم', st[0].charges, 300_000);
}
{
  const st = buildTranscript({
    ledger: [{ id: 1, termId: 1, transactionType: 'TUITION_CHARGE', amount: 2_000_000, createdAt: '2026-01-01' }],
    discounts: [{ id: 5, title: 'رتبهٔ برتر', amount: 400_000 }],
    sponsorships: [{ id: 6, title: 'بنیاد شهید', amount: 600_000 }],
    termTitles: { '1': 'ترم ۱' }
  });
  eq('تخفیف در کارنامه', st[0].discounts, 400_000);
  eq('پوشش بنیاد در کارنامه', st[0].sponsorships, 600_000);
  eq('ماندهٔ قابل پرداخت پس از تخفیف و بنیاد', st[0].balance, 1_000_000);
  eq('رویداد تخفیف ثبت می‌شود', st[0].events.some((e) => e.kind === 'DISCOUNT'), true);
  eq('رویداد پوشش بنیاد ثبت می‌شود', st[0].events.some((e) => e.kind === 'SPONSOR'), true);
}
{
  const st = buildTranscript({
    ledger: [],
    cheques: [
      { id: 1, termId: 1, amount: 100, status: 'CLEARED', dueDate: '2026-01-01' },
      { id: 2, termId: 1, amount: 200, status: 'BOUNCED', dueDate: '2026-02-01' },
      { id: 3, termId: 1, amount: 300, status: 'CANCELLED', dueDate: '2026-03-01' }
    ],
    termTitles: {}
  });
  eq('چک وصول‌شده شمرده می‌شود', st[0].chequesCleared, 100);
  eq('چک برگشتی جدا ثبت می‌شود', st[0].chequesBounced, 200);
  eq('چک باطل‌شده در هیچ جمع پولی نمی‌آید', st[0].chequesPending, 0);
}
{
  const st = buildTranscript({
    ledger: [
      { id: 1, termId: 1, transactionType: 'TUITION_CHARGE', amount: 1_000_000, createdAt: '2026-01-01' },
      { id: 2, termId: 2, transactionType: 'TUITION_CHARGE', amount: 2_000_000, createdAt: '2026-06-01' }
    ],
    termTitles: {}
  });
  const tot = transcriptTotals(st);
  eq('جمع کل بدهی', tot.charges, 3_000_000);
  eq('ماندهٔ کل', tot.balance, 3_000_000);
}
eq('کارنامهٔ دانشجو بدون تراکنش خالی است', buildTranscript({ ledger: [] }).length, 0);

// ── ۸. یادآوری چک پیش از سررسید ──────────────────────────────
section('یادآوری چک');
{
  const now = Date.parse('2026-03-01T00:00:00Z');
  const pending = (due: string, remindedAt: string | null = null) =>
    ({ id: 1, chequeNo: '111', amount: 500_000, dueDate: due, status: 'PENDING', remindedAt });

  eq('چک ۵ روز پس از امروز با افق ۷ روز یادآوری می‌شود',
    chequeNeedsReminder(pending('2026-03-06T00:00:00Z'), now, 7).remind, true);
  eq('روزهای باقی‌مانده درست است',
    chequeNeedsReminder(pending('2026-03-06T00:00:00Z'), now, 7).daysLeft, 5);
  eq('چک ۱۰ روز پس از امروز یادآوری نمی‌شود',
    chequeNeedsReminder(pending('2026-03-11T00:00:00Z'), now, 7).remind, false);
  eq('چک گذشته از سررسید یادآوری می‌شود',
    chequeNeedsReminder(pending('2026-02-20T00:00:00Z'), now, 7).remind, true);
  eq('چک گذشته از سررسید علامت overdue می‌گیرد',
    chequeNeedsReminder(pending('2026-02-20T00:00:00Z'), now, 7).overdue, true);
  eq('چک یادآوری‌شده دوباره یادآوری نمی‌شود',
    chequeNeedsReminder(pending('2026-03-06T00:00:00Z', '2026-02-25T00:00:00Z'), now, 7).remind, false);
  eq('چک وصول‌شده یادآوری نمی‌خواهد',
    chequeNeedsReminder({ ...pending('2026-03-06T00:00:00Z'), status: 'CLEARED' }, now, 7).remind, false);
  eq('چک برگشتی یادآوری نمی‌خواهد',
    chequeNeedsReminder({ ...pending('2026-03-06T00:00:00Z'), status: 'BOUNCED' }, now, 7).remind, false);
  eq('چک بدون سررسید یادآوری نمی‌شود',
    chequeNeedsReminder({ ...pending('2026-03-06T00:00:00Z'), dueDate: null }, now, 7).remind, false);
  eq('سررسید امروز یادآوری می‌شود',
    chequeNeedsReminder(pending('2026-03-01T00:00:00Z'), now, 7).remind, true);
}
eq('متن یادآوری شامل مبلغ و شمارهٔ چک است',
  buildChequeReminderText({ chequeNo: '۱۲۳', amount: 500_000, bankName: 'ملت' }, 5, false).includes('۱۲۳'), true);
eq('متن چک گذشته از سررسید متفاوت است',
  buildChequeReminderText({ chequeNo: '۱', amount: 100 }, -3, true).includes('گذشته'), true);
eq('متن چک آینده از سررسید می‌گوید',
  buildChequeReminderText({ chequeNo: '۱', amount: 100 }, 5, false).includes('سررسید'), true);

console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
