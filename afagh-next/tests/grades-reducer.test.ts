/**
 * تست واحد gradesReducer + grades-core — بدون React و بدون دیتابیس
 *
 * اجرا:  npm test
 * هدف اصلی: تضمین این که قواعد ریاضی (سقف بارم، نمرهٔ نهایی از ۲۰، ایزوله‌سازی
 * درس مشترک) هرگز نقض نمی‌شوند — همان نقطه‌ای که در مگاکامپوننت قبلی با
 * useStateهای پراکنده مستعد باگ بود.
 */
import {
  gradesReducer,
  initialGradesState,
} from '../src/app/professor/grades/gradesReducer.ts';
import {
  RUBRIC_PRESETS,
  applyBonusToStudent,
  calculateFinalScore,
  canEditScore,
  clampScoreField,
  computeDistribution,
  isOfferingFinalized,
  isRubricValid,
  totalRubricOf,
} from '../src/app/professor/grades/grades-core.ts';
import type { GradingCourseOffering } from '../src/app/professor/grades/types.ts';

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
};

const offering = (over: Partial<GradingCourseOffering> = {}): GradingCourseOffering => ({
  id: 101,
  code: 'CE-302',
  title: 'سیستم‌های عامل',
  groupNumber: 1,
  units: 3,
  courseType: 'اصلی',
  isCoTaught: false,
  rubric: { midterm: 5, homework: 3, participation: 2, practical: 0, finalExam: 10 },
  students: [
    { studentId: 1, studentCode: '401123401', fullName: 'امیرحسین رضایی', midtermScore: 4.5, homeworkScore: 3, participationScore: 2, finalExamScore: 8.5, calculatedFinalScore: 18, status: 'TEMPORARY' },
    { studentId: 2, studentCode: '401123402', fullName: 'مریم کریمی', midtermScore: 2, homeworkScore: 1, participationScore: 1, finalExamScore: 5, calculatedFinalScore: 9, status: 'TEMPORARY' },
  ],
  appeals: [],
  ...over,
});

const coTaughtOffering = (): GradingCourseOffering => offering({
  isCoTaught: true,
  coTaughtDetails: {
    theoryProfName: 'دکتر محمد رضایی',
    theoryProfStaffCode: 'F-101',
    theoryWeightRatio: 0.6,
    theoryWeightMarks: 12,
    theorySigned: false,
    labProfName: 'مهندس زهرا احمدی',
    labProfStaffCode: 'F-102',
    labWeightRatio: 0.4,
    labWeightMarks: 8,
    labSigned: false,
    currentProfRole: 'THEORY',
  },
});

console.log('۱) قواعد بارم‌بندی');
eq('مجموع همهٔ الگوهای آماده دقیقاً ۲۰', ['STANDARD_THEORY', 'BALANCED', 'PRACTICAL_HEAVY', 'FINAL_HEAVY'].every(p => totalRubricOf(RUBRIC_PRESETS[p as keyof typeof RUBRIC_PRESETS]) === 20), true);
eq('بارم متعادل معتبر است', isRubricValid({ midterm: 5, homework: 3, participation: 2, practical: 0, finalExam: 10 }), true);
eq('بارم ۱۹ نامعتبر است', isRubricValid({ midterm: 5, homework: 3, participation: 2, practical: 0, finalExam: 9 }), false);
eq('کلمپ نمره به سقف بارم (میان‌ترم>بارم → بارم)', clampScoreField('midtermScore', 8, { midterm: 5, homework: 3, participation: 2, practical: 0, finalExam: 10 }), 5);
eq('کلمپ منفی → صفر', clampScoreField('finalExamScore', -3, RUBRIC_PRESETS.BALANCED), 0);
eq('نمرهٔ تئوری/عملی از ۲۰ است نه از بارم', clampScoreField('theoryProfScore', 17, RUBRIC_PRESETS.BALANCED), 17);

console.log('\n۲) محاسبهٔ نمرهٔ نهایی');
const base = offering();
eq('نمرهٔ نهایی = مجموع مؤلفه‌ها (کلمپ‌شده به بارم)', calculateFinalScore(base.students[0], base), 18);
eq('نمرهٔ نهایی هرگز از ۲۰ بیشتر نمی‌شود', calculateFinalScore({ ...base.students[0], midtermScore: 20, homeworkScore: 20, participationScore: 20, finalExamScore: 20 }, base), 20);
const co = coTaughtOffering();
eq('درس مشترک: ۶۰/۴۰ وزنی (۱۸ تئوری + ۱۰ عملی = ۱۴.۸)', calculateFinalScore({ ...co.students[0], theoryProfScore: 18, labProfScore: 10 }, co), 14.8);

