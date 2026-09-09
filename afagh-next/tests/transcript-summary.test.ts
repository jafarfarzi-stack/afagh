/**
 * تست واحد هستهٔ خالص کارنامه — بدون React، بدون DB، بدون DOM
 *
 * اجرا: npm test
 * این منطق تا دور قبل داخل کامپوننت ۱۷۴۵ سطری StudentsManagerClient بود و
 * هیچ تستی نداشت. حالا در src/app/admin/students/transcript-utils.ts است:
 *   numOrNull / regThresholds / passedCourseSet
 *   summarizeTerm / summarizeTotal / groupTranscript (معدل نیمسال و کل + مشروطی)
 *   breakdownByType / courseTypeGroup (تفکیک جدول سما)
 *   faNum / faWords / g2j / dateToJalali / todayJalali / codeLabel
 */
import {
  breakdownByType, codeLabel, courseTypeGroup, dateToJalali, faIntWords, faNum, faWords,
  g2j, groupTranscript, numOrNull, passedCourseSet, regThresholds, summarizeTerm,
  summarizeTotal, todayJalali,
} from '../src/app/admin/students/transcript-utils.ts';
import type { TranscriptRow } from '../src/app/admin/students/actions.ts';

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
};
const close = (name: string, got: number | null, want: number | null) => {
  const ok = got === null || want === null ? got === want : Math.abs(got - want) < 1e-9;
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${got}\n      want: ${want}`); }
};

/** سازندهٔ ردیف کارنامه (بقیهٔ ستون‌ها خالی) */
type Seed = { term?: string; code?: string; units?: number | string | null; type?: string | null; g?: number | string | null; st?: string; prob?: boolean | null; title?: string | null };
const R = (o: Seed): TranscriptRow => ({
  termCode: o.term ?? '4021',
  termTitle: 'نیمسال اول ۱۴۰۲–۱۴۰۳',
  courseCode: o.code ?? 'C-000',
  courseTitle: 'درس آزمایشی',
  units: o.units === undefined ? '3' : o.units === null ? null : String(o.units),
  courseType: 'type' in o ? o.type ?? null : 'اصلی',
  gradeValue: o.g === undefined ? null : o.g === null ? null : String(o.g),
  gradeStatus: o.st ?? 'FINALIZED',
  gradeStatusTitle: null,
  offeringType: null,
  termStatusTitle: null,
  termProbation: o.prob ?? null,
});

console.log('۱)numOrNull — رشتهٔ نمره/واحد به عدد');
eq('null → null', numOrNull(null), null);
eq('رشتهٔ خالی → null', numOrNull(''), null);
eq('متن بی‌ربط → null', numOrNull('abc'), null);
eq('صفر حفظ می‌شود', numOrNull('0'), 0);
eq('اعشار', numOrNull('12.5'), 12.5);
eq('Infinity رد می‌شود', numOrNull('1e999'), null);

console.log('۲)regThresholds — آستانه‌های آیین‌نامه');
eq('بدون کانفیگ: قبولی ۱۰ و مشروطی ۱۲', regThresholds(null), { pass: 10, prob: 12, exclFailed: false });
eq('مقادیر آیین‌نامه', regThresholds({ grading_and_gpa: { default_passing_grade: 8, failed_course_gpa_policy: 'EXCLUDE_IF_PASSED' }, probation_and_tenure: { probation_gpa_threshold: 14 } } as never),
  { pass: 8, prob: 14, exclFailed: true });
eq('مقدار غیرعددی → پیش‌فرض', regThresholds({ grading_and_gpa: { default_passing_grade: 'بیست' } } as never), { pass: 10, prob: 12, exclFailed: false });
eq('صفرِ مشروع شمرده می‌شود', regThresholds({ grading_and_gpa: { default_passing_grade: 0 } } as never).pass, 0);

console.log('۳)passedCourseSet — درس‌های قبولی‌شده (برای حذف مردودی از معدل کل)');
const pRows = [
  R({ code: 'A', g: 18, st: 'FINALIZED' }),
  R({ code: 'B', g: 8, st: 'FINALIZED' }),
  R({ code: 'C', g: null, st: 'EXEMPT' }),
  R({ code: 'D', g: null, st: 'PASSED_NO_GRADE' }),
  R({ code: 'E', g: 12, st: 'TEMPORARY' }),
  R({ code: 'F', g: 12, st: 'PENDING' }),
  R({ code: 'B', g: 14, st: 'FINALIZED' }), // جبرانیِ قبول‌شدهٔ همان درس
];
eq('قبولی‌ها: نمره ≥ حد + معاف/قبول بدون نمره', [...passedCourseSet(pRows, 10)].sort(), ['A', 'B', 'C', 'D', 'E']);
eq('آستانهٔ بالاتر مجموعه را کوچک می‌کند، ولی معاف‌ها می‌مانند', [...passedCourseSet(pRows, 15)].sort(), ['A', 'C', 'D']);
eq('مردودیِ پس از قبولی، درس را در مجموعه نگه می‌دارد', passedCourseSet(pRows, 10).has('B'), true);

console.log('۴)summarizeTerm — معدل و مشروطیِ یک نیمسال');
const tRows = [
  R({ code: 'A1', units: 3, g: 18 }),
  R({ code: 'A2', units: 2, g: 8 }),
  R({ code: 'A3', units: 2, g: null, st: 'PENDING' }), // در حال اجرا: در واحد counted نیست
  R({ code: 'A4', units: 1, g: null, st: 'EXEMPT' }),   // معاف: فقط واحد قبولی
];
eq('جمع‌های نیمسال', summarizeTerm(tRows), { taken: 6, passed: 4, failed: 2, wsum: 70, wunits: 5 });
eq('معدل = مجموع نمره×واحد ÷ واحد نمره‌دار', 70 / 5, 14);
eq('نیمسال بدون نمره → wunits صفر', summarizeTerm([R({ g: null, st: 'PENDING' })]), { taken: 0, passed: 0, failed: 0, wsum: 0, wunits: 0 });
eq('واحدِ null صفر حساب می‌شود', summarizeTerm([R({ units: null, g: 15 })]).taken, 0);
eq('با آستانهٔ ۱۹ حتی ۱۸ هم مردودی است', summarizeTerm(tRows, 19).passed, 1);

console.log('۵)summarizeTotal — معدل کل با سیاست نمرهٔ مردودی');
const rRows = [
  R({ code: 'X', units: 3, g: 8, st: 'FINALIZED' }),
  R({ code: 'X', units: 3, g: 15, st: 'FINALIZED' }), // ترم بعد جبران شد
  R({ code: 'Y', units: 2, g: 7, st: 'FINALIZED' }),  // هرگز قبول نشد
];
eq('EXCLUDE_IF_PASSED: مردودیِ جبران‌شده حذف می‌شود', summarizeTotal(rRows, { pass: 10, prob: 12, exclFailed: true }), { wsum: 59, wunits: 5 });
eq('KEEP_ALL: هر دو تلاش در معدل می‌آید', summarizeTotal(rRows, { pass: 10, prob: 12, exclFailed: false }), { wsum: 83, wunits: 8 });
eq('نمرهٔ PENDING در معدل کل نیست', summarizeTotal([R({ g: 19, st: 'PENDING' })], { pass: 10, prob: 12, exclFailed: false }), { wsum: 0, wunits: 0 });

console.log('۶)groupTranscript — گروه‌بندی ترم، تجمیعی و مشروطی');
const gRows = [
  R({ term: '4022', code: 'A1', units: 3, g: 18, prob: true }),
  R({ term: '4022', code: 'A2', units: 2, g: 8 }),
  R({ term: '4021', code: 'B1', units: 3, g: 12 }),
  R({ term: '4021', code: 'B2', units: 2, g: null, st: 'PENDING' }),
];
const sum = groupTranscript(gRows);
eq('ترتیب نیمسال‌ها (۴۰۲۱ پیش از ۴۰۲۲)', sum.terms.map(t => t.termCode), ['4021', '4022']);
eq('معدل هر نیمسال', sum.terms.map(t => t.gpa), [12, 14]);
eq('واحد اخذه/گذراندهٔ هر نیمسال', sum.terms.map(t => [t.taken, t.passed, t.failed]), [[3, 3, 0], [5, 3, 2]]);
eq('مشروطی از فایل وضع نمره مقدم بر محاسبه است', sum.terms[1].probation, true);
eq('بدون فایل، مشروطی از معدل و آستانه', sum.terms[0].probation, false);
eq('تجمیعی تا پایان نیمسال اول', [sum.terms[0].cumTaken, sum.terms[0].cumPassed, sum.terms[0].cumGpa], [3, 3, 12]);
eq('تجمیعی تا پایان نیمسال دوم', [sum.terms[1].cumTaken, sum.terms[1].cumPassed, sum.terms[1].cumFailed], [8, 6, 2]);
close('معدل کل تجمیعی نیمسال دوم', sum.terms[1].cumGpa, 106 / 8);
close('معدل کل نهایی = معدل تجمیعی آخرین نیمسال', sum.gpa, sum.terms[1].cumGpa);
close('معدل کل از هر دو نیمسال (بدون سیاست حذف)', sum.gpa, 106 / 8);
eq('جمع کل واحدها (واحدِ اخذه/گذرانده، بدون PENDING)', [sum.totalTaken, sum.totalPassed], [8, 6]);
eq('آستانه‌ها در خروجی هست', [sum.passGrade, sum.probThreshold], [10, 12]);
eq('کارنامهٔ خالی: نه ترم، نه معدل', groupTranscript([]), { terms: [], totalTaken: 0, totalPassed: 0, gpa: null, passGrade: 10, probThreshold: 12 });
eq('نیمسالِ بی‌کد با «—» برچسب می‌خورد', groupTranscript([R({ term: '', code: 'Z', units: 1, g: 5 })]).terms[0].termCode, '—');
eq('نیمسال بی‌کد مشروط می‌شود (معدل ۵)', groupTranscript([R({ term: '', code: 'Z', units: 1, g: 5 })]).terms[0].probation, true);
eq('عنوان نیمسال از اولین ردیف', groupTranscript(gRows).terms[0].termTitle, 'نیمسال اول ۱۴۰۲–۱۴۰۳');

console.log('۷)courseTypeGroup — نرمال‌سازی نوع درس به ۶ ستون سما');
eq('عمومی', courseTypeGroup('عمومی'), 'عمومی');
eq('پایه', courseTypeGroup('دروس پایه'), 'پایه');
eq('اصلی و تخصصی یکی می‌شوند', [courseTypeGroup('اصلی'), courseTypeGroup('تخصصی')], ['اصلی-تخصصی', 'اصلی-تخصصی']);
eq('حروف عربی نرمال می‌شوند', courseTypeGroup('اصلي'), 'اصلی-تخصصی');
eq('پایان‌نامه (با فاصله یا نیم‌فاصله)', [courseTypeGroup('پایان نامه'), courseTypeGroup('پروژه پایان‌نامه')], ['پایان‌نامه', 'پایان‌نامه']);
eq('جبرانی', courseTypeGroup('واحد جبرانی'), 'جبرانی');
eq('ناشناخته و خالی → اختیاری', [courseTypeGroup('هیچ‌کدام'), courseTypeGroup(null), courseTypeGroup('')], ['اختیاری', 'اختیاری', 'اختیاری']);

console.log('۸)breakdownByType — جدول تفکیکی صفحهٔ دوم کارنامه');
const bRows = [
  R({ code: 'g1', units: 2, g: 16, type: 'عمومی' }),
  R({ code: 'g2', units: 1, g: null, st: 'PENDING', type: 'عمومی' }), // اجرا: واحد ندارد
  R({ code: 'g3', units: 1, g: null, st: 'FINALIZED', type: 'عمومی' }), // بی‌نمره: واحد دارد
  R({ code: 'p1', units: 3, g: 8, type: 'پایه' }),
  R({ code: 's1', units: 4, g: 14, type: 'اصلي' }),
];
const bd = breakdownByType(bRows);
eq('شش ستون، به ترتیب جدول سما', bd.map(x => x.type), ['عمومی', 'پایه', 'اصلی-تخصصی', 'اختیاری', 'جبرانی', 'پایان‌نامه']);
eq('واحد عمومی (مدرک PENDING حذف)', bd[0].units, 3);
close('معدل عمومی فقط از نمره‌دارها', bd[0].gpa, 16);
eq('مردودی واحد نمی‌آورد ولی در معدل نوع درس هست', [bd[1].units, bd[1].gpa], [0, 8]);
eq('نوع عربی‌نویسی در ستون اصلی می‌نشیند', [bd[2].units, bd[2].gpa], [4, 14]);
eq('ستون بی‌ردیف: صفر و null', [bd[3].units, bd[3].gpa], [0, null]);
eq('در جدول تفکیکی فقط واحدهای قبولی شمرده می‌شوند', bd.reduce((s, x) => s + x.units, 0), 7);
eq('مردودیِ جبران‌نشده با سیاست EXCLUDE هم در معدل نوع درس می‌ماند',
  breakdownByType(bRows, { grading_and_gpa: { failed_course_gpa_policy: 'EXCLUDE_IF_PASSED' } } as never)[1],
  { type: 'پایه', units: 0, gpa: 8 });
eq('کارنامهٔ خالی → شش ستون صفر', breakdownByType([]).map(x => x.units), [0, 0, 0, 0, 0, 0]);

console.log('۹)اعداد و حروف فارسی');
eq('null → خط تیره', faNum(null), '—');
eq('undefined → خط تیره', faNum(undefined), '—');
eq('رقم فارسی و بدون رقم لاتین', /^[۰-۹.٫]+$/.test(faNum(12.5)), true);
eq('صفرِ عدد نه «—» است', faNum(0) !== '—', true);
eq('گردکردن دو رقم اعشار', /^[۰-۹.٫]+$/.test(faNum(13.456)), true);
eq('حروف: ۱۷٫۲۶', faWords(17.26), 'هفده و بیست و شش صدم');
eq('حروف: ۱۲٫۵ (ده‌تایی رُند — باگی که این تست قفل می‌کند)', faWords(12.5), 'دوازده و پنجاه صدم');
eq('حروف: ۱۸٫۳', faWords(18.3), 'هجده و سی صدم');
eq('حروف: عدد صحیح', faWords(20), 'بیست');
eq('حروف: صفر', faWords(0), 'صفر');
eq('حروف: منفی', faWords(-1.2), 'منفی یک و بیست صدم');
eq('حروف: null → خط تیره', faWords(null), '—');
eq('حروف: بی‌نهایی → خط تیره', faWords(Number.NaN), '—');
eq('حروفِ صحیح: ۳۰', faIntWords(30), 'سی');
eq('حروفِ صحیح: ۴۵', faIntWords(45), 'چهل و پنج');
eq('حروفِ صحیح: ۹۰', faIntWords(90), 'نود');
eq('حروفِ صحیح: ۱۱', faIntWords(11), 'یازده');

console.log('۱۰)تاریخ جلالی — الگوریتم ۳۳‌ساله در برابر تقویم رسمی ICU');
eq('نوروز ۱۴۰۳', g2j(2024, 3, 20), [1403, 1, 1]);
eq('پیش‌از نوروز ۱۴۰۳ (۱۴۰۲ کبیسه نبود)', g2j(2024, 3, 19), [1402, 12, 29]);
eq('نوروز ۱۳۵۸', g2j(1979, 3, 21), [1358, 1, 1]);
eq('۳۰ اسفند سال کبیسهٔ ۱۳۹۹', g2j(2021, 3, 20), [1399, 12, 30]);
eq('۱۳۹۸ سی‌ام اسفند نداشت', g2j(2020, 3, 19), [1398, 12, 30 - 1]);
eq('ورودی خالی → خط تیره', dateToJalali(null), '—');
eq('رشتهٔ ایزو', dateToJalali('2024-09-09'), '1403/06/19');
eq('رشتهٔ بی‌ربط دست‌نخورده (۱۰ رقم اول)', dateToJalali('نامعلوم'), 'نامعلوم');
eq('رشتهٔ Date خوانده می‌شود', /^\d{4}\/\d{2}\/\d{2}$/.test(dateToJalali(new Date(Date.UTC(2000, 0, 2)).toISOString())), true);
eq('امروز قالب yyyy/mm/dd دارد', /^\d{4}\/\d{2}\/\d{2}$/.test(todayJalali()), true);
// مقایسه با تقویم جلالیِ خود ICU روی هر روز ۲۰۲۰ تا ۲۰۲۶ (شامل چهار سال کبیسه)
const icu = new Intl.DateTimeFormat('en-u-ca-persian', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });
let jalaliMismatch: string[] = [];
for (let t = Date.UTC(2020, 0, 1); t < Date.UTC(2026, 12, 0); t += 86400000) {
  const d = new Date(t);
  const a = g2j(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  const p = icu.formatToParts(d).reduce<Record<string, string>>((o, x) => ((o[x.type] = x.value), o), {});
  if (+p.year !== a[0] || +p.month !== a[1] || +p.day !== a[2]) jalaliMismatch.push(`${d.toISOString().slice(0, 10)}: ${a.join('-')} ≠ ${p.year}-${p.month}-${p.day}`);
}
eq('هیچ اختلافی با تقویم رسمی در ۷ سال (≈۲۵۵۷ روز)', jalaliMismatch, []);

console.log('۱۱)codeLabel — تبدیل کد سما به برچسب');
eq('موجود در نقشه', codeLabel({ '1': 'مشغول' }, '1'), 'مشغول');
eq('نبود در نقشه → خودِ کد', codeLabel({ '1': 'مشغول' }, '9'), '9');
eq('نقشهٔ تعریف‌نشده → خودِ کد', codeLabel(undefined, '7'), '7');
eq('خط تیرهٔ ورودی → خط تیره', codeLabel({ '—': 'x' }, '—'), '—');
eq('ورودی خالی → خط تیره', codeLabel({}, null), '—');

console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
