/**
 * گیت «یکنواختی ریز شهریهٔ متغیر دروس» در کارنامهٔ مالی نوع الف و نوع ب.
 *
 * ── بهروزرسانی (تأیید همکاران مالی با تصویر سند قدیمی سما) ──
 * «نوع الف» دقیقاً ۱۱ ستون سند قدیمی را میگیرد، **بدون ستون «ردیف»**:
 *   راست→چپ: کد درس | نام درس | نظری | عملی | نوع درس آموزشی | نوع انتخاب درس |
 *            نمره | وضع | نوع انتخاب شهریه | نوع درس مالی | شهریه
 * سربرگ هر نیمسال شش قلم دارد: نیمسال · وضعیت دانشجو · کد ثابت · اولیه ·
 * کد متغیر · اولیه. کد ثابت در تمام ترمها ثابت است و از «قالب نیمسال ورود»
 * میآید؛ کد متغیر سالبهسال از tuition_term_tariff خوانده میشود. هیچ عددی در
 * لایهٔ نمایش سختکد نیست. سربرگ دانشجو هم کد رشته و کد مقطع را نشان میدهد.
 *
 * «نوع ب» همان قرارداد قدیمی ۸ستونهٔ خودش را حفظ میکند (تغییری نخواستهاند).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { termTypeFromDigit, normalizeTermCode } from '../src/lib/scheduling-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const rd = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string): void => {
  if (c) { pass++; console.log('  ✓', m); }
  else { fail++; console.error('  ✗', m); }
};

const A = rd('src/components/FinancialTranscript.tsx');
const B = rd('src/components/FinancialTranscriptFlat.tsx');
const CSS = rd('src/app/globals.css');
const TC = rd('src/lib/transcript-courses.ts');
const TT = rd('src/lib/tuition-tariff.ts');
const PC = rd('src/lib/tuition-price-codes.ts');
const SCHEMA = rd('src/db/schema.ts');
const MIG = rd('drizzle/0136_tuition_price_codes.sql');
const SD = rd('src/lib/finance-engine/student-detail.ts');
const ADMIN = rd('src/app/admin/finance/student/[id]/page.tsx');
const STU = rd('src/app/student/finance/page.tsx');
const API = rd('src/app/api/admin/finance/reports/student-statement/route.ts');
const CLIENT = rd('src/app/admin/finance/reports/StudentStatementClient.tsx');

console.log('\n── نوع الف: ۱۱ ستون دقیق سند قدیمی، بدون «ردیف» ──');

/** سرستونها به همان ترتیبی که در JSX آمدهاند (اولی سمت راست جدول RTL). */
const A_HEADERS = [
  'کد درس', 'نام درس', 'نظری', 'عملی', 'نوع درس آموزشی',
  'نوع انتخاب درس', 'نمره', 'وضع', 'نوع انتخاب شهریه', 'نوع درس مالی', 'شهریه',
];
const headerRow = (A.match(/<thead>[\s\S]*?<\/thead>/g) ?? [])
  .find((block) => block.includes('کد درس')) ?? '';
