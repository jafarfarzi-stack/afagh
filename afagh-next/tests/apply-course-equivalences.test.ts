/**
 * ════════════════════════════════════════════════════════════════════════
 *  تستِ رانرِ اعمالِ معادل‌سازی‌ها — منطقِ خالصِ scripts/lib/apply-course-equivalences.mjs
 *
 *  شش بخش:
 *   ۱) انتخابِ کدِ سمای ۱۶ با شاهدِ جدولِ مرجع (passed ولی بدون احتساب در معدل)
 *   ۲) قاعدهٔ «قبول» دقیقاً مثلِ موتورها (gradeStatus + کدِ سما/نمره)
 *   ۳) نگهبان‌ها: (i) کلید courseId نه عنوان، (ii) idempotency، (iii) درسِ
 *      ناموجود، (iv) نمرهٔ ناقبول، (v) دو ردیفِ آفاقِ یک نفر
 *   ۴) CSVِ برنامه
 *   ۵) اثرِ GPA: واحد می‌دهد، معدل نه (هر دو موتور)
 * ════════════════════════════════════════════════════════════════════════
 */
import {
  EQUIV_SAMA_CODE,
  EQUIV_GRADE_STATUS,
  EQUIV_ENROLL_STATUS,
  EQUIV_TERM_TYPE,
  EQUIV_OFFERING_TYPE,
  VERDICTS,
  BLOCKED_VERDICTS,
  PASSED_SAMA_CODES,
  isPassedSamaCode,
  isPassedEnrollment,
  passThreshold,
  buildPlan,
  summarizePlan,
  planToCsv,
  PLAN_COLUMNS,
} from '../scripts/lib/apply-course-equivalences.mjs';
import {
  GRADE_STATUS_CODES,
  NON_GPA_PASS_CODES,
  rowCountsTowardGpa,
} from '../src/lib/grade-status-codes.ts';
import {
  aggregateAuditTranscript,
  aggregateOfficialGpaRows,
} from '../src/lib/gpa-aggregation.ts';

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);
  }
};
const okT = (name: string, v: unknown) => eq(name, Boolean(v), true);
const okF = (name: string, v: unknown) => eq(name, Boolean(v), false);

// ── ۱) کدِ سمای ۱۶ با شاهدِ جدول ──────────────────────────────────────────
console.log('\n--- ۱. کدِ سمای ردیفِ انتقالی ---');
const c16 = GRADE_STATUS_CODES.find((g) => g.code === '16');
eq('کدِ رانر همان ۱۶ است', EQUIV_SAMA_CODE, '16');
eq('عنوانِ ۱۶ در جدولِ مرجع', c16?.title, 'در معادل سازي پذيرفته شده بدون احتساب معدل');
eq('۱۶ قبول است (واحد می‌دهد)', c16?.passed, true);
eq('۱۶ در معدلِ کل اثر ندارد', c16?.affectsGpa, false);
eq('۱۶ در معدلِ نیمسال اثر ندارد', c16?.affectsTermGpa, false);
okT('۱۶ در مجموعهٔ قبولیِ بدون احتساب است', NON_GPA_PASS_CODES.has('16'));
okF('rowCountsTowardGpa برای ۱۶', rowCountsTowardGpa({ samaGradeStatusCode: '16', courseAffectsGpa: 1, gradingType: 'NUMERIC' }));
okT('rowCountsTowardGpa برای کدِ عادیِ ۱', rowCountsTowardGpa({ samaGradeStatusCode: '1', courseAffectsGpa: 1, gradingType: 'NUMERIC' }));
eq('gradeStatusِ ردیفِ انتقالی', EQUIV_GRADE_STATUS, 'FINALIZED');
eq('statusِ ردیفِ انتقالی (قراردادِ engine)', EQUIV_ENROLL_STATUS, 'EQUIV_PASSED');
eq('نوعِ ترمِ هدف (قراردادِ engine)', EQUIV_TERM_TYPE, 'EQUIVALENCE');
eq('نوعِ ارائهٔ هدف (قراردادِ engine)', EQUIV_OFFERING_TYPE, 'TRANSFER');

// آینهٔ PASSED_SAMA_CODES با جدولِ مرجع یکی است (نه بیشتر، نه کمتر)
const tablePassed = new Set(GRADE_STATUS_CODES.filter((g) => g.passed).map((g) => g.code));
eq('آینهٔ کدهای قبولی با جدول یکی است',
  [...PASSED_SAMA_CODES].sort(), [...tablePassed].sort());

