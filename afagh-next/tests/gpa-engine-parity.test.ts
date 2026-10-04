/**
 * ═══════════════════════════════════════════════════════════════════════
 *  گیت «برابری دو موتور معدل» — calculateOfficialGPA ↔ auditStudent
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  bug پیش‌شده: دو موتور پروژه برای یک کارنامهٔ یکسان دو عدد می‌دادند.
 *    regulations-engine (معدل رسمی): کد سمای «قبولیِ بدون احتساب» را می‌شناخت.
 *    graduation-engine (دروازهٔ فارغ‌التحصیلی): فقط `courses.affectsGpa` را می‌دید
 *    که روی هر ۴۳۲۴ ردیف درسِ آفاق+ناهند ۱ است ⇒ هر نمره‌ای که می‌نوشتی وارد
 *    معدلِ فارغ‌التحصیلی می‌شد. اندازه‌گیری روی دادهٔ تولید: بیشینهٔ |ΔGPA| = ۶٫۴۴
 *    و ۶ دانشجو از مسدود به واجد شرایط فارغ‌التحصیلی کشیده شدند.
 *
 *  این تست هستهٔ خالصِ هر دو موتور را (بدون DB — قواعد اتصال در انتهای فایل
 *  خنثی می‌شوند) روی یک مجموعهٔ مصنوعی از *همهٔ* کدهای قبولیِ جدول مرجع اجرا
 *  می‌کند و سه چیز را قفل می‌کند:
 *    ۱) برابری کامل دو موتور روی هر کد (passedUnits و GPA یکسان)
 *    ۲) ردیفِ «کدِ بدون احتساب» واحد می‌دهد ولی نمره نمی‌دهد (ΔGPA = 0)
 *    ۳) اهرم مستقل courses.affectsGpa = 0 در هر دو موتور grade را حذف می‌کند
 */
import { createRequire } from 'node:module';
import {
  GRADE_STATUS_CODES,
  NON_GPA_CODES,
  NON_GPA_PASS_CODES,
  isNonGpaPassCode,
  rowCountsTowardGpa,
} from '../src/lib/grade-status-codes.ts';
import {
  aggregateAuditTranscript,
  aggregateOfficialGpaRows,
  type GpaRow,
} from '../src/lib/gpa-aggregation.ts';

/**
 * نه regulations-engine و نه graduation-engine مستقیماً قابل import نیستند:
 * اولی `@/db` (ساخت Pool + assertProdSecrets) و دومی ماژول `server-only` را
 * می‌آورد که بیرون رانر Next عمداً پرتاب می‌کند. فقط همین گاردها خنثی می‌شوند
 * تا هستهٔ خالص قابل اجرا باشد؛ هیچ اتصالی به پایگاه داده برقرار نمی‌شود.
 */
const requireCjs = createRequire(import.meta.url);
const serverOnlyId = requireCjs.resolve('server-only');
(requireCjs as any).cache[serverOnlyId] = {
  id: serverOnlyId, filename: serverOnlyId, loaded: true, exports: {}, children: [], paths: [],
};