console.log('\n۳) ایزوله‌سازی درس مشترک (Co-taught Validation)');
eq('استاد تئوری اجازهٔ تغییر نمرهٔ عملی را ندارد', canEditScore(co.students[0], co, 'labProfScore').ok, false);
eq('استاد تئوری اجازهٔ تغییر نمرهٔ تئوری را دارد', canEditScore(co.students[0], co, 'theoryProfScore').ok, true);
eq('استاد عملی اجازهٔ تغییر نمرهٔ تئوری را ندارد', canEditScore(co.students[0], { ...co, coTaughtDetails: { ...co.coTaughtDetails!, currentProfRole: 'LAB' } }, 'theoryProfScore').ok, false);
eq('درس غیرمشترک هیچ محدودیتی ندارد', canEditScore(base.students[0], base, 'finalExamScore').ok, true);

console.log('\n۴) ارفاق گروهی');
eq('ارفاق در درس غیرمشترک روی پایان‌ترم و سقف بارم (۱۸.۵ → ۱۰)', applyBonusToStudent({ ...base.students[0], finalExamScore: 18.5, calculatedFinalScore: 18 }, base, 0.5).finalExamScore, 10);
eq('ارفاق در نقش تئوری درس مشترک فقط روی نمرهٔ تئوری', applyBonusToStudent({ ...co.students[0], theoryProfScore: 18, labProfScore: 10 }, co, 1).theoryProfScore, 19);

console.log('\n۵) منطق قفل شدن');
eq('قفل وقتی همه FINALIZED', isOfferingFinalized(offering({ students: [ { ...offering().students[0], status: 'FINALIZED' }, { ...offering().students[1], status: 'FINALIZED' } ] })), true);
eq('قفل نشده وقتی TEMPORARY', isOfferingFinalized(base), false);
eq('درس مشترک فقط بعد از امضای هر دو بخش', isOfferingFinalized(co), false);
eq('درس مشترک با هر دو امضا قفل است', isOfferingFinalized({ ...co, coTaughtDetails: { ...co.coTaughtDetails!, theorySigned: true, labSigned: true } }), true);

console.log('\n۶) انتقال‌های reducer');
let s = initialGradesState([base, co], 101);
eq('تب پیش‌فرض ROSTER است', s.activeTab, 'ROSTER');
s = gradesReducer(s, { type: 'APPLY_RUBRIC_PRESET', payload: 'FINAL_HEAVY' });
eq('الگوی پایان‌ترم‌محور: سقف نمرهٔ میان‌ترم دانشجو به ۴ کلمپ شد', s.offerings[0].students[0].midtermScore, 4);
eq('قواعد جدید: مجموع ۲۰', totalRubricOf(s.offerings[0].rubric), 20);
s = gradesReducer(s, { type: 'UPDATE_STUDENT_SCORE', payload: { studentId: 1, field: 'midtermScore', value: 99 } });
eq('نمرهٔ ۹۹ به سقف بارم جدید (۴) کلمپ شد', s.offerings[0].students[0].midtermScore, 4);
s = gradesReducer(s, { type: 'SUBMIT_TEMPORARY' });
eq('ثبت موقت → وضعیت همه TEMPORARY', s.offerings[0].students.every(x => x.status === 'TEMPORARY'), true);
s = gradesReducer(s, { type: 'SIGN_OFFERING' });
eq('امضا → ارائه قفل (FINALIZED)', s.offerings[0].isFinalized, true);
eq('پس از قفل، ویرایش نمره بی‌اثر است', gradesReducer(s, { type: 'UPDATE_STUDENT_SCORE', payload: { studentId: 1, field: 'finalExamScore', value: 10 } }).offerings[0].students[0].finalExamScore, s.offerings[0].students[0].finalExamScore);

console.log('\n۷) توزیع فراوانی');
const dist = computeDistribution([{ ...base.students[0], calculatedFinalScore: 18 }, { ...base.students[1], calculatedFinalScore: 9 }]);
eq('عالی=۱، مردود=۱', { excellent: dist.excellent, fail: dist.fail }, { excellent: 1, fail: 1 });

console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
