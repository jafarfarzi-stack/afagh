/**
 * هستهٔ منطقی (Pure Core) ماژول نمرات استاد
 *
 * تمام قواعد ریاضی/حقوقی این‌جا به‌صورت توابع خالص نگه‌داری می‌شوند تا بدون
 * رندر React (و بدون دیتابیس) به‌صورت Unit Test قابل آزمایش باشند:
 *
 *     tsx tests/grades-reducer.test.ts
 *
 * شامل: سقف هر جزء نمره بر اساس بارم، محاسبهٔ نمرهٔ نهایی (با نسبت‌های دروس
 * مشترک)، ایزوله‌سازی سخت‌گیرانهٔ نمرات استاد تئوری/عملی، ارفاق گروهی،
 * توزیع فراوانی، و وضعیت قفل شدن درس.
 */
import type {
  GradingCourseOffering,
  RubricField,
  RubricPreset,
  RubricWeights,
  StudentGradeField,
  StudentGradeItem,
} from './types';

/** الگوهای آمادهٔ بارم‌بندی (مجموع هر کدام دقیقاً ۲۰) */
export const RUBRIC_PRESETS: Record<RubricPreset, RubricWeights> = {
  STANDARD_THEORY: { midterm: 6, homework: 4, participation: 0, practical: 0, finalExam: 10 },
  BALANCED:        { midterm: 5, homework: 3, participation: 2, practical: 0, finalExam: 10 },
  PRACTICAL_HEAVY: { midterm: 3, homework: 3, participation: 2, practical: 7, finalExam: 5 },
  FINAL_HEAVY:     { midterm: 4, homework: 0, participation: 0, practical: 0, finalExam: 16 },
};

export const DEFAULT_RUBRIC: RubricWeights = { midterm: 5, homework: 3, participation: 2, practical: 0, finalExam: 10 };

/** فیلدهای نمره‌ای که مستقیماً توسط استاد وارد می‌شوند */
export const SCORE_FIELDS: StudentGradeField[] = [
  'midtermScore', 'homeworkScore', 'participationScore', 'practicalScore',
  'finalExamScore', 'theoryProfScore', 'labProfScore',
];

/** سقف مجاز یک فیلد نمره بر اساس بارم درس */
export function rubricFieldMax(field: StudentGradeField, rubric: RubricWeights): number {
  switch (field) {
    case 'midtermScore':       return rubric.midterm;
    case 'homeworkScore':      return rubric.homework;
    case 'participationScore': return rubric.participation;
    case 'practicalScore':     return rubric.practical;
    case 'finalExamScore':     return rubric.finalExam;
    default:                   return 20; // theoryProfScore / labProfScore از ۲۰
  }
}

export function totalRubricOf(rubric: RubricWeights): number {
  return (Number(rubric.midterm) || 0) + (Number(rubric.homework) || 0) +
    (Number(rubric.participation) || 0) + (Number(rubric.practical) || 0) +
    (Number(rubric.finalExam) || 0);
}

export const isRubricValid = (rubric: RubricWeights): boolean => totalRubricOf(rubric) === 20;

/** قفل شدن درس (همهٔ نمرات قطعی / امضای هر دو بخش درس مشترک) */
export function isOfferingFinalized(offering: GradingCourseOffering | undefined): boolean {
  if (!offering) return false;
  if (offering.isFinalized) return true;
  if (offering.isCoTaught && offering.coTaughtDetails) {
    return offering.coTaughtDetails.theorySigned && offering.coTaughtDetails.labSigned;
  }
  return offering.students.length > 0 && offering.students.every(s => s.status === 'FINALIZED');
}

/**
 * کنترل دسترسی دقیق در درس‌های مشترک (Co-taught Validation):
 * استاد تئوری فقط فیلد theoryProfScore و استاد عملی فقط labProfScore را می‌تواند ویرایش کند.
 */
export function canEditScore(
  st: StudentGradeItem,
  offering: GradingCourseOffering,
  field: StudentGradeField
): { ok: true } | { ok: false; reason: string } {
  if (!offering.isCoTaught || !offering.coTaughtDetails) return { ok: true };
  const role = offering.coTaughtDetails.currentProfRole;
  if (role === 'THEORY' && field === 'labProfScore') {
    return { ok: false, reason: 'شما به عنوان استاد بخش تئوری وارد شده‌اید و اجازه ویرایش نمره عملی استاد همکار را ندارید.' };
  }
  if (role === 'LAB' && field === 'theoryProfScore') {
    return { ok: false, reason: 'شما به عنوان استاد بخش عملی وارد شده‌اید و اجازه ویرایش نمره تئوری استاد همکار را ندارید.' };
  }
  return { ok: true };
}

/** مقدار یک فیلد نمره (با کلمپ به سقف بارم) */
export function clampScoreField(
  field: StudentGradeField,
  value: number,
  rubric: RubricWeights
): number | undefined {
  if (value === undefined || Number.isNaN(value)) return undefined;
  const max = rubricFieldMax(field, rubric);
  return Math.max(0, Math.min(max, value));
}