// ── ۲) قاعدهٔ «قبول» ─────────────────────────────────────────────────────
console.log('\n--- ۲. قاعدهٔ قبولِ موتورها ---');
const R = (o: Record<string, unknown>) => ({
  gradeValue: null, gradeStatus: 'FINALIZED', samaGradeStatusCode: null,
  gradingType: 'NUMERIC', minPassedMark: null, regulationPassing: 10, ...o,
});
okT('FINALIZED با ۱۵٫۵', isPassedEnrollment(R({ gradeValue: '15.50' })));
okF('FINALIZED با ۸', isPassedEnrollment(R({ gradeValue: 8 })));
okF('FINALIZED بدونِ نمره و بدونِ کد', isPassedEnrollment(R({})));
okF('PENDING با ۱۸ قبول نیست (گیتِ وضع)', isPassedEnrollment(R({ gradeStatus: 'PENDING', gradeValue: 18 })));
okT('EXEMPT بدونِ نمره قبول است', isPassedEnrollment(R({ gradeStatus: 'EXEMPT' })));
okT('PASSED_NO_GRADE بدونِ نمره قبول است', isPassedEnrollment(R({ gradeStatus: 'PASSED_NO_GRADE' })));
okT('کدِ قبولیِ سما نمرهٔ پایین را پوشش می‌دهد (FINALIZED/۵ با کدِ ۱)',
  isPassedEnrollment(R({ gradeValue: 5, samaGradeStatusCode: '1' })));
okF('کدِ مردودیِ سما (۲ با ۰) قبول نیست', isPassedEnrollment(R({ gradeValue: '0.00', samaGradeStatusCode: '2' })));
okF('حذفِ شورا (۷ بدونِ نمره) قبول نیست — همان پرشِ prod',
  isPassedEnrollment(R({ gradeValue: null, samaGradeStatusCode: '7' })));
okT('توصیفی با ۱', isPassedEnrollment(R({ gradingType: 'DESCRIPTIVE', gradeValue: 1 })));
okF('توصیفی با ۱۵ قبول نیست', isPassedEnrollment(R({ gradingType: 'DESCRIPTIVE', gradeValue: 15 })));
okF('کفِ خاصِ درس (۱۲) با ۱۱', isPassedEnrollment(R({ gradeValue: 11, minPassedMark: 12 })));
okT('کفِ خاصِ درس (۱۲) با ۱۲', isPassedEnrollment(R({ gradeValue: 12, minPassedMark: 12 })));
eq('حدِ درس: minPassedMark معتبر', passThreshold('12', 10), 12);
eq('حدِ درس: بدونِ minPassedMark ⇒ کفِ آیین‌نامه', passThreshold(null, 14), 14);
eq('حدِ درس: همه خالی ⇒ ۱۰', passThreshold(null, null), 10);
okT('isPassedSamaCode با فاصله', isPassedSamaCode(' 16 '));
okF('isPassedSamaCode روی تهی', isPassedSamaCode(null));

// ── ۳) نگهبان‌ها ─────────────────────────────────────────────────────────
console.log('\n--- ۳. نگهبان‌های planner ---');
const EQ = (o: Record<string, unknown> = {}) => ({
  id: 1, universityIdA: 1, courseIdA: 100, universityIdB: 2, courseIdB: 200, matchMethod: 'TITLE_EXACT', ...o,
});
const PAIR = { afStudentId: 10, localStudentId: 20, universityIdB: 2 };
const AF = (o: Record<string, unknown> = {}) => ({
  enrollmentId: 1000, studentId: 10, courseId: 100, gradeValue: '16.00',
  gradeStatus: 'FINALIZED', samaGradeStatusCode: null, gradingType: 'NUMERIC',
  minPassedMark: null, regulationPassing: 10, ...o,
});
const COURSES = new Map([
  [100, { universityId: 1 }],
  [200, { universityId: 2 }],
  [201, { universityId: 2 }],
]);
const base = {
  equivalences: [EQ()], pairs: [PAIR], afaghRows: [AF()],
  localRows: [], coursesById: COURSES, appliedSourceIds: new Set<number>(),
};

