/**
 * انواع دادهٔ ماژول «مدیریت نمرات استاد» (Professor Grades)
 *
 * با جراحی معماری از فایل مگاکامپوننت ProfessorGradesClient.tsx جدا شد
 * تا تیم‌های توسعه بتوانند به‌صورت ایزوله روی هر تب کار کنند.
 */

export interface RubricWeights {
  midterm: number;       // میان‌ترم
  homework: number;      // تکالیف و تمرین‌ها
  participation: number; // حضور و فعالیت کلاسی
  practical: number;     // بخش عملی / کارگاهی
  finalExam: number;     // پایان‌ترم
}

export type RubricField = keyof RubricWeights;

export type RubricPreset =
  | 'STANDARD_THEORY'
  | 'BALANCED'
  | 'PRACTICAL_HEAVY'
  | 'FINAL_HEAVY';

export type StudentGradeField =
  | 'midtermScore'
  | 'homeworkScore'
  | 'participationScore'
  | 'practicalScore'
  | 'finalExamScore'
  | 'theoryProfScore' // برای دروس مشترک: نمره استاد تئوری از ۲۰
  | 'labProfScore';   // برای دروس مشترک: نمره استاد عملی از ۲۰

export type StudentGradeStatus = 'DRAFT' | 'TEMPORARY' | 'FINALIZED' | 'APPEALED';

export interface StudentGradeItem {
  studentId: number;
  studentCode: string;
  fullName: string;
  midtermScore?: number;
  homeworkScore?: number;
  participationScore?: number;
  practicalScore?: number;
  finalExamScore?: number;
  theoryProfScore?: number;
  labProfScore?: number;
  calculatedFinalScore?: number;
  status: StudentGradeStatus;
  note?: string;
}

export interface GradeAppealItem {
  id: number;
  studentId: number;
  studentCode: string;
  fullName: string;
  currentGrade: number;
  appealSection?: 'THEORY' | 'PRACTICAL' | 'ALL';
  studentMessage: string;
  status: 'OPEN' | 'ACCEPTED' | 'REJECTED';
  professorReply?: string;
  newGrade?: number;
  createdAt: string;
}

export interface CoTaughtDetails {
  theoryProfName: string;
  theoryProfStaffCode: string;
  theoryWeightRatio: number; // e.g. 0.60 (60%)
  theoryWeightMarks: number; // e.g. 12 marks
  theorySigned: boolean;
  theorySignedAt?: string;
  theorySignatureHash?: string;

  labProfName: string;
  labProfStaffCode: string;
  labWeightRatio: number;    // e.g. 0.40 (40%)
  labWeightMarks: number;    // e.g. 8 marks
  labSigned: boolean;
  labSignedAt?: string;
  labSignatureHash?: string;

  currentProfRole: 'THEORY' | 'LAB';
}

export interface GradingCourseOffering {
  id: number;
  code: string;
  title: string;
  groupNumber: number;
  units: number;
  courseType: 'پایه' | 'اصلی' | 'تخصصی' | 'عمومی' | 'عملی';
  isCoTaught: boolean;
  coTaughtDetails?: CoTaughtDetails;
  isFinalized?: boolean;
  finalizedAt?: string;
  finalSignatureHash?: string;
  isArchived?: boolean;
  archivedAt?: string;
  archiveDossierId?: string;
  rubric: RubricWeights;
  students: StudentGradeItem[];
  appeals: GradeAppealItem[];
}

export type GradeTabType = 'ROSTER' | 'RUBRIC' | 'APPEALS' | 'ANALYTICS' | 'CERTIFICATE';

export interface GradeAppealBreakdown {
  midtermScore: number;
  homeworkScore: number;
  participationScore: number;
  practicalScore: number;
  finalExamScore: number;
  theoryProfScore: number;
  labProfScore: number;
}

/** تبدیل ارقام انگلیسی به فارسی برای نمایش */
export const faNum = (n: any): string =>
  n === null || n === undefined ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
