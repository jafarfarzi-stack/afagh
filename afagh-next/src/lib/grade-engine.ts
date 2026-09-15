// ============================================================================
// Afagh ERP - Grade Engine & Academic Performance Engine (موتور ارزشیابی و نمرات)
// ============================================================================

export type DegreeLevel = 'ASSOCIATE' | 'BACHELOR' | 'MASTER' | 'PHD';
export type GradeStatus = 'draft' | 'submitted' | 'appealed' | 'finalized' | 'exempt';

export interface GradeComponentsInput {
  midtermScore?: number | string | null;
  finalExamScore?: number | string | null;
  practicalScore?: number | string | null;
  classActivityScore?: number | string | null;
}

export interface StudentGradeRecord extends GradeComponentsInput {
  gradeId: string;
  studentId: string;
  courseOfferingId: string;
  totalScore?: number | null;
  status: GradeStatus;
  isPassed: boolean;
}

export class GradeEngine {
  public static readonly PASSING_THRESHOLDS: Record<DegreeLevel, number> = {
    ASSOCIATE: 10.0,
    BACHELOR: 10.0,
    MASTER: 12.0,
    PHD: 14.0,
  };

  /**
   * محاسبه مجموع اجزا با اطمینان از تبدیل نوع داده و سقف ۲۰
   */
  public static calculateTotalScore(components: GradeComponentsInput): number {
    const parseScore = (val: number | string | null | undefined): number => {
      if (val === null || val === undefined || val === '') return 0;
      const parsed = Number(val);
      return isNaN(parsed) ? 0 : parsed;
    };

    const midterm = parseScore(components.midtermScore);
    const finalExam = parseScore(components.finalExamScore);
    const practical = parseScore(components.practicalScore);
    const activity = parseScore(components.classActivityScore);

    const sum = midterm + finalExam + practical + activity;
    const clamped = Math.min(20, Math.max(0, sum));
    return Math.round(clamped * 100) / 100;
  }

  /**
   * بررسی کف قبولی بر اساس مقطع تحصیلی
   */
  public static evaluatePassingCriteria(
    totalScore: number,
    degreeLevel: DegreeLevel = 'BACHELOR'
  ): { isPassed: boolean; minRequired: number; statusText: string } {
    const minRequired = this.PASSING_THRESHOLDS[degreeLevel] ?? 10.0;
    const isPassed = totalScore >= minRequired;

    return {
      isPassed,
      minRequired,
      statusText: isPassed
        ? `قبول (کف قبولی: ${minRequired})`
        : `مردود (کسری: ${(minRequired - totalScore).toFixed(2)})`,
    };
  }

  /**
   * اعتبارسنجی نهایی‌سازی و قفل نمرات توسط استاد مسئول
   */
  public static validateGradeFinalization(
    grades: StudentGradeRecord[],
    operatorInstructor: { instructorId: string; isPrimary: boolean }
  ): { canFinalize: boolean; invalidCount: number; message: string } {
    if (!operatorInstructor.isPrimary) {
      return {
        canFinalize: false,
        invalidCount: 0,
        message: 'فقط استاد مسئول (Primary Instructor) مجاز به قفل و نهایی‌سازی لیست نمرات است.',
      };
    }

    if (!grades || grades.length === 0) {
      return {
        canFinalize: false,
        invalidCount: 0,
        message: 'هیچ رکوردی برای نهایی‌سازی وجود ندارد.',
      };
    }

    const invalidGrades = grades.filter((g) => {
      if (g.status === 'finalized' || g.status === 'exempt') return false;
      if (g.finalExamScore === null || g.finalExamScore === undefined || g.finalExamScore === '') {
        return true;
      }
      return isNaN(Number(g.finalExamScore));
    });

    if (invalidGrades.length > 0) {
      return {
        canFinalize: false,
        invalidCount: invalidGrades.length,
        message: `تعداد ${invalidGrades.length} دانشجو فاقد نمره معتبر پایان‌ترم هستند. قفل نهایی امکان‌پذیر نیست.`,
      };
    }

    return {
      canFinalize: true,
      invalidCount: 0,
      message: `تمامی ${grades.length} نمره آماده نهایی‌سازی و درج در کارنامه رسمی می‌باشند.`,
    };
  }
}