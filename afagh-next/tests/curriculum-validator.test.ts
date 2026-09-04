/**
 * تست هستهٔ اعتبارسنجی برنامهٔ درسی — بدون React و بدون DB (فاز ۳)
 *
 * اجرا: npm test
 * پوشش: پوشش واحد الزامی، ارجاع پیش‌نیاز به بانک دروس، حلقهٔ دورانی،
 * ترتیب ترمی پیش‌نیاز، هم‌نیازها (در نسخه/هم‌ترم)، پوشش فارغ‌التحصیلی،
 * و رفتار گیت تأیید (ERROR = مانع، WARN = قابل تأیید).
 */
import {
  validateCurriculumCore,
  hasBlockingErrors,
  type CurriculumCheckInput,
} from '../src/lib/curriculum-validator.ts';

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
};
const hasCheck = (results: { check: string; severity: string }[], check: string, severity?: string) =>
  results.some((r) => r.check === check && (severity ? r.severity === severity : true));

// ── ورودی‌های پایه ──
const baseInput = (over?: Partial<CurriculumCheckInput>): CurriculumCheckInput => ({
  // مجموع دروس الزامی CORE/MAJOR: ساختمان داده ۴ + الگوریتم ۳ = ۷
  totalRequiredUnits: 7,
  courses: [
    { courseId: 1, code: 'MA101', title: 'ریاضی ۱', units: 3, roleType: 'GENERAL', isRequired: 1, isElective: 0, isGraduationRequired: 0, recommendedSemester: 1, autoCorequisiteAllowed: 0 },
    { courseId: 2, code: 'CS201', title: 'ساختمان داده', units: 4, roleType: 'CORE', isRequired: 1, isElective: 0, isGraduationRequired: 1, recommendedSemester: 3, autoCorequisiteAllowed: 0 },
    { courseId: 3, code: 'CS301', title: 'الگوریتم', units: 3, roleType: 'MAJOR', isRequired: 1, isElective: 0, isGraduationRequired: 1, recommendedSemester: 4, autoCorequisiteAllowed: 0 },
    { courseId: 4, code: 'CS401', title: 'پایان‌نامه', units: 6, roleType: 'THESIS', isRequired: 1, isElective: 0, isGraduationRequired: 0, recommendedSemester: 8, autoCorequisiteAllowed: 0 },
    { courseId: 5, code: 'EL101', title: 'اختیاری', units: 2, roleType: 'ELECTIVE', isRequired: 0, isElective: 1, isGraduationRequired: 0, recommendedSemester: 5, autoCorequisiteAllowed: 0 },
  ],
  rules: [],
  existingCodes: new Set(['MA101', 'CS201', 'CS301', 'CS401', 'EL101', 'PH101']),
  ...over,
});

console.log('— هستهٔ اعتبارسنجی برنامهٔ درسی —');

// ۱) پوشش واحد
const okUnits = validateCurriculumCore(baseInput());
eq('پوشش واحد: بدون یافته (۷ = ۷)', hasCheck(okUnits, 'UNITS_COVER_MIN'), false);

const lowUnits = validateCurriculumCore(baseInput({ totalRequiredUnits: 200 }));
eq('پوشش واحد: ۷ واحد از ۲۰۰ → ERROR', hasCheck(lowUnits, 'UNITS_COVER_MIN', 'ERROR'), true);
eq('affected شامل کد دروس الزامی است', (lowUnits.find(r => r.check === 'UNITS_COVER_MIN')?.affected ?? []).includes('CS201'), true);

const onlyOptional = validateCurriculumCore(baseInput({ totalRequiredUnits: 7, courses: baseInput().courses.map(c => ({ ...c, isRequired: 0 })) }));
eq('پوشش واحد: هیچ درس الزامی‌ای → ERROR', hasCheck(onlyOptional, 'UNITS_COVER_MIN', 'ERROR'), true);

// ۲) ارجاع به بانک دروس
const badRef = validateCurriculumCore(baseInput({
  rules: [{ courseId: 2, ruleType: 'PREREQ', logicTree: { operator: 'AND', conditions: [{ course: 'ZZ999' }, { course: 'MA101' }] } }],
}));
eq('ارجاع ناموجود → ERROR', hasCheck(badRef, 'PREREQ_REFERENCES_VALID', 'ERROR'), true);
eq('affected شامل ZZ999', (badRef.find(r => r.check === 'PREREQ_REFERENCES_VALID')?.affected ?? []).includes('ZZ999'), true);

const goodRef = validateCurriculumCore(baseInput({
  rules: [{ courseId: 2, ruleType: 'PREREQ', logicTree: { operator: 'OR', conditions: [{ course: 'MA101', minGrade: 12 }, { course: 'PH101' }] } }],
}));
eq('ارجاع معتبر → بدون یافته', hasCheck(goodRef, 'PREREQ_REFERENCES_VALID'), false);