let pass = 0;
let fail = 0;
const t = (name: string, fn: () => unknown): void => {
  try {
    fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e: any) {
    fail++;
    console.log(`  ✗ ${name}\n      ${e?.message ?? e}`);
  }
};
const ok = (cond: unknown, msg: string): void => {
  if (!cond) throw new Error(msg);
};
const eq = (got: unknown, want: unknown, msg = ''): void => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error(`${msg}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);
  }
};

// ── آستانه‌های دو موتور در این تست ──────────────────────────────────────
const PASSING = 10;      // default_passing_grade آیین‌نامهٔ ۱۴۰۳
const RETAKE = 10;
const POLICY = 'EXCLUDE_IF_PASSED';
const MIN_GPA = 12;      // GRAD_MIN_GPA
const GRADE = 17.25;     // نمرهٔ عددیِ قطعی برای ردیف‌های قبولی
const UNITS = 3;

/** سازندهٔ ردیف کارنامه: `code` کد وضع نمرهٔ سما و `course` کد درس است (دو چیزِ جدا) */
const row = (o: {
  code: string; id?: number; course?: string; units?: number; grade?: number | string | null;
  status?: string; affectsGpa?: number | null; gradingType?: string | null;
  minMark?: number | null;
}): GpaRow => ({
  courseId: o.id ?? 1,
  code: o.course ?? `C-${o.id ?? 1}`,
  units: String(o.units ?? UNITS),
  gradeValue: o.grade === undefined ? String(GRADE) : o.grade === null ? null : String(o.grade),
  gradeStatus: o.status ?? 'FINALIZED',
  samaGradeStatusCode: o.code,
  gradingType: o.gradingType ?? 'NUMERIC',
  affectsGpa: o.affectsGpa === undefined ? 1 : o.affectsGpa,
  courseMinMark: o.minMark ?? null,
});

/** اجرای هر دو موتور روی یک مجموعهٔ ردیف — بدون DB */
const both = (rows: GpaRow[]) => ({
  official: aggregateOfficialGpaRows(rows, {
    passingGrade: PASSING, retakeMinGrade: RETAKE, policy: POLICY, dedupeRepeated: false,
  }),
  audit: aggregateAuditTranscript(rows, PASSING),
});

const PASS_CODES = GRADE_STATUS_CODES.filter(g => g.passed).map(g => g.code);

console.log('۱) تعریف مرجعِ «کدِ بدون احتساب در معدل»');
t('زیرمجموعهٔ کدهای قبولیِ بدون اثر در معدل = همان ۸ کدِ اندازه‌گیری‌شده', () => {
  eq([...NON_GPA_PASS_CODES].sort(), ['12', '16', '17', '18', '23', '32', '44', '53']);
});
t('هر کدِ بدون احتساب، زیرمجموعهٔ NON_GPA_CODES است (دو فهرست ناهم‌سو نمی‌شوند)', () => {
  ok([...NON_GPA_PASS_CODES].every(c => NON_GPA_CODES.has(c)), 'NON_GPA_PASS_CODES ⊄ NON_GPA_CODES');
});
t('کدهای درمعدلی (۱، ۳، ۱۱، ۲۷، ۴۰، ۵۰، ۵۴) در هیچ‌کدام از دو فهرست نیستند', () => {
  const gpaCodes = ['1', '3', '11', '27', '40', '50', '54'];
  ok(gpaCodes.every(c => !NON_GPA_PASS_CODES.has(c) && !NON_GPA_CODES.has(c)),
    'کد درمعدلی اشتباهاً بدون‌احتساب علامت خورده');
});
t('isNonGpaPassCode — مرزها: null/کد مردودی/کد درمعدلی ⇒ false', () => {
  eq([isNonGpaPassCode(null), isNonGpaPassCode(''), isNonGpaPassCode('2'), isNonGpaPassCode('1')], [false, false, false, false]);
});
t('rowCountsTowardGpa — سه شرط AND (کد سما / affectsGpa=0 / توصیفی)', () => {
  eq(rowCountsTowardGpa({ samaGradeStatusCode: '1' }), true);
  eq(rowCountsTowardGpa({ samaGradeStatusCode: '12' }), false);
  eq(rowCountsTowardGpa({ samaGradeStatusCode: '1', courseAffectsGpa: 0 }), false);
  eq(rowCountsTowardGpa({ samaGradeStatusCode: '1', gradingType: 'DESCRIPTIVE' }), false);
  eq(rowCountsTowardGpa({ samaGradeStatusCode: null, courseAffectsGpa: 1 }), true);
});

console.log('۲) برابری دو موتور روی مجموعهٔ مصنوعیِ همهٔ کدهای قبولی');
const allPassRows = PASS_CODES.map((c, i) => row({ code: c, id: i + 1, units: (i % 4) + 1 }));
t(`مجموعهٔ مصنوعی همهٔ ${PASS_CODES.length} کد قبولی جدول مرجع را پوشش می‌دهد`, () => {
  eq(new Set(allPassRows.map(r => String(r.samaGradeStatusCode))).size, PASS_CODES.length);
});
t('passedUnits و GPA دو موتور دقیقاً یکی است', () => {
  const { official, audit } = both(allPassRows);
  eq(official.passedUnits, audit.passedUnits, 'واحدهای گذرانده دو موتور فرق دارد');
  eq(official.gpa, audit.gpa, 'معدل دو موتور فرق دارد');
});
t('هر کد قبولی جداگانه: دو موتور برای همان کد هم‌رأی‌اند', () => {
  const base = [row({ code: '1', id: 1, units: 3, grade: 18 })];
  for (const c of PASS_CODES) {
    const { official, audit } = both([...base, row({ code: c, id: 2 })]);
    eq(official.passedUnits, audit.passedUnits, `واحدها برای کد ${c} فرق دارد`);
    eq(official.gpa, audit.gpa, `معدل برای کد ${c} فرق دارد`);
  }
});
t('کدهای درمعدلی واقعاً در معدل می‌آیند (تست معکوسِ بی‌اثری)', () => {
  const { audit } = both([row({ code: '1', id: 1, units: 3, grade: 18 })]);
  eq(audit.gpa, 18, 'ردیف کد ۱ باید تنها درسِ مؤثر و معدلش ۱۸ باشد');
});

console.log('۳) ردیفِ «قبولیِ بدون احتساب»: واحد می‌دهد، نمره نمی‌دهد');
const baseline = [row({ code: '1', id: 1, units: 3, grade: 18 })];
for (const c of [...NON_GPA_PASS_CODES].sort()) {
  t(`کد ${c}: ΔGPA = 0 ولی واحد +${UNITS} در هر دو موتور`, () => {
    const base = both(baseline);
    const withRow = both([...baseline, row({ code: c, id: 2 })]);
    eq(withRow.audit.gpa, base.audit.gpa, `معدل موتور فارغ‌التحصیلی با کد ${c} جابه‌جا شد`);
    eq(withRow.official.gpa, base.official.gpa, `معدل رسمی با کد ${c} جابه‌جا شد`);
    eq(withRow.audit.passedUnits, base.audit.passedUnits + UNITS, `واحد قبولی کد ${c} شمرده نشد`);
    eq(withRow.official.passedUnits, base.official.passedUnits + UNITS, `واحدهای رسمی کد ${c} شمرده نشد`);
  });
}
t('همهٔ ردیف‌های غیرگذرانده با هم: باز هم ΔGPA = 0 (ترکیبی از کدهای مختلف)', () => {
  const base = both(baseline);
  const rows = [...NON_GPA_PASS_CODES].map((c, i) => row({ code: c, id: 10 + i }));
  const mixed = both([...baseline, ...rows]);
  eq(mixed.audit.gpa, base.audit.gpa);
  eq(mixed.official.gpa, base.official.gpa);
  eq(mixed.audit.passedUnits, mixed.official.passedUnits);
  eq(mixed.audit.passedUnits, 3 + rows.length * UNITS);
});

console.log('۴) اهرم مستقل courses.affectsGpa = 0');
t('کد ۱ (درمعدلی) ولی affectsGpa=0 ⇒ نمره در هر دو موتور نمی‌آید، واحد می‌آید', () => {
  const { official, audit } = both([...baseline, row({ code: '1', id: 2, affectsGpa: 0, units: 4 })]);
  eq(audit.gpa, 18, 'معدل موتور فارغ‌التحصیلی نباید تغییر کند');
  eq(official.gpa, 18, 'معدل رسمی نباید تغییر کند');
  eq(official.passedUnits, 7);
  eq(audit.passedUnits, 7);
});
t('کد ۱۲ + affectsGpa=1 ⇒ باز هم بدون اثر (هر دو شرط مستقل، OR نیست)', () => {
  const { official, audit } = both([...baseline, row({ code: '12', id: 2, affectsGpa: 1, units: 4 })]);
  eq(official.gpa, 18);
  eq(audit.gpa, 18);
});

console.log('۵) سناریوی دروازهٔ فارغ‌التحصیلی (GRAD_MIN_GPA = ۱۲)');
/**
 * سناریوی دقیقِ باگِ تولید: کارنامه‌ای با ۱۰۰ واحد و معدل ۱۱٫۹ (زیر آستانه) و
 * یک ردیفِ منتقل‌شدهٔ ۳ واحدی با نمرهٔ ۲۰.
 *  - با کدِ «قبولیِ بدون احتساب» (۱۶) هر دو موتور باید ۱۱٫۹ بدهند ⇒ دانشجو
 *    همچنان مسدود. پیش از اصلاح، موتور فارغ‌التحصیلی ۱۲٫۱۴ می‌داد و همین
 *    ۶ دانشجویِ پروندهٔ تولید را از مسدود به واجد شرایط می‌برد.
 *  - با کدِ «قبولیِ درمعدلی» (۱) هر دو موتور ۱۲٫۱۴ می‌دهند ⇒ عبور مجاز است.
 */
const carrier = [row({ code: '1', id: 1, units: 100, grade: 11.9 })];
t('کدِ بدون احتساب (۱۶): هر دو موتور ۱۱٫۹ ⇒ دانشجوی زیرِ آستانه مسدود می‌ماند', () => {
  const { official, audit } = both([...carrier, row({ code: '16', id: 2, units: 3, grade: 20 })]);
  eq(audit.gpa, 11.9, 'موتور فارغ‌التحصیلی نباید نمرهٔ منتقل‌شده را وارد کند');
  eq(official.gpa, 11.9, 'موتور رسمی هم همین را می‌گوید');
  eq(audit.gpa! >= MIN_GPA, false, 'نباید عبور داده شود');
  eq(audit.passedUnits, 103, 'واحد درس منتقل‌شده باید شمرده شود');
});
t('کدِ درمعدلی (۱): هر دو موتور ۱۲٫۱۴ ⇒ عبورِ هر دو مجاز و یکسان', () => {
  const { official, audit } = both([...carrier, row({ code: '1', id: 2, units: 3, grade: 20 })]);
  eq(audit.gpa, 12.14);
  eq(official.gpa, 12.14);
  eq(audit.gpa! >= MIN_GPA, official.gpa! >= MIN_GPA, 'دو موتور دربارهٔ عبور هم‌رأی‌اند');
});

console.log('۶) تفاوت‌های باقی‌مانده و عمدیِ دو موتور (قفل‌شده تا کسی «تصادفی» تغییرشان ندهد)');
t('ردیفِ «قبولیِ بدون نمره» (EXEMPT): واحد در موتور فارغ‌التحصیلی شمرده می‌شود، در رسمی نه', () => {
  const rows = [row({ code: '18', id: 1, grade: null, status: 'EXEMPT', units: 6 })];
  const { official, audit } = both(rows);
  eq(official.passedUnits, 0, 'موتور رسمی ردیف بی‌نمره را از حلقهٔ واحدها هم کنار می‌گذارد');
  eq(audit.passedUnits, 6, 'موتور فارغ‌التحصیلی معافی را قبولی می‌داند');
  eq(official.gpa, 0);
  eq(audit.gpa, null);
});
t('نمرهٔ زیرِ کف با کدِ «پذیرفته‌شده» (۱۶): واحد در موتور فارغ‌التحصیلی شمرده می‌شود، در رسمی نه', () => {
  const rows = [row({ code: '16', id: 1, grade: 5 })];
  const { official, audit } = both(rows);
  eq(audit.passedUnits, UNITS, 'کد ۱۶ «پذیرفته‌شده» است ⇒ واحدش شمرده می‌شود');
  eq(official.passedUnits, 0, 'موتور رسمی با نمرهٔ زیر کف، واحدی نمی‌شمارد');
  eq(audit.gpa, null, 'ولی در هیچ موتوری نمره وارد معدل نمی‌شود');
  eq(official.gpa, 0);
});
t('مردودیِ درسی که بعداً پاس نشده: در «معدل رسمی» هست، در موتور فارغ‌التحصیلی نه (عمدی)', () => {
  const rows = [row({ code: '2', id: 1, course: 'C-A', units: 3, grade: 5 }), row({ code: '1', id: 2, course: 'C-B', units: 3, grade: 19 })];
  const { official, audit } = both(rows);
  eq(official.gpa, 12, 'معدل رسمی = (۵×۳ + ۱۹×۳) / ۶');
  eq(audit.gpa, 19, 'موتور فارغ‌التحصیلی فقط ردیفِ قبولی را در صورت/مخرج می‌گذارد');
  eq(official.passedUnits, UNITS);
  eq(audit.passedUnits, UNITS);
});
t('مردودیِ درسی که بعداً پاس شده (EXCLUDE_IF_PASSED): هر دو موتور یک عدد می‌دهند', () => {
  const rows = [
    row({ code: '2', id: 1, course: 'C-A', units: 3, grade: 8 }),
    row({ code: '1', id: 2, course: 'C-A', units: 3, grade: 19 }),
  ];
  const official = aggregateOfficialGpaRows(rows, {
    passingGrade: PASSING, retakeMinGrade: RETAKE, policy: POLICY, dedupeRepeated: false,
  });
  const audit = aggregateAuditTranscript(rows, PASSING);
  eq(official.gpa, 19, 'مردودی ۸ از صورت و مخرج معدل کل حذف شد');
  eq(audit.gpa, 19);
  eq(official.passedUnits, UNITS);
  eq(audit.passedUnits, UNITS);
});
t('dedupeRepeatedCourses (سوییچ ادمین) فقط در موتور رسمی اثر دارد', () => {
  const rows = [
    row({ code: '1', id: 1, course: 'C-A', units: 3, grade: 17 }),
    row({ code: '1', id: 2, course: 'C-A', units: 3, grade: 19 }),
  ];
  const deduped = aggregateOfficialGpaRows(rows, {
    passingGrade: PASSING, retakeMinGrade: RETAKE, policy: POLICY, dedupeRepeated: true,
  });
  const all = aggregateOfficialGpaRows(rows, {
    passingGrade: PASSING, retakeMinGrade: RETAKE, policy: POLICY, dedupeRepeated: false,
  });
  const audit = aggregateAuditTranscript(rows, PASSING);
  eq(deduped.gpa, 19, 'فقط بهترین نمرهٔ درس می‌ماند');
  eq(deduped.passedUnits, UNITS);
  eq(all.gpa, 18, 'بدون dedupe هر دو تلاش در معدل می‌مانند');
  eq(all.passedUnits, 6);
  eq(audit.gpa, 18, 'موتور فارغ‌التحصیلی این سوییچ را نمی‌شناسد (رفتارِ موجود)');
});

console.log('۷) یکپارچگیِ مجموعهٔ کدهای مرجع');
t('هر کدِ جدول مرجع یا در NON_GPA_CODES هست یا در معدل اثر دارد (مجموعهٔ بسته)', () => {
  for (const g of GRADE_STATUS_CODES) {
    ok(NON_GPA_CODES.has(g.code) === !g.affectsGpa, `کد ${g.code} با ستون affectsGpa جدول هم‌خوان نیست`);
  }
});
t('passedIds موتور فارغ‌التحصیلی فقط درس‌های گذرانده را دارد', () => {
  const rows = [row({ code: '1', id: 5, grade: 19 }), row({ code: '2', id: 6, grade: 3 })];
  eq([...aggregateAuditTranscript(rows, PASSING).passedIds], [5]);
});

console.log(`\nنتیجه: ${pass} موفق | ${fail} شکست`);
process.exit(fail === 0 ? 0 : 1);