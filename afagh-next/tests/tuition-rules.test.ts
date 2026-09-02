/**
 * تست موتور انتخاب قاعدهٔ شهریه — مستقیماً روی کد واقعی اجرا می‌شود:
 *     npm test
 *
 * چون src/lib/tuition-rules.ts هیچ وابستگی به دیتابیس یا Next ندارد، بدون
 * نیاز به PostgreSQL قابل اجراست.
 */
import { mapLegacyFeeRules, normalizeEquivFixedMode, pickFeeRule, shouldChargeFixed, termTypeOf, toNum } from '../src/lib/tuition-rules.ts';

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
};

// قواعد نمونه (مقطع ۱ = کارشناسی):
//  A(1): عمومی، بدون کلید              → ثابت ۱۰۰۰، هر واحد ۱۰۰
//  B(2): نوع ترم NORMAL                → ثابت ۲۰۰۰
//  C(3): نوع ترم EQUIVALENCE           → ثابت ۵۰۰۰
//  D(4): نوع ترم NORMAL + درس TRANSFER → هر واحد ۹۰۰ (نرخ معادل‌سازی)
//  E(5): مقطع ۱ + نوع ترم EQUIVALENCE  → ثابت ۷۰۰۰
const rules = [
  { id: 1, degreeLevelId: null, termType: null,          offeringType: null,       fixedTuition: '1000', perUnitTuition: '100', effectiveFromYear: null },
  { id: 2, degreeLevelId: null, termType: 'NORMAL',      offeringType: null,       fixedTuition: '2000', perUnitTuition: '0',   effectiveFromYear: null },
  { id: 3, degreeLevelId: null, termType: 'EQUIVALENCE', offeringType: null,       fixedTuition: '5000', perUnitTuition: '0',   effectiveFromYear: null },
  { id: 4, degreeLevelId: null, termType: 'NORMAL',      offeringType: 'TRANSFER', fixedTuition: '0',    perUnitTuition: '900', effectiveFromYear: null },
  { id: 5, degreeLevelId: 1,    termType: 'EQUIVALENCE', offeringType: null,       fixedTuition: '7000', perUnitTuition: '0',   effectiveFromYear: null },
];

console.log('\n۱) شهریهٔ ثابت فقط از قواعد سطح ترم می‌آید (نه قاعدهٔ مخصوص نوع درس)');
eq('بدون termLevelOnly قاعدهٔ مقید به TRANSFER برنده می‌شد (ریشهٔ باگ)',
  pickFeeRule(rules, { degreeLevelId: 1, termType: 'NORMAL', offeringType: null })?.id, 4);
const fixed = pickFeeRule(rules, { degreeLevelId: 1, termType: 'NORMAL', termLevelOnly: true });
eq('با termLevelOnly قاعدهٔ سطح ترم (B) برنده است', fixed?.id, 2);
eq('شهریهٔ ثابت ترم عادی = ۲۰۰۰', fixed?.fixedTuition, 2000);

console.log('\n۲) شهریهٔ ثابت ترم معادل‌سازی از قاعدهٔ سطح ترمِ همان نوع می‌آید');
const eqFixed = pickFeeRule(rules, { degreeLevelId: 1, termType: 'EQUIVALENCE', termLevelOnly: true });
eq('قاعدهٔ E (مقطع + نوع ترم) برنده است', eqFixed?.id, 5);
eq('شهریهٔ ثابت معادل‌سازی = ۷۰۰۰', eqFixed?.fixedTuition, 7000);

console.log('\n۳) شهریهٔ متغیر بر اساس نوع گذراندن درس');
eq('درس TRANSFER → قاعدهٔ D', pickFeeRule(rules, { degreeLevelId: 1, termType: 'NORMAL', offeringType: 'TRANSFER' })?.id, 4);
eq('نرخ هر واحد معادل‌سازی = ۹۰۰', pickFeeRule(rules, { degreeLevelId: 1, termType: 'NORMAL', offeringType: 'TRANSFER' })?.perUnitTuition, 900);
eq('درس NORMAL → قاعدهٔ D تطبیق نمی‌خورد، B می‌آید', pickFeeRule(rules, { degreeLevelId: 1, termType: 'NORMAL', offeringType: 'NORMAL' })?.id, 2);
eq('ترم تابستان → نرخ عمومی ۱۰۰', pickFeeRule(rules, { degreeLevelId: 1, termType: 'SUMMER', offeringType: 'NORMAL' })?.perUnitTuition, 100);