// (i) عنوانِ یکسان با courseId متفاوت، مسدود نمی‌کند؛ همان courseId مسدود می‌کند
{
  const sameTitleOtherCourse = [{
    enrollmentId: 2000, studentId: 20, courseId: 201, gradeValue: '18',
    gradeStatus: 'FINALIZED', samaGradeStatusCode: null, gradingType: 'NUMERIC',
    minPassedMark: null, regulationPassing: 10,
  }];
  const p1 = buildPlan({ ...base, localRows: sameTitleOtherCourse });
  eq('(i) پاس در courseId دیگر جلوی APPLY را نمی‌گیرد', p1[0].verdict, VERDICTS.APPLY);
  const sameCourse = [{
    ...sameTitleOtherCourse[0], courseId: 200,
  }];
  const p2 = buildPlan({ ...base, localRows: sameCourse });
  eq('(i) پاس در همان courseIdB ⇒ ALREADY_PASSED_LOCAL', p2[0].verdict, VERDICTS.ALREADY_PASSED_LOCAL);
}

// (ii) اجرای دوباره no-op است
{
  const p1 = buildPlan(base);
  eq('(ii) بارِ اول APPLY', p1[0].verdict, VERDICTS.APPLY);
  const p2 = buildPlan({ ...base, appliedSourceIds: new Set([1000]) });
  eq('(ii) بارِ دوم ALREADY_APPLIED', p2[0].verdict, VERDICTS.ALREADY_APPLIED);
  eq('(ii) اجرای دوباره هیچ APPLY ندارد',
    (summarizePlan(p2) as unknown as { by: Record<string, number> }).by[String(VERDICTS.APPLY)], 0);
}

// (iii) درسِ ناموجود ⇒ NO_LOCAL_COURSE (مسدود، نه crash)
{
  const missing = buildPlan({
    ...base,
    equivalences: [EQ({ courseIdB: 999 })],
  });
  eq('(iii) درسِ ناموجود ⇒ NO_LOCAL_COURSE', missing[0].verdict, VERDICTS.NO_LOCAL_COURSE);
  okT('(iii) NO_LOCAL_COURSE مسدود است', BLOCKED_VERDICTS.has(VERDICTS.NO_LOCAL_COURSE));
  const wrongUni = buildPlan({
    ...base, coursesById: new Map([[100, { universityId: 1 }], [200, { universityId: 4 }]]),
  });
  eq('(iii) درسِ دانشگاهِ دیگر ⇒ NO_LOCAL_COURSE', wrongUni[0].verdict, VERDICTS.NO_LOCAL_COURSE);
}

// (iv) نمرهٔ ناقبول ⇒ SKIP، نه خطا
{
  const p = buildPlan({ ...base, afaghRows: [AF({ gradeValue: 8 })] });
  eq('(iv) نمرهٔ ۸ ⇒ SKIPPED_NOT_PASSED', p[0].verdict, VERDICTS.SKIPPED_NOT_PASSED);
  const p7 = buildPlan({ ...base, afaghRows: [AF({ gradeValue: null, samaGradeStatusCode: '7' })] });
  eq('(iv) کدِ ۷ ⇒ SKIPPED_NOT_PASSED', p7[0].verdict, VERDICTS.SKIPPED_NOT_PASSED);
}

// (v) دو ردیفِ آفاقِ یک نفر ⇒ فقط یک APPLY
{
  const two = [
    AF({ enrollmentId: 1001, gradeValue: '15' }),
    AF({ enrollmentId: 1002, gradeValue: '17' }),
  ];
  const p = buildPlan({ ...base, afaghRows: two });
  type PV = { verdict: string; afaghEnrollmentId: number };
  eq('(v) یکی APPLY', p.filter((r: PV) => r.verdict === String(VERDICTS.APPLY)).length, 1);
  eq('(v) دیگری DUP_COURSE_IN_PLAN', p.filter((r: PV) => r.verdict === String(VERDICTS.DUP_COURSE_IN_PLAN)).length, 1);
  // و «اولی» قطعی است: کمترین enrollmentId
  eq('(v) اولی قطعی است', p.find((r: PV) => r.verdict === String(VERDICTS.APPLY))?.afaghEnrollmentId, 1001);
}

// fan-in: دو معادل به یک مقصد — فقط یکی می‌نشیند (کلید courseIdB)
{
  const p = buildPlan({
    ...base,
    equivalences: [EQ({ id: 1, courseIdA: 100 }), EQ({ id: 2, courseIdA: 101 })],
    afaghRows: [AF({ enrollmentId: 1001, courseId: 100 }), AF({ enrollmentId: 1002, courseId: 101 })],
    coursesById: new Map([[100, { universityId: 1 }], [101, { universityId: 1 }], [200, { universityId: 2 }]]),
  });
  eq('(fan-in) فقط یک APPLY روی courseIdB', p.filter((r: { verdict: string }) => r.verdict === String(VERDICTS.APPLY)).length, 1);
}