// ۳) حلقهٔ دورانی
const cyclic = validateCurriculumCore(baseInput({
  rules: [
    { courseId: 2, ruleType: 'PREREQ', logicTree: { operator: 'AND', conditions: [{ course: 'CS301' }] } }, // CS201 ← CS301
    { courseId: 3, ruleType: 'PREREQ', logicTree: { operator: 'AND', conditions: [{ course: 'CS201' }] } }, // CS301 ← CS201 (دور!)
  ],
}));
eq('حلقهٔ دورانی → ERROR', hasCheck(cyclic, 'PREREQ_CYCLE_FREE', 'ERROR'), true);

const acyclic = validateCurriculumCore(baseInput({
  rules: [
    { courseId: 2, ruleType: 'PREREQ', logicTree: { operator: 'AND', conditions: [{ course: 'MA101' }] } },
    { courseId: 3, ruleType: 'PREREQ', logicTree: { operator: 'AND', conditions: [{ course: 'CS201' }] } },
  ],
}));
eq('گراف بدون دور → بدون یافته', hasCheck(acyclic, 'PREREQ_CYCLE_FREE'), false);

// ۴) ترتیب ترمی
const semOrder = validateCurriculumCore(baseInput({
  rules: [{ courseId: 2, ruleType: 'PREREQ', logicTree: { operator: 'AND', conditions: [{ course: 'CS401' }] } }], // CS401 (ترم ۸) پیش‌نیاز CS201 (ترم ۳)
}));
eq('پیش‌نیاز در ترم دیرتر → WARN', hasCheck(semOrder, 'PREREQ_SEMESTER_ORDER', 'WARN'), true);

// ۵) هم‌نیاز
const coreqMissing = validateCurriculumCore(baseInput({
  rules: [{ courseId: 3, ruleType: 'COREQ', logicTree: { operator: 'AND', conditions: [{ course: 'ZZ999' }] } }],
}));
eq('هم‌نیاز خارج از نسخه → WARN', hasCheck(coreqMissing, 'COREQ_PRESENT', 'WARN'), true);

const coreqWrongSem = validateCurriculumCore(baseInput({
  rules: [{ courseId: 3, ruleType: 'COREQ', logicTree: { operator: 'AND', conditions: [{ course: 'CS201' }] } }], // CS201 ترم ۳، الگوریتم ترم ۴
}));
eq('هم‌نیاز با ترم متفاوت → WARN', hasCheck(coreqWrongSem, 'COREQ_PRESENT', 'WARN'), true);

const coreqAutoOk = validateCurriculumCore(baseInput({
  courses: baseInput().courses.map(c => c.courseId === 3 ? { ...c, autoCorequisiteAllowed: 1 } : c),
  rules: [{ courseId: 3, ruleType: 'COREQ', logicTree: { operator: 'AND', conditions: [{ course: 'CS201' }] } }],
}));
eq('هم‌نیاز خودکار مجاز (ترم آخر) → بدون یافته', hasCheck(coreqAutoOk, 'COREQ_PRESENT'), false);

const coreqSameSem = validateCurriculumCore(baseInput({
  courses: baseInput().courses.map(c => c.courseId === 3 ? { ...c, recommendedSemester: 3 } : c),
  rules: [{ courseId: 3, ruleType: 'COREQ', logicTree: { operator: 'AND', conditions: [{ course: 'CS201' }] } }],
}));
eq('هم‌نیاز هم‌ترم → بدون یافته', hasCheck(coreqSameSem, 'COREQ_PRESENT'), false);

// ۶) پوشش فارغ‌التحصیلی
eq('دو درس الزامی فارغ‌التحصیلی → بدون یافته', hasCheck(okUnits, 'GRADUATION_COVERAGE'), false);
const noGrad = validateCurriculumCore(baseInput({
  courses: baseInput().courses.map(c => ({ ...c, isGraduationRequired: 0 })),
}));
eq('هیچ درس فارغ‌التحصیلی → ERROR', hasCheck(noGrad, 'GRADUATION_COVERAGE', 'ERROR'), true);

// ۷) گیت تأیید
eq('گیت: ERROR ها مانع‌اند', hasBlockingErrors(noGrad), true);
// PH101 در بانک هست ولی در نسخه نیست → فقط WARN (هم‌نیاز)، نه ERROR ارجاع
eq('گیت: فقط WARN مانع نیست', hasBlockingErrors(validateCurriculumCore(baseInput({
  rules: [{ courseId: 2, ruleType: 'COREQ', logicTree: { operator: 'AND', conditions: [{ course: 'PH101' }] } }],
}))), false);
eq('گیت: نسخهٔ سالم آزاد است', hasBlockingErrors(okUnits), false);

console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
