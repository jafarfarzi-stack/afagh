/**
 * هستهٔ خالص (Pure Core) موتور چرخهٔ امتحانات
 *
 * دقیقاً همان منطقی که در برابر تزریق SQL و نقض بارم محافظت می‌کند، این‌جا
 * بدون وابستگی به دیتابیس/سرور نگه داشته شده تا بتوان آن را مستقیم و در CI
 * تست واحد کرد:
 *
 *     tsx tests/exam-core.test.ts
 *
 * ── چرا مهم است: اعتبارسنجی ورودی مراقب (method/مقادیر عددی) خط اول دفاع
 * در برابر SQL Injection است؛ اگر این‌جا رد شود، هیچ رشته‌ای به کوئری نمی‌رسد.
 */
import { calculateFinalScore } from '@/app/professor/grades/grades-core';
import type { RubricWeights, StudentGradeItem } from '@/app/professor/grades/types';

// ─────────────────────────── اعتبارسنجی حضور و غیاب ───────────────────────────

/** روش‌های مجاز ثبت حضور — هر چیز دیگر (از جمله حملات تزریق) رد می‌شود */
export const CHECKIN_METHODS = ['QR_SCAN', 'MANUAL_BY_INVIGILATOR', 'SYSTEM_EXCUSE'] as const;
export type CheckInMethod = (typeof CHECKIN_METHODS)[number];

export interface ExamCheckIn {
  studentId: number;
  isPresent: 0 | 1;
  method?: CheckInMethod;
  hasTemporaryPermit?: 0 | 1;
}

export interface ExamCheckInInput {
  studentId: unknown;
  isPresent: unknown;
  method?: unknown;
  hasTemporaryPermit?: unknown;
}

/**
 * اعتبارسنجی سخت‌گیرانهٔ ردیف‌های بررسی مراقب — قبل از هر ساخت کوئری.
 * هر مقدار نامعتبر/مخرب → خطا؛ هیچ ورودی‌ای بدون عبور از این‌جا به SQL نمی‌رسد.
 */
export function validateCheckIns(checkIns: ExamCheckInInput[]): ExamCheckIn[] {
  if (!Array.isArray(checkIns) || checkIns.length === 0) {
    throw new Error('ردیف تأییدی برای بررسی ارسال نشده است.');
  }
  return checkIns.map(c => {
    if (c === null || typeof c !== 'object') throw new Error('ردیف بررسی نامعتبر است.');
    const studentId = Number(c.studentId);
    if (!Number.isInteger(studentId) || studentId <= 0) {
      throw new Error('شناسهٔ دانشجو نامعتبر است.');
    }
    const isPresent = Number(c.isPresent);
    if (isPresent !== 0 && isPresent !== 1) {
      throw new Error('مقدار حضور و غیاب نامعتبر است.');
    }
    const method = c.method === undefined || c.method === null ? 'QR_SCAN' : String(c.method);
    if (!(CHECKIN_METHODS as readonly string[]).includes(method)) {
      throw new Error('روش ثبت حضور نامعتبر است.');
    }
    let temp = 0;
    if (c.hasTemporaryPermit !== undefined && c.hasTemporaryPermit !== null) {
      temp = Number(c.hasTemporaryPermit);
      if (temp !== 0 && temp !== 1) throw new Error('مقدار مجوز موقت نامعتبر است.');
    }
    return { studentId, isPresent: isPresent as 0 | 1, method: method as CheckInMethod, hasTemporaryPermit: temp as 0 | 1 };
  });
}

// ─────────────────────────── بارم‌بندی و پاسخ اعتراض ───────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

/** نمرهٔ نهایی از اجزا با قواعد بارم (کلمپ دوطرفه به [۰..بارم] و سقف ۲۰) */
export function scoreFromComponents(
  components: { midtermScore?: number; finalExamScore?: number },
  rubric: RubricWeights,
): number {
  // کلمپ صریح به [۰..بارم] — calculateFinalScore فقط سقف را کنترل می‌کند؛
  // مقادیر منفی نباید هرگز به نمرهٔ نهایی برسند (دفاع سرور، مستقل از UI).
  const c = (v: number | undefined, max: number) => {
    if (v === undefined || v === null || Number.isNaN(Number(v))) return 0;
    return Math.max(0, Math.min(max, Number(v)));
  };
  const st: StudentGradeItem = {
    studentId: 0, studentCode: '', fullName: '', status: 'DRAFT' as const,
    midtermScore: c(components.midtermScore, rubric.midterm),
    homeworkScore: 0, participationScore: 0, practicalScore: 0,
    finalExamScore: c(components.finalExamScore, rubric.finalExam),
    theoryProfScore: undefined, labProfScore: undefined,
    calculatedFinalScore: 0,
  };
  return calculateFinalScore(st, {
    id: 0, code: '', title: '', groupNumber: 1, units: 0, courseType: 'اصلی',
    isCoTaught: false, rubric, students: [], appeals: [],
  });
}

/** تصمیم پاسخ اعتراض: تغییر ≥ ۰٫۰۱ → پذیرفته؛ در غیر این صورت رد */
export function decideAppealOutcome(oldGrade: number, newGrade: number): {
  changed: boolean;
  status: 'RESOLVED_ACCEPTED' | 'REJECTED';
} {
  const changed = Math.abs(round2(newGrade) - round2(oldGrade)) >= 0.01;
  return { changed, status: changed ? 'RESOLVED_ACCEPTED' : 'REJECTED' };
}
