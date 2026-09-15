import { describe, it, expect } from 'vitest';
import {
  SchedulingEngine,
  ClassroomCapacityInput,
  MergedOfferingGroupInput,
  InstructorAssignmentInput,
} from '../src/lib/scheduling-engine';

describe('Scheduling & Space Management Engine Test Suite', () => {
  const sampleClassroom: ClassroomCapacityInput = {
    classroomId: 'room-101',
    roomCode: 'کلاس ۱۰۱',
    teachingCapacity: 40,
    examCapacity: 25,
    isExamArea: true,
  };

  const restrictedExamClassroom: ClassroomCapacityInput = {
    classroomId: 'room-102',
    roomCode: 'آزمایشگاه کامپیوتر',
    teachingCapacity: 30,
    examCapacity: 0,
    isExamArea: false,
  };

  it('validates teaching capacity correctly when students are within limits', () => {
    const result = SchedulingEngine.validateTeachingCapacity(sampleClassroom, 35);
    expect(result.isAllowed).toBe(true);
    expect(result.deficit).toBe(0);
  });

  it('detects capacity deficit when enrolled students exceed teaching capacity', () => {
    const result = SchedulingEngine.validateTeachingCapacity(sampleClassroom, 48);
    expect(result.isAllowed).toBe(false);
    expect(result.deficit).toBe(8);
    expect(result.message).toContain('کسری ظرفیت: ۸ نفر');
  });

  it('validates exam seat capacity and blocks non-exam areas', () => {
    const validExamCheck = SchedulingEngine.validateExamCapacity(sampleClassroom, 20);
    expect(validExamCheck.isAllowed).toBe(true);

    const overExamCheck = SchedulingEngine.validateExamCapacity(sampleClassroom, 30);
    expect(overExamCheck.isAllowed).toBe(false);

    const nonExamCheck = SchedulingEngine.validateExamCapacity(restrictedExamClassroom, 10);
    expect(nonExamCheck.isAllowed).toBe(false);
    expect(nonExamCheck.message).toContain('حوزه مجاز امتحانی تعریف نشده');
  });

  it('evaluates merged offering groups and calculates total students accurately', () => {
    const mergedGroup: MergedOfferingGroupInput = {
      groupId: 'mg-1',
      groupTitle: 'ریاضی ۱ مشترک (فنی و مهندسی)',
      memberOfferings: [
        { offeringId: 'off-1', courseTitle: 'ریاضی ۱ - کامپیوتر', enrolledCount: 22 },
        { offeringId: 'off-2', courseTitle: 'ریاضی ۱ - صنایع', enrolledCount: 15 },
      ],
    };

    const total = SchedulingEngine.calculateMergedGroupTotalStudents(mergedGroup);
    expect(total).toBe(37);

    const assignmentCheck = SchedulingEngine.evaluateMergedGroupAssignment(mergedGroup, sampleClassroom);
    expect(assignmentCheck.canAssign).toBe(true);
    expect(assignmentCheck.totalStudents).toBe(37);

    const smallClassroom: ClassroomCapacityInput = {
      ...sampleClassroom,
      teachingCapacity: 30,
    };
    const failedAssignment = SchedulingEngine.evaluateMergedGroupAssignment(mergedGroup, smallClassroom);
    expect(failedAssignment.canAssign).toBe(false);
    expect(failedAssignment.message).toContain('نمی‌تواند به این کلاس تخصیص یابد');
  });

  describe('Multi-Instructor Assignment Validation', () => {
    it('approves valid multi-instructor assignment with single primary instructor and correct shares', () => {
      const assignments: InstructorAssignmentInput[] = [
        {
          instructorId: 'inst-1',
          instructorName: 'دکتر علوی',
          isPrimary: true,
          canEnterGrades: true,
          canTrackAttendance: true,
          sharePercentage: 60,
        },
        {
          instructorId: 'inst-2',
          instructorName: 'مهندس رضایی',
          isPrimary: false,
          canEnterGrades: false,
          canTrackAttendance: true,
          sharePercentage: 40,
        },
      ];

      const result = SchedulingEngine.validateInstructorAssignments(assignments);
      expect(result.isValid).toBe(true);
      expect(result.primaryInstructorId).toBe('inst-1');
      expect(result.message).toContain('مجموع سهم: ۱۰۰٪');
    });

    it('rejects assignments when no primary instructor is specified', () => {
      const assignments: InstructorAssignmentInput[] = [
        {
          instructorId: 'inst-1',
          isPrimary: false,
          canEnterGrades: true,
          canTrackAttendance: true,
          sharePercentage: 50,
        },
      ];

      const result = SchedulingEngine.validateInstructorAssignments(assignments);
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('هیچ استاد مسئولی (Primary) برای این درس تعیین نشده است');
    });

    it('rejects assignments when multiple primary instructors are declared', () => {
      const assignments: InstructorAssignmentInput[] = [
        {
          instructorId: 'inst-1',
          isPrimary: true,
          canEnterGrades: true,
          canTrackAttendance: true,
          sharePercentage: 50,
        },
        {
          instructorId: 'inst-2',
          isPrimary: true,
          canEnterGrades: true,
          canTrackAttendance: true,
          sharePercentage: 50,
        },
      ];

      const result = SchedulingEngine.validateInstructorAssignments(assignments);
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('هر ارائه فقط می‌تواند دارای یک استاد مسئول برای تایید نهایی باشد');
    });

    it('rejects assignment if primary instructor lacks grade entry permission', () => {
      const assignments: InstructorAssignmentInput[] = [
        {
          instructorId: 'inst-1',
          isPrimary: true,
          canEnterGrades: false, // دسترسی ندارد
          canTrackAttendance: true,
          sharePercentage: 100,
        },
      ];

      const result = SchedulingEngine.validateInstructorAssignments(assignments);
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('استاد مسئول باید دسترسی تایید و ثبت نمرات را دارا باشد');
    });

    it('rejects assignments when total share percentage exceeds 100%', () => {
      const assignments: InstructorAssignmentInput[] = [
        {
          instructorId: 'inst-1',
          isPrimary: true,
          canEnterGrades: true,
          canTrackAttendance: true,
          sharePercentage: 70,
        },
        {
          instructorId: 'inst-2',
          isPrimary: false,
          canEnterGrades: true,
          canTrackAttendance: true,
          sharePercentage: 40, // مجموع = ۱۱۰٪
        },
      ];

      const result = SchedulingEngine.validateInstructorAssignments(assignments);
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('نمی‌تواند بیش از ۱۰۰٪ باشد');
    });
  });
});