const labels = [...headerRow.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map((m) => m[1].trim());
ok(labels.length === 11, `نوع الف: دقیقاً ۱۱ سرستون (یافتشد: ${labels.length})`);
ok(JSON.stringify(labels) === JSON.stringify(A_HEADERS), 'نوع الف: ترتیب راستبهچپ ستونها عیناً تأییدشده است');
ok(!labels.includes('ردیف') && !/>\s*ردیف\s*<\/th>/.test(A), 'نوع الف: ستون «ردیف» حذف شد');
ok(!A.includes('{fa(i + 1)}'), 'نوع الف: شمارهٔ ردیف در سلولها چاپ نمیشود');
ok(A.includes('colSpan={10}'), 'نوع الف: ردیف «جمع متغیر دروس» با ۱۱ ستون هماهنگ شد');
ok((A.match(/<col /g) ?? []).length >= 11, 'نوع الف: colgroup به اندازهٔ ۱۱ ستون');

console.log('\n── نوع الف: محتوای ستونها از دیتابیس ──');
ok(A.includes('educationalTypeLabel(c)'), 'نوع درس آموزشی: ماهیت درس / استنتاج از واحد نظری-عملی');
ok(A.includes('c.selectionType'), 'نوع انتخاب درس: از پرچمهای enrollments');
ok(A.includes('priceCode(c.gradeStatusCode)'), 'وضع: کد وضعیت نمرهٔ سما');
ok(A.includes('tuitionSelectionLabel(c)'), 'نوع انتخاب شهریه: ضریب نیمسال ورود');
ok(A.includes('courseTypeLabel(c)') && A.includes('fa(c.maliType)'), 'نوع درس مالی: برچسب + کد سما');
ok(A.includes('fa(c.amount)'), 'شهریه: مبلغ تخصیصیافته از دفتر کل');
ok(A.includes('tr-mali-code') && /tr-mali-code[^>]*>[^<]*\({fa\(/.test(A), 'نوع الف: کد داخل پرانتز');
ok(!/tr-mali-code[^>]*tr-print-hide/.test(A), 'نوع الف: کد در چاپ پنهان نمیشود');
ok(!A.includes('tr-print-hide font-mono text-[7px]'), 'نوع الف: کد خاکستری ریزِ صفحهای حذف شد');

console.log('\n── نوع الف: سربرگ نیمسال با چهار کد شهریه ──');
for (const label of ['نیمسال: ', 'وضعیت دانشجو: ', 'کد ثابت: ', 'کد متغیر: ']) {
  ok(A.includes(label), `سربرگ ترم: «${label.trim()}» چاپ میشود`);
}
ok((A.match(/اولیه: /g) ?? []).length === 2, 'سربرگ ترم: دو «اولیه» (ثابت و متغیر)');
ok(A.includes('priceCode(t.fixedPriceCode)'), 'کد ثابت از قالب نیمسال ورود خوانده میشود');
ok(A.includes('priceCode(t.initialFixedPriceCode ?? t.fixedPriceCode)'), 'اولیهٔ ثابت = کد ثابت در نبود مقدار صریح');
ok(A.includes('priceCode(t.variablePriceCode ?? t.tariffGroupCode)'), 'کد متغیر همان نیمسال، با پشتیبان کد گروه تعرفه');
ok(A.includes('priceCode(t.initialVariablePriceCode)'), 'اولیهٔ متغیر = کد سال ورود');
ok(A.includes("t.statusTitle || '—'"), 'وضعیت دانشجو همیشه چاپ میشود (حتی خالی)');
ok(!/221901901|3990121/.test(A), 'هیچ کُد شهریهای در لایهٔ نمایش سختکد نشده است');
// عیب پیادهسازی قبلی: هر سه کد یک tariffGroupCode تکراری بودند.
ok(A.includes('variablePriceCode') && A.includes('fixedPriceCode'), 'کد ثابت و کد متغیر دو منبع جدا دارند');

console.log('\n── نوع الف: کد رشته و کد مقطع در سربرگ دانشجو ──');
ok(A.includes('student.majorCode') && A.includes('student.degreeCode'), 'کد رشته و کد مقطع جلوی عنوان چاپ میشود');
ok(A.includes('majorCode?: string | null') && A.includes('degreeCode?: string | null'), 'پراپهای کد تعریف شدند');
ok(SD.includes('majorCode: majors.majorCode') && SD.includes('degreeCode: degree_level_configs.code'), 'کدها از majors / degree_level_configs خوانده میشوند');
ok(CLIENT.includes('majorCode') && CLIENT.includes('degreeCode'), 'گزارش صورتحساب هم کدها را میگیرد');

console.log('\n── ذخیرهٔ کدها در دیتابیس (بدون سختکد در UI) ──');
ok(MIG.includes('CREATE TABLE IF NOT EXISTS tuition_price_code_templates'), 'مهاجرت ۰۱۳۶ جدول قالب کدها را میسازد');
ok(MIG.includes('"fPriceCode"'), 'مهاجرت ۰۱۳۶ ستون کد ثابت را به تعرفه اضافه میکند');
ok(MIG.includes('"entryYear"') && MIG.includes('"entryTerm"'), 'قالب بر اساس نیمسال ورود دانشجو کلید میخورد');
ok(SCHEMA.includes('export const tuition_price_code_templates'), 'جدول در Drizzle schema ثبت شد');
ok(SCHEMA.includes('fPriceCode: varchar'), 'کد ثابت در Drizzle schema ثبت شد');
ok(PC.includes('tuition_price_code_templates') && PC.includes('resolveTuitionPriceCodes'), 'حلگر کدها از دیتابیس میخواند');
ok(PC.includes('uPriceCode: tuition_term_tariff.uPriceCode'), 'کد متغیر از tuition_term_tariff میآید');
ok(PC.includes('shiftPriceCodeYear'), 'پشتیبان سالهای بدون تعرفه با جابجایی رقم سال');
ok(!/221901901|3990121/.test(PC), 'حلگر هیچ عددی را سختکد نکرده است');

console.log('\n── سیمکشی یکتا در هر سه نما ──');
ok(TT.includes('uPriceCode: tuition_term_tariff.uPriceCode') && TT.includes('groupVotes'), 'لایهٔ تعرفه: کد گروه خوانده میشود');
ok(TC.includes('tariffGroupCode') && TC.includes('computeTariffCourseLinesForTerms(studentId, ids, tariffMeta)'), 'لایهٔ ریز دروس: کد گروه عبور داده میشود');
ok(TC.includes('resolveTuitionPriceCodes(studentId, ids)'), 'لایهٔ ریز دروس: چهار کد سربرگ یکبار حل میشود');
ok(TC.includes('selectionType:') && TC.includes('gradeStatusCode:') && TC.includes('tuitionCoefficient:'), 'ستونهای آموزشی از enrollments / ضرایب پُر میشوند');
for (const [name, src] of [['ادمین', ADMIN], ['دانشجو', STU], ['صورتحساب', API], ['کلاینت', CLIENT]] as const) {
  ok(src.includes('variablePriceCode') && src.includes('fixedPriceCode') && src.includes('initialVariablePriceCode'), `${name}: چهار کد سربرگ تحویل شد`);
}

console.log('\n── نوع ب: قرارداد قدیمی ۸ستونه دستنخورده ──');
ok(B.includes('نوع درس مالی'), 'نوع ب: سرستون «نوع درس مالی»');
ok(B.includes('واحد نظری') && B.includes('واحد عملی'), 'نوع ب: واحد نظری و عملی جدا');
ok(!/>واحد<\/th>/.test(B), 'نوع ب: ستون مستقل «واحد» حذف شد');
ok(B.includes('tr-mali-code') && /tr-mali-code[^>]*>[^<]*\({fa\(/.test(B), 'نوع ب: کد داخل پرانتز');
ok(!/tr-mali-code[^>]*tr-print-hide/.test(B), 'نوع ب: کد در چاپ پنهان نمیشود');
ok(!B.includes('tr-print-hide ms-1 font-mono'), 'نوع ب: کد خاکستری ریز حذف شد');
ok(B.includes('وضع نیمسال') && B.includes("t.statusTitle || '—'"), 'نوع ب: وضع نیمسال همیشه دیده میشود');
ok(B.includes('مبنای نرخ') && B.includes('کد گروه تعرفه'), 'نوع ب: مبنای نرخ و کد گروه تعرفه');
ok(B.includes('tariffGroupCode?: string | null'), 'نوع ب: پراپ کد گروه تعرفه تعریف شد');
ok(B.includes('rateBasisLabel'), 'نوع ب: مبنای نرخ از تابع مشترک');
ok(B.includes('نام نیمسال') && B.includes('<TermTitle t={t} />'), 'نوع ب: نام کامل نیمسال');
ok(B.includes("termType === 'EQUIVALENCE'") || B.includes("norm.termType === 'EQUIVALENCE'"), 'نوع ب: نیمسال معادلسازی');
ok(B.includes("norm.termType === 'SUMMER'"), 'نوع ب: نیمسال تابستان');
ok(!B.includes('{fa(r.c.units)}'), 'نوع ب: سلول «واحد» حذف شد');
ok(B.includes('totalTheoryUnits') && B.includes('totalPracticalUnits'), 'نوع ب: جمع واحدها نظری/عملی شد');

console.log('\n── چاپ A4 ──');
ok(CSS.includes('.tr-fin-root .tr-fin-row { grid-template-columns: minmax(0, 1fr) !important;'), 'چاپ A4: یک کارت تمامعرض');
ok(A.includes('i += 1') && A.includes('grid-cols-1') && !A.includes('sm:grid-cols-2'), 'نوع الف: DOM یک کارت تمامعرض در هر ردیف');
ok(!/grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/.test(CSS), 'چاپ: قاعدهٔ ۲کارتۀ قدیمی حذف شد');
ok(CSS.includes('.tr-mali-code, .tr-flat-root .tr-mali-code { display: inline !important;'), 'چاپ: کد نوع درس مالی پنهان نمیشود');
ok(CSS.includes('.tr-fin-root .tr-term-meta'), 'چاپ: سربرگ ترم استایل گرفت');

console.log('\n── نام نیمسال و قانون معادلسازی ──');
ok(termTypeFromDigit(1) === 'NORMAL' && termTypeFromDigit(2) === 'NORMAL', 'رقم آخر ۱ و ۲ → نیمسال عادی');
ok(termTypeFromDigit(3) === 'SUMMER', 'رقم آخر ۳ → نیمسال تابستان');
ok([0, 4, 5, 6, 7, 8, 9].every((d) => termTypeFromDigit(d) === 'EQUIVALENCE'), 'هر رقم آخری جز ۱/۲/۳ → نیمسال معادلسازی');
ok(normalizeTermCode('14044')?.termType === 'EQUIVALENCE', 'نمونهٔ کاربر: کد 14044 → نیمسال معادلسازی');
ok(A.includes('t.statusTitle ||') && B.includes('t.statusTitle ||'), 'وضع نیمسال دستنخورده چاپ میشود');
ok(A.includes("norm.termType === 'EQUIVALENCE'") || A.includes("termType === 'EQUIVALENCE'"), 'نوع الف: نیمسال معادلسازی');
ok(A.includes("norm.termType === 'SUMMER'"), 'نوع الف: نیمسال تابستان');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