console.log('\n۴) اولویت خاص‌بودن و شکنندهٔ تساوی');
eq('مقطع‌دار بر بدون‌مقطع مقدم است', pickFeeRule(rules, { degreeLevelId: 1, termType: 'EQUIVALENCE', termLevelOnly: true })?.id, 5);
eq('برای مقطع دیگر (۲) قاعدهٔ مقطع‌دار تطبیق نمی‌خورد', pickFeeRule(rules, { degreeLevelId: 2, termType: 'EQUIVALENCE', termLevelOnly: true })?.id, 3);
const ties = [
  { id: 10, degreeLevelId: null, termType: null, offeringType: null, fixedTuition: '1', perUnitTuition: '0', effectiveFromYear: 1400 },
  { id: 11, degreeLevelId: null, termType: null, offeringType: null, fixedTuition: '2', perUnitTuition: '0', effectiveFromYear: 1403 },
];
eq('ورودی جدیدتر برنده است', pickFeeRule(ties, { degreeLevelId: null, termType: 'NORMAL', entryYear: 1404 })?.id, 11);
eq('قاعدهٔ مؤثر در آینده کنار گذاشته می‌شود', pickFeeRule(ties, { degreeLevelId: null, termType: 'NORMAL', entryYear: 1401 })?.id, 10);

console.log('\n۵) رفتارهای لبه‌ای');
eq('بدون قاعدهٔ منطبق → null', pickFeeRule([], { degreeLevelId: 1, termType: 'NORMAL' }), null);
eq('toNum رشتهٔ عددی را عدد می‌کند', toNum('1250'), 1250);
eq('toNum برای مقدار نامعتبر صفر می‌دهد', toNum('abc'), 0);
eq('toNum برای null صفر می‌دهد', toNum(null), 0);

console.log('\n۶) تشخیص نوع ترم (termTypeOf) — از جمله ترم‌های معادل‌سازی قدیمی');
// ترم معادل‌سازی که پیش از افزودن ستون termType ساخته شده و NORMAL پیش‌فرض خورده است
eq('ترمیم: 00EQ1 با termType=NORMAL هم معادل‌سازی شناخته می‌شود',
  termTypeOf({ termType: 'NORMAL', termCode: '00EQ1' }), 'EQUIVALENCE');
eq('پیشوند با فاصله/حروف بزرگ هم تشخیص داده می‌شود',
  termTypeOf({ termType: null, termCode: ' 00eq7 ' }), 'EQUIVALENCE');
eq('پیشوند 00EQ بر ستون termType مقدم است (دادهٔ قدیمی NORMAL دارد)',
  termTypeOf({ termType: 'NORMAL', termCode: '00EQ9' }), 'EQUIVALENCE');
eq('ترم عادیِ دارای termType صریح دست‌نخورده می‌ماند',
  termTypeOf({ termType: 'NORMAL', termCode: '1404-1' }), 'NORMAL');
eq('ترم عادی بدون پیشوند → NORMAL', termTypeOf({ termType: null, termCode: '1404-1' }), 'NORMAL');
eq('پرچم isSummer → SUMMER', termTypeOf({ termType: null, termCode: '1404-3', isSummer: 1 }), 'SUMMER');
eq('ترتیب: termType صریح بر isSummer مقدم است', termTypeOf({ termType: 'EQUIVALENCE', isSummer: 1 }), 'EQUIVALENCE');

console.log('\n۷) اثر عملی ترمیم: شهریهٔ ثابت ترم قدیمی معادل‌سازی');
const legacyTermType = termTypeOf({ termType: 'NORMAL', termCode: '00EQ2' });
const legacyRule = pickFeeRule(rules, { degreeLevelId: 1, termType: legacyTermType, termLevelOnly: true });
eq('ترمیم‌شده به قاعدهٔ معادل‌سازی می‌رسد (id 5، ثابت ۷۰۰۰) نه قاعدهٔ ترم عادی', legacyRule?.id, 5);
eq('شهریهٔ ثابت صحیح است', legacyRule?.fixedTuition, 7000);

