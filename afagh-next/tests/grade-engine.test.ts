import { describe, it, expect } from 'vitest';
import { GradeEngine, StudentGradeRecord } from '../src/lib/grade-engine';

describe('GradeEngine - Academic Evaluation & Finalization Suite', () => {
  describe('calculateTotalScore', () => {
    it('calculates total score accurately from numeric components', () => {
      const result = GradeEngine.calculateTotalScore({
        midtermScore: 4.5,
        finalExamScore: 11.25,
        practicalScore: 2,
        classActivityScore: 1.5,
      });
      // 4.5 + 11.25 + 2 + 1.5 = 19.25
      expect(result).toBe(19.25);
    });

    it('handles string input values from HTML form fields gracefully', () => {
      const result = GradeEngine.calculateTotalScore({
        midtermScore: '5.5' as any,
        finalExamScore: '12' as any,
        classActivityScore: '1.5' as any,
      });
      expect(result).toBe(19);
    });

    it('handles null, undefined, or empty values as zero', () => {
      const result = GradeEngine.calculateTotalScore({
        midtermScore: null,
        finalExamScore: 14,
        practicalScore: undefined,
      });
      expect(result).toBe(14);
    });

    it('clamps the total score at maximum 20', () => {
      const result = GradeEngine.calculateTotalScore({
        midtermScore: 6,
        finalExamScore: 14,
        practicalScore: 3, // مجموع = ۲۳
      });
      expect(result).toBe(20);
    });

    it('properly accounts for score of zero', () => {
      const result = GradeEngine.calculateTotalScore({
        midtermScore: 0,
        finalExamScore: 0,
      });
      expect(result).toBe(0);
    });
  });

  describe('evaluatePassingCriteria', () => {
    it('evaluates Bachelor / Associate threshold at 10.0', () => {
      const pass = GradeEngine.evaluatePassingCriteria(10.0, 'BACHELOR');
      expect(pass.isPassed).toBe(true);

      const fail = GradeEngine.evaluatePassingCriteria(9.99, 'ASSOCIATE');
      expect(fail.isPassed).toBe(false);
      expect(fail.statusText).toContain('مردود');
    });

    it('evaluates Master threshold at 12.0', () => {
      const pass = GradeEngine.evaluatePassingCriteria(12.0, 'MASTER');
      expect(pass.isPassed).toBe(true);

      const fail = GradeEngine.evaluatePassingCriteria(11.75, 'MASTER');
      expect(fail.isPassed).toBe(false);
    });

    it('evaluates PhD threshold at 14.0', () => {
      const pass = GradeEngine.evaluatePassingCriteria(14.0, 'PHD');
      expect(pass.isPassed).toBe(true);

      const fail = GradeEngine.evaluatePassingCriteria(13.9, 'PHD');
      expect(fail.isPassed).toBe(false);
    });
  });

  describe('validateGradeFinalization', () => {
    const primaryInstructor = { instructorId: 'inst-1', isPrimary: true };
    const secondaryInstructor = { instructorId: 'inst-2', isPrimary: false };

    it('blocks finalization if operator is not the primary instructor', () => {
      const grades: StudentGradeRecord[] = [
        {
          gradeId: 'g-1',
          studentId: 'st-1',
          courseOfferingId: 'off-1',
          finalExamScore: 15,
          status: 'submitted',
          isPassed: true,
        },
      ];

      const check = GradeEngine.validateGradeFinalization(grades, secondaryInstructor);
      expect(check.canFinalize).toBe(false);
      expect(check.message).toContain('فقط استاد مسئول (Primary Instructor) مجاز به قفل');
    });

    it('blocks finalization when some students lack final exam scores', () => {
      const grades: StudentGradeRecord[] = [
        {
          gradeId: 'g-1',
          studentId: 'st-1',
          courseOfferingId: 'off-1',
          finalExamScore: 16,
          status: 'submitted',
          isPassed: true,
        },
        {
          gradeId: 'g-2',
          studentId: 'st-2',
          courseOfferingId: 'off-1',
          finalExamScore: null, // نمره ثبت نشده
          status: 'draft',
          isPassed: false,
        },
      ];

      const check = GradeEngine.validateGradeFinalization(grades, primaryInstructor);
      expect(check.canFinalize).toBe(false);
      expect(check.invalidCount).toBe(1);
      expect(check.message).toContain('فاقد نمره معتبر پایان‌ترم');
    });

    it('allows finalization when a student received a score of 0 on final exam', () => {
      const grades: StudentGradeRecord[] = [
        {
          gradeId: 'g-1',
          studentId: 'st-1',
          courseOfferingId: 'off-1',
          finalExamScore: 0, // نمره صفر معتبر است
          status: 'submitted',
          isPassed: false,
        },
      ];

      const check = GradeEngine.validateGradeFinalization(grades, primaryInstructor);
      expect(check.canFinalize).toBe(true);
      expect(check.invalidCount).toBe(0);
    });

    it('approves complete roster finalization successfully', () => {
      const grades: StudentGradeRecord[] = [
        {
          gradeId: 'g-1',
          studentId: 'st-1',
          courseOfferingId: 'off-1',
          finalExamScore: 14,
          status: 'submitted',
          isPassed: true,
        },
        {
          gradeId: 'g-2',
          studentId: 'st-2',
          courseOfferingId: 'off-1',
          status: 'exempt', // معاف - نیازی به نمره پایان‌ترم ندارد
          isPassed: true,
        },
      ];

      const check = GradeEngine.validateGradeFinalization(grades, primaryInstructor);
      expect(check.canFinalize).toBe(true);
      expect(check.message).toContain('آماده نهایی‌سازی');
    });
  });
});