// ترتیبِ قطعیِ خروجی
{
  const p = buildPlan({
    ...base,
    equivalences: [EQ({ id: 5 }), EQ({ id: 3 })],
    afaghRows: [AF({ enrollmentId: 1001, courseId: 100 }), AF({ enrollmentId: 1002, courseId: 100 })],
  });
  eq('ترتیبِ قطعی (equivId، بعد enrollmentId)',
    p.map((r) => [r.equivalenceId, r.afaghEnrollmentId]), [[3, 1001], [3, 1002], [5, 1001], [5, 1002]]);
}

eq('خلاصهٔ شمارش', summarizePlan(buildPlan(base)), {
  total: 1, by: {
    APPLY: 1, SKIPPED_NOT_PASSED: 0, ALREADY_APPLIED: 0,
    ALREADY_PASSED_LOCAL: 0, NO_LOCAL_COURSE: 0, DUP_COURSE_IN_PLAN: 0,
    BLOCKED_NO_TERM: 0,
  },
});

// ── ۴) CSV ───────────────────────────────────────────────────────────────
console.log('\n--- ۴. CSV برنامه ---');
{
  const csv = planToCsv(buildPlan(base));
  const lines = csv.trim().split('\n');
  eq('سرستون‌ها', lines[0], PLAN_COLUMNS.join(','));
  eq('یک سطرِ داده', lines.length, 2);
  okT('حکم در CSV هست', lines[1].startsWith('APPLY,'));
}

// ── ۴ب) ترمِ مبدأ در برنامه ─────────────────────────────────────────────
console.log('\n--- ۴ب. کد ترم آفاق در برنامه ---');
{
  const p = buildPlan({ ...base, afaghRows: [AF({ termCode: '14041', termTitle: 'نیمسال ۴۰۴۱' })] });
  eq('کد ترم آفاق حمل می‌شود', p[0].afaghTermCode, '14041');
  eq('عنوان ترم آفاق حمل می‌شود', p[0].afaghTermTitle, 'نیمسال ۴۰۴۱');
  const q = buildPlan(base);
  eq('بدون ترم: null و برنامه همچنان APPLY (بررسی ترم در لحظهٔ درج)', q[0].afaghTermCode ?? null, null);
  eq('بدون ترم: حکم همچنان APPLY', q[0].verdict, 'APPLY');
  const csv2 = planToCsv(p);
  okT('ستون afagh_term_code در CSV هست', csv2.trim().split('\n')[0].split(',').includes('afagh_term_code'));
}

// ── ۵) اثرِ GPA ──────────────────────────────────────────────────────────
console.log('\n--- ۵. واحد می‌دهد، معدل نه ---');
{
  const mkRow = (code: string | null, grade: number | null, units = 3) => ({
    courseId: 200, code: 'X', units, gradeValue: grade, gradeStatus: 'FINALIZED',
    samaGradeStatusCode: code, gradingType: 'NUMERIC', affectsGpa: 1, courseMinMark: null,
  });
  const before = [mkRow('1', 16), mkRow('1', 14)];
  const after = [...before, mkRow('16', 20)];
  const g0 = aggregateAuditTranscript(before, 10);
  const g1 = aggregateAuditTranscript(after, 10);
  eq('معدلِ فارغ‌التحصیلی ثابت', g1.gpa, g0.gpa);
  eq('واحدِ گذرانده +۳', g1.passedUnits, g0.passedUnits + 3);
  const o0 = aggregateOfficialGpaRows(before, { passingGrade: 10, retakeMinGrade: 10, policy: 'EXCLUDE_IF_PASSED', dedupeRepeated: false });
  const o1 = aggregateOfficialGpaRows(after, { passingGrade: 10, retakeMinGrade: 10, policy: 'EXCLUDE_IF_PASSED', dedupeRepeated: false });
  eq('معدلِ رسمی ثابت', o1.gpa, o0.gpa);
  eq('واحدِ رسمی +۳', o1.passedUnits, o0.passedUnits + 3);
}

console.log(`\n${fail === 0 ? '✓' : '✗'} نتیجه: ${pass} موفق | ${fail} شکست`);
if (fail > 0) process.exitCode = 1;
