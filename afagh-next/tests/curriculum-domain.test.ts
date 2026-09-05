/**
 * تست واحد Domain Model برنامهٔ درسی — بدون React و بدون DB (فاز ۱)
 *
 * اجرا: npm test
 * پوشش: ماشین حالت (گذارهای مجاز/غیرمجاز، ویرایش‌پذیری)، کدگذاری نسخه
 * (parse/build/nextRevision/compare)، نرمال‌سازی درخت قاعده، و Resolution
 * نسخهٔ قابل اعمال (پنجرهٔ ورودی، اولویت PUBLISHED، برتری revision، گرایش).
 */
import {
  CURRICULUM_STATUSES,
  canEditStatus,
  canTransitionStatus,
  assertTransition,
  transitionTargets,
  normalizeLogicNode,
  parseVersionCode,
  buildVersionCode,
  nextRevisionCode,
  compareVersionCodes,
  type CurriculumVersion,
} from '../src/lib/curriculum-types.ts';
import {
  rankVersions,
  resolveApplicableCurriculum,
  isApplicableForStudent,
  selectEffectiveRules,
  type ResolutionOutcome,
} from '../src/lib/curriculum-resolution.ts';

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
};
const throws = (name: string, fn: () => unknown, msgPart?: string) => {
  try {
    fn();
    fail++;
    console.log(`  ✗ ${name} (خطا نداد)`);
  } catch (e: any) {
    const ok = !msgPart || String(e?.message ?? e).includes(msgPart);
    if (ok) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name} (پیام خطا: ${String(e?.message ?? e)})`); }
  }
};

// ─────────────────────── ماشین حالت ───────────────────────
console.log('— ماشین حالت (State Machine) —');
eq('DRAFT→REVIEW مجاز', canTransitionStatus('DRAFT', 'REVIEW'), true);
eq('DRAFT→APPROVED غیرمجاز', canTransitionStatus('DRAFT', 'APPROVED'), false);
eq('DRAFT→PUBLISHED غیرمجاز (باید از APPROVED)', canTransitionStatus('DRAFT', 'PUBLISHED'), false);
eq('REVIEW→APPROVED مجاز', canTransitionStatus('REVIEW', 'APPROVED'), true);
eq('REVIEW→DRAFT مجاز (REJECT)', canTransitionStatus('REVIEW', 'DRAFT'), true);
eq('APPROVED→PUBLISHED مجاز', canTransitionStatus('APPROVED', 'PUBLISHED'), true);
eq('APPROVED→DRAFT غیرمجاز (اصل نسخه ممنوع)', canTransitionStatus('APPROVED', 'DRAFT'), false);
eq('PUBLISHED→ARCHIVED مجاز', canTransitionStatus('PUBLISHED', 'ARCHIVED'), true);
eq('PUBLISHED→DRAFT غیرمجاز', canTransitionStatus('PUBLISHED', 'DRAFT'), false);
eq('ARCHIVED→هر چیز غیرمجاز', canTransitionStatus('ARCHIVED', 'DRAFT'), false);
eq('تعداد وضعیت‌ها = ۵', CURRICULUM_STATUSES.length, 5);
eq('مقصدهای REVIEW', transitionTargets('REVIEW'), ['APPROVED', 'DRAFT']);
eq('مقصدهای ARCHIVED خالی', transitionTargets('ARCHIVED'), []);
throws('assertTransition غیرمجاز خطا می‌دهد', () => assertTransition('DRAFT', 'PUBLISHED', 'publish'), 'گذار غیرمجاز');
eq('ویرایش فقط DRAFT', canEditStatus('DRAFT'), true);
eq('ویرایش در REVIEW ممنوع', canEditStatus('REVIEW'), false);
eq('ویرایش در PUBLISHED ممنوع', canEditStatus('PUBLISHED'), false);

// ─────────────────────── کدگذاری نسخه ───────────────────────
console.log('— کدگذاری نسخه —');
eq('parse 1404', parseVersionCode('1404'), { base: '1404', revision: 0 });
eq('parse 1404-R1', parseVersionCode('1404-R1'), { base: '1404', revision: 1 });
eq('parse 1404-R12', parseVersionCode('1404-R12'), { base: '1404', revision: 12 });
eq('build 1404-R2', buildVersionCode('1404', 2), '1404-R2');
eq('nextRevisionCode 1404 → 1404-R1', nextRevisionCode('1404'), '1404-R1');
eq('nextRevisionCode 1404-R1 → 1404-R2', nextRevisionCode('1404-R1'), '1404-R2');
throws('build با کد غیرعددی خطا', () => buildVersionCode('SE-1404', 0), 'کد پایه');
eq('compare 1404 < 1405', compareVersionCodes('1404', '1405') < 0, true);
eq('compare 1404-R1 < 1404-R2', compareVersionCodes('1404-R1', '1404-R2') < 0, true);
eq('compare 1404-R1 > 1404', compareVersionCodes('1404-R1', '1404') > 0, true);
eq('compare برابر', compareVersionCodes('1404', '1404'), 0);

// ─────────────────────── نرمال‌سازی درخت قاعده ───────────────────────
console.log('— نرمال‌سازی درخت قاعده —');
eq('خالی → AND خالی', normalizeLogicNode(null), { operator: 'AND', conditions: [] });
eq('عملگر پیش‌فرض AND', normalizeLogicNode({ conditions: [{ course: 'RS30' }] }), {
  operator: 'AND',
  conditions: [{ course: 'RS30' }],
});
eq('درخت مرکب AND + OR', normalizeLogicNode({
  operator: 'AND',
  conditions: [
    { course: 'MA101', minGrade: 12 },
    { operator: 'OR', conditions: [{ course: 'A' }, { course: 'B' }] },
  ],
}), {
  operator: 'AND',
  conditions: [{ course: 'MA101', minGrade: 12 }, { operator: 'OR', conditions: [{ course: 'A' }, { course: 'B' }] }],
});
eq('شرط واحد گذرانده', normalizeLogicNode({ operator: 'OR', conditions: [{ unitsPassed: 60 }] }), {
  operator: 'OR',
  conditions: [{ unitsPassed: 60 }],
});
throws('عملگر نامعتبر خطا', () => normalizeLogicNode({ operator: 'XOR', conditions: [] }), 'عملگر نامعتبر');
throws('شرط خالی از course و units خطا', () => normalizeLogicNode({ conditions: [{}] }), 'course یا unitsPassed');

// ─────────────────────── Resolution ───────────────────────
console.log('— Resolution نسخهٔ قابل اعمال —');

const mk = (p: Partial<CurriculumVersion> & Pick<CurriculumVersion, 'id' | 'majorId' | 'degreeLevelId' | 'versionCode' | 'status' | 'entryYearFrom'>): CurriculumVersion => ({
  trackId: null,
  title: `برنامهٔ ${p.versionCode}`,
  entryYearTo: null,
  effectiveFrom: null,
  effectiveTo: null,
  totalRequiredUnits: 140,
  maxUnitsPerTerm: null,
  approvalId: null,
  createdByStaffId: null,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  ...p,
});

const ctx = { majorId: 412, degreeLevelId: 1, trackId: null, entryYear: 1403 };
const r = (name: string, out: ResolutionOutcome, wantId: number | null, wantReason: string) =>
  eq(name, { id: out.version?.id ?? null, reason: out.reason }, { id: wantId, reason: wantReason });

// جدول واقعی: مهندسی نرم‌افزار — 1400 (آرشیو)، 1402 (آرشیو)، 1404 (فعال)، 1405 (پیش‌نویس)
const versions = [
  mk({ id: 1, majorId: 412, degreeLevelId: 1, versionCode: '1400', status: 'ARCHIVED', entryYearFrom: 1400, entryYearTo: 1401 }),
  mk({ id: 2, majorId: 412, degreeLevelId: 1, versionCode: '1402', status: 'ARCHIVED', entryYearFrom: 1402, entryYearTo: 1403 }),
  mk({ id: 3, majorId: 412, degreeLevelId: 1, versionCode: '1404', status: 'PUBLISHED', entryYearFrom: 1404, entryYearTo: 1405 }),
  mk({ id: 4, majorId: 412, degreeLevelId: 1, versionCode: '1405', status: 'DRAFT', entryYearFrom: 1405 }),
];

r('ورودی ۱۴۰۳ → نسخهٔ ۱۴۰۲ (آرشیو، چون ۱۴۰۴ هنوز باز نشده)',
  resolveApplicableCurriculum(versions, { ...ctx, entryYear: 1403 }), 2, 'RESOLVED');
r('ورودی ۱۴۰۴ → نسخهٔ ۱۴۰۴ (فعال)',
  resolveApplicableCurriculum(versions, { ...ctx, entryYear: 1404 }), 3, 'RESOLVED');
r('ورودی ۱۴۰۶ → خارج از پنجره همه',
  resolveApplicableCurriculum(versions, { ...ctx, entryYear: 1406 }), null, 'NO_ENTRY_WINDOW');
r('فقط پیش‌نویس‌ها → NO_ACTIVE_STATUS',
  resolveApplicableCurriculum([mk({ id: 9, majorId: 1, degreeLevelId: 1, versionCode: '1405', status: 'DRAFT', entryYearFrom: 1405 })], { ...ctx, entryYear: 1405 }),
  null, 'NO_ACTIVE_STATUS');
r('رشتهٔ متفاوت → NO_MAJOR_OR_DEGREE',
  resolveApplicableCurriculum(versions, { ...ctx, majorId: 999 }), null, 'NO_MAJOR_OR_DEGREE');
r('بدون هیچ نسخه → NO_VERSIONS',
  resolveApplicableCurriculum([], ctx), null, 'NO_VERSIONS');

// برتری: 1404-R1 جایگزین 1404 می‌شود (revision جدیدتر، هر دو فعال، پنجرهٔ مشترک)
const revisions = [
  mk({ id: 10, majorId: 412, degreeLevelId: 1, versionCode: '1404', status: 'PUBLISHED', entryYearFrom: 1404 }),
  mk({ id: 11, majorId: 412, degreeLevelId: 1, versionCode: '1404-R1', status: 'PUBLISHED', entryYearFrom: 1404 }),
];
r('۱۴۰۴-R1 بر ۱۴۰۴ مقدم است',
  resolveApplicableCurriculum(revisions, { ...ctx, entryYear: 1405 }), 11, 'RESOLVED');
eq('candidates هر دو (برای Audit)', resolveApplicableCurriculum(revisions, { ...ctx, entryYear: 1405 }).candidates, [11, 10]);

// برتری: PUBLISHED قدیمیتر بر ARCHIVED جدیدتر (فعال > آرشیو)
const statusPrio = [
  mk({ id: 20, majorId: 412, degreeLevelId: 1, versionCode: '1400', status: 'PUBLISHED', entryYearFrom: 1400 }),
  mk({ id: 21, majorId: 412, degreeLevelId: 1, versionCode: '1402', status: 'ARCHIVED', entryYearFrom: 1402 }),
];
r('PUBLISHED ۱۴۰۰ بر ARCHIVED ۱۴۰۲ مقدم است (حتی با کد قدیمی‌تر)',
  resolveApplicableCurriculum(statusPrio, { ...ctx, entryYear: 1401 }), 20, 'RESOLVED');

// گرایش: دقیق > گرایش‌آزاد
const trackVersions = [
  mk({ id: 30, majorId: 412, degreeLevelId: 1, trackId: null, versionCode: '1404', status: 'PUBLISHED', entryYearFrom: 1404 }),
  mk({ id: 31, majorId: 412, degreeLevelId: 1, trackId: 7, versionCode: '1404', status: 'PUBLISHED', entryYearFrom: 1404 }),
];
r('دانشجوی گرایش ۷ → نسخهٔ اختصاصی گرایش',
  resolveApplicableCurriculum(trackVersions, { ...ctx, trackId: 7, entryYear: 1405 }), 31, 'RESOLVED');
r('دانشجوی گرایش ۹ (بدون نسخهٔ اختصاصی) → گرایش‌آزاد',
  resolveApplicableCurriculum(trackVersions, { ...ctx, trackId: 9, entryYear: 1405 }), 30, 'RESOLVED');
r('دانشجوی گرایش‌آزاد → فقط نسخهٔ آزاد',
  resolveApplicableCurriculum(trackVersions, { ...ctx, trackId: null, entryYear: 1405 }), 30, 'RESOLVED');
r('فقط نسخهٔ گرایش ۷ برای دانشجوی آزاد → NO_TRACK',
  resolveApplicableCurriculum([trackVersions[1]], { ...ctx, trackId: null, entryYear: 1405 }), null, 'NO_TRACK');

// isApplicableForStudent
eq('نسخهٔ فعالِ داخل پنجره', isApplicableForStudent(mk({ id: 1, majorId: 412, degreeLevelId: 1, versionCode: '1404', status: 'PUBLISHED', entryYearFrom: 1404 }), 1404), true);
eq('نسخهٔ پیش‌نویس هرگز', isApplicableForStudent(mk({ id: 1, majorId: 412, degreeLevelId: 1, versionCode: '1404', status: 'DRAFT', entryYearFrom: 1404 }), 1404), false);
eq('خارج از پنجره', isApplicableForStudent(mk({ id: 1, majorId: 412, degreeLevelId: 1, versionCode: '1404', status: 'PUBLISHED', entryYearFrom: 1404, entryYearTo: 1405 }), 1406), false);

// rankVersions مستقیم
eq('rank: R1 مقدم بر پایه', rankVersions(
  mk({ id: 11, majorId: 1, degreeLevelId: 1, versionCode: '1404-R1', status: 'PUBLISHED', entryYearFrom: 1404 }),
  mk({ id: 10, majorId: 1, degreeLevelId: 1, versionCode: '1404', status: 'PUBLISHED', entryYearFrom: 1404 })
) < 0, true);


// ─────────────────────── فاز ۵: قواعد مؤثر + سازگاری با ردیف Drizzle ───────────────────────
console.log('— فاز ۵: قواعد مؤثر و سازگاری ساختاری —');

// selectEffectiveRules: فقط قواعد سراسری + قواعدِ نسخهٔ حل‌شده
const dummyRules = [
  { courseId: 1, syllabusId: null, ruleType: 'PREREQ' },               // سراسری
  { courseId: 2, syllabusId: 10, ruleType: 'PREREQ' },                 // نسخهٔ حل‌شدهٔ ۱۰
  { courseId: 3, syllabusId: 99, ruleType: 'PREREQ' },                 // نسخهٔ دیگر (DRAFT یا غیرقابل اعمال) → نشت نمی‌کند
  { courseId: 4, syllabusId: 99, ruleType: 'COREQ' },                  // نوع دیگر → فیلتر ruleType
  { courseId: 5, syllabusId: null, ruleType: 'COREQ' },
];
const eff = selectEffectiveRules(dummyRules, 10, ['PREREQ']);
eq('قواعد سراسری PREREQ', eff.global.map(r => r.courseId), [1]);
eq('قواعد مقیّد به نسخهٔ حل‌شده', eff.scoped.map(r => r.courseId), [2]);
eq('نشت قاعدهٔ نسخهٔ دیگر (DRAFT) → هیچ', eff.scoped.some(r => r.courseId === 3), false);
eq('نشت COREQ در انتخاب PREREQ → هیچ', eff.global.some(r => r.courseId === 5), false);
eq('بدون نسخهٔ حل‌شده (null) → فقط سراسری', selectEffectiveRules(dummyRules, null, ['PREREQ']).scoped, []);

// سازگاری ساختاری: ردیف Drizzle -like (numeric به‌صورت string، تاریخ به‌صورت Date)
const drizzleLike = (p: Partial<ResolvableLike> & { id: number; majorId: number; degreeLevelId: number; versionCode: string; status: string; entryYearFrom: number }): ResolvableLike => ({
  trackId: null, entryYearTo: null, createdAt: new Date('2025-01-01'), updatedAt: new Date('2025-01-01'),
  title: 'برنامه', totalRequiredUnits: '140.0',
  ...p,
});
type ResolvableLike = {
  id: number; majorId: number; degreeLevelId: number; trackId: number | null;
  versionCode: string; status: string; entryYearFrom: number; entryYearTo: number | null;
  createdAt: Date; updatedAt: Date; totalRequiredUnits: string; title: string;
};

const rows = [
  drizzleLike({ id: 1, majorId: 412, degreeLevelId: 1, versionCode: '1400', status: 'ARCHIVED', entryYearFrom: 1400, entryYearTo: 1401 }),
  drizzleLike({ id: 2, majorId: 412, degreeLevelId: 1, versionCode: '1402', status: 'ARCHIVED', entryYearFrom: 1402, entryYearTo: 1403 }),
  drizzleLike({ id: 3, majorId: 412, degreeLevelId: 1, versionCode: '1404', status: 'PUBLISHED', entryYearFrom: 1404, entryYearTo: 1405 }),
  drizzleLike({ id: 4, majorId: 412, degreeLevelId: 1, versionCode: '1405', status: 'DRAFT', entryYearFrom: 1405 }),
];
r('ردیف Drizzle-like: ورودی ۱۴۰۳ → ۱۴۰۲', resolveApplicableCurriculum(rows, { majorId: 412, degreeLevelId: 1, trackId: null, entryYear: 1403 }), 2, 'RESOLVED');
r('ردیف Drizzle-like: ورودی ۱۴۰۴ → ۱۴۰۴', resolveApplicableCurriculum(rows, { majorId: 412, degreeLevelId: 1, trackId: null, entryYear: 1404 }), 3, 'RESOLVED');
r('ردیف Drizzle-like: ورودی ۱۴۰۶ → NO_ENTRY_WINDOW', resolveApplicableCurriculum(rows, { majorId: 412, degreeLevelId: 1, trackId: null, entryYear: 1406 }), null, 'NO_ENTRY_WINDOW');
eq('isApplicable با ردیف Drizzle-like (منتشرشده، داخل پنجره)', isApplicableForStudent(drizzleLike({ id: 3, majorId: 412, degreeLevelId: 1, versionCode: '1404', status: 'PUBLISHED', entryYearFrom: 1404 }), 1404), true);
eq('isApplicable با ردیف Drizzle-like (پیش‌نویس)', isApplicableForStudent(drizzleLike({ id: 4, majorId: 412, degreeLevelId: 1, versionCode: '1405', status: 'DRAFT', entryYearFrom: 1405 }), 1405), false);

console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