console.log('\n۸) پل: قواعد مالی قدیمی → قواعد موتور جدید');
const legacy = [
  // دو ترم عادیِ هم‌مقطع از دو سال متفاوت → باید در یک قاعده جمع شوند (آخرین ترم برنده)
  { degreeLevelId: 1, termType: 'NORMAL' as const, termCode: '1402-1', fixedTuition: '1000', perUnitTuition: '50', termSortKey: 10 },
  { degreeLevelId: 1, termType: 'NORMAL' as const, termCode: '1403-1', fixedTuition: '1500', perUnitTuition: '60', termSortKey: 11 },
  // ترم تابستان همان مقطع
  { degreeLevelId: 1, termType: 'SUMMER' as const, termCode: '1403-3', fixedTuition: '0', perUnitTuition: '80', termSortKey: 12 },
  // قاعدهٔ بی‌اثر (هر دو صفر) → باید دور ریخته شود
  { degreeLevelId: 2, termType: 'NORMAL' as const, termCode: '1403-1', fixedTuition: '0', perUnitTuition: '0', termSortKey: 13 },
];
const drafts = mapLegacyFeeRules(legacy);
eq('تعداد پیش‌نویس‌ها (جمع‌شده + بی‌اثر حذف‌شده)', drafts.length, 2);
const normal = drafts.find(d => d.termType === 'NORMAL');
eq('ترم‌های هم‌نوع جمع شدند و نرخ آخرین ترم ماند', normal?.fixedTuition, 1500);
eq('نرخ هر واحد آخرین ترم', normal?.perUnitTuition, 60);
eq('offeringType در پل همیشه خالی است', normal?.offeringType, null);
eq('ترم تابستان جدا نگه داشته شد', drafts.some(d => d.termType === 'SUMMER' && d.perUnitTuition === 80), true);
eq('قاعدهٔ کاملاً صفر حذف شد', drafts.some(d => d.degreeLevelId === 2), false);

// نکتهٔ کلیدی: effectiveFromYear باید خالی بماند، وگرنه دانشجوی ورودی قدیمی نرخ را از دست می‌دهد
eq('effectiveFromYear عمداً خالی است', drafts.every(d => d.effectiveFromYear === null), true);
eq('یادداشت، ترم مبدأ را ثبت می‌کند', normal?.note.includes('1403-1'), true);

// خروجی پل باید واقعاً توسط pickFeeRule قابل انتخاب باشد — برای هر ورودی
const imported = drafts.map((d, i) => ({ id: 100 + i, ...d }));
eq('ورودی ۱۴۰۰ هم نرخ را می‌گیرد (نه فقط ورودی جدید)',
  pickFeeRule(imported, { degreeLevelId: 1, termType: 'NORMAL', termLevelOnly: true, entryYear: 1400 })?.fixedTuition, 1500);
eq('ورودی ۱۴۰۳ هم همان نرخ را می‌گیرد',
  pickFeeRule(imported, { degreeLevelId: 1, termType: 'NORMAL', termLevelOnly: true, entryYear: 1403 })?.fixedTuition, 1500);
eq('دانشجوی بدون ورودی ثبت‌شده هم نرخ را می‌گیرد',
  pickFeeRule(imported, { degreeLevelId: 1, termType: 'NORMAL', termLevelOnly: true, entryYear: null })?.fixedTuition, 1500);
eq('همان قاعده به ترم معادل‌سازی نشت نمی‌کند',
  pickFeeRule(imported, { degreeLevelId: 1, termType: 'EQUIVALENCE', termLevelOnly: true, entryYear: 1403 }), null);

console.log('\n۹) سیاست شهریهٔ ثابت معادل‌سازی (EQUIV_FIXED_TUITION_MODE)');
eq('پیش‌فرض: مقدار ناشناخته به ONCE برمی‌گردد', normalizeEquivFixedMode(''), 'ONCE');
eq('مقدار نامعتبر هم به ONCE برمی‌گردد', normalizeEquivFixedMode('SOMETHING'), 'ONCE');
eq('حروف کوچک/فاصله پذیرفته می‌شود', normalizeEquivFixedMode(' per_term '), 'PER_TERM');
eq('NONE تشخیص داده می‌شود', normalizeEquivFixedMode('none'), 'NONE');

// سناریوی واقعی: ۴۵ واحد معادل‌سازی = ۳ نیمسال 00EQ
const terms = [false, false, false]; // [نوبت اول، دوم، سوم]
const countFixed = (mode: 'ONCE' | 'PER_TERM' | 'NONE') =>
  terms.map((_, i) => shouldChargeFixed(mode, i === 0)).filter(Boolean).length;

eq('ONCE: شهریهٔ ثابت دقیقاً یک بار', countFixed('ONCE'), 1);
eq('ONCE: فقط روی اولین نیمسال', shouldChargeFixed('ONCE', true) && !shouldChargeFixed('ONCE', false), true);
eq('PER_TERM: به ازای هر نیمسال (رفتار قبلی)', countFixed('PER_TERM'), 3);
eq('NONE: هرگز شهریهٔ ثابت نمی‌گیرد', countFixed('NONE'), 0);

console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