/** محاسبهٔ نمرهٔ نهایی از ۲۰ (با نسبت وزنی برای دروس مشترک) */
export function calculateFinalScore(st: StudentGradeItem, offering: GradingCourseOffering): number {
  if (offering.isCoTaught && offering.coTaughtDetails) {
    const theory = st.theoryProfScore ?? 0;
    const lab = st.labProfScore ?? 0;
    const calc = theory * offering.coTaughtDetails.theoryWeightRatio +
      lab * offering.coTaughtDetails.labWeightRatio;
    return Math.min(20, Math.round(calc * 100) / 100);
  }
  const m = Math.min(offering.rubric.midterm, st.midtermScore ?? 0);
  const h = Math.min(offering.rubric.homework, st.homeworkScore ?? 0);
  const p = Math.min(offering.rubric.participation, st.participationScore ?? 0);
  const pr = Math.min(offering.rubric.practical, st.practicalScore ?? 0);
  const f = Math.min(offering.rubric.finalExam, st.finalExamScore ?? 0);
  return Math.min(20, Math.round((m + h + p + pr + f) * 100) / 100);
}

/** اعمال یک نمره روی دانشجو → بازگرداندن دانشجوی به‌روز شده (با محاسبهٔ مجدد نهایی) */
export function applyScoreToStudent(
  st: StudentGradeItem,
  offering: GradingCourseOffering,
  field: StudentGradeField,
  value: number | undefined
): StudentGradeItem {
  const clamped = clampScoreField(field, value ?? 0, offering.rubric);
  const updated: StudentGradeItem = { ...st, [field]: clamped };
  updated.calculatedFinalScore = calculateFinalScore(updated, offering);
  return updated;
}

/** کلمپ همهٔ نمرات دانشجویان یک درس به بارم جدید (هنگام تغییر بارم) */
export function clampAllStudentsToRubric(
  offering: GradingCourseOffering,
  newRubric: RubricWeights
): StudentGradeItem[] {
  return offering.students.map(st => {
    const withRubric: GradingCourseOffering = { ...offering, rubric: newRubric };
    const clamped: StudentGradeItem = { ...st };
    for (const f of SCORE_FIELDS) {
      if (clamped[f] === undefined) continue;
      clamped[f] = clampScoreField(f, clamped[f] as number, newRubric);
    }
    clamped.calculatedFinalScore = calculateFinalScore(clamped, withRubric);
    return clamped;
  });
}

/** ارفاق/نمرهٔ تشویقی گروهی — فقط روی فیلد نمرهٔ مجاز استاد فعلی */
export function applyBonusToStudent(
  st: StudentGradeItem,
  offering: GradingCourseOffering,
  bonus: number
): StudentGradeItem {
  let updated: StudentGradeItem = { ...st };
  if (offering.isCoTaught && offering.coTaughtDetails) {
    const role = offering.coTaughtDetails.currentProfRole;
    const field: StudentGradeField | null = role === 'THEORY' ? 'theoryProfScore' : 'labProfScore';
    if (field) {
      const cur = updated[field] ?? 0;
      updated = { ...updated, [field]: Math.min(20, cur + bonus) };
    }
  } else {
    const cur = updated.finalExamScore ?? 0;
    updated = {
      ...updated,
      finalExamScore: Math.min(offering.rubric.finalExam, cur + bonus),
    };
  }
  updated.calculatedFinalScore = calculateFinalScore(updated, offering);
  return updated;
}

/** توزیع فراوانی نمرات (برای تب تحلیل) */
export function computeDistribution(students: StudentGradeItem[]) {
  let excellent = 0; // 17 - 20
  let good = 0;      // 14 - 16.99
  let fair = 0;      // 10 - 13.99
  let fail = 0;      // < 10
  students.forEach(s => {
    const g = s.calculatedFinalScore;
    if (g === undefined) return;
    if (g >= 17) excellent++;
    else if (g >= 14) good++;
    else if (g >= 10) fair++;
    else fail++;
  });
  return { excellent, good, fair, fail };
}

/** آمار کلی درس */
export function computeClassStats(students: StudentGradeItem[]) {
  const passed = students.filter(s => (s.calculatedFinalScore ?? 0) >= 10).length;
  const failed = students.filter(s => s.calculatedFinalScore !== undefined && s.calculatedFinalScore < 10).length;
  const average = students.length > 0
    ? Number((students.reduce((acc, s) => acc + (s.calculatedFinalScore ?? 0), 0) / students.length).toFixed(2))
    : 0;
  return { passed, failed, average };
}

/** ساخت هش ممیزی نمرات (برای gradesHash — ضد دستکاری تاریخچه) */
export function computeGradesHash(offering: GradingCourseOffering): string {
  // در production از sha256 روی رکورد قبلی زنجیره می‌شود؛ این‌جا چک‌سام سادهٔ قطعی
  const payload = offering.students
    .map(s => `${s.studentId}:${s.calculatedFinalScore ?? '-'}:${s.status}`)
    .sort()
    .join('|');
  let hash = 5381;
  for (let i = 0; i < payload.length; i++) {
    hash = ((hash << 5) + hash + payload.charCodeAt(i)) >>> 0;
  }
  return 'AF-GH-' + hash.toString(16).toUpperCase().padStart(8, '0');
}

/** فیلتر جستجوی دانشجو */
export function filterStudents(
  students: StudentGradeItem[],
  query: string
): StudentGradeItem[] {
  if (!query.trim()) return students;
  const q = query.trim().toLowerCase();
  return students.filter(s => s.fullName.toLowerCase().includes(q) || s.studentCode.includes(q));
}

/** برچسب وضعیت نمره */
export const GRADE_STATUS_LABEL: Record<StudentGradeItem['status'], string> = {
  DRAFT: 'پیش‌نویس',
  TEMPORARY: 'موقت',
  FINALIZED: 'قطعی',
  APPEALED: 'اعتراض',
};
