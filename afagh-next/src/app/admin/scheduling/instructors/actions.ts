'use server';

import { revalidatePath } from 'next/cache';
import { SchedulingEngine, InstructorAssignmentInput } from '@/lib/scheduling-engine';

export interface CourseOfferingInstructorRecord extends InstructorAssignmentInput {
  assignmentId?: string;
  courseOfferingId: string;
}

/**
 * دریافت فهرست اساتید تخصیص‌یافته به یک ارائه‌ی درسی خاص
 */
export async function getCourseOfferingInstructorsAction(courseOfferingId: string) {
  try {
    // داده‌های نمونه (در محیط پروداکشن از جدول course_offering_instructors واکشی می‌شود)
    const mockAssignments: CourseOfferingInstructorRecord[] = [
      {
        assignmentId: 'assign-1',
        courseOfferingId,
        instructorId: 'inst-101',
        instructorName: 'دکتر محمد رضایی',
        isPrimary: true,
        canEnterGrades: true,
        canTrackAttendance: true,
        sharePercentage: 60,
      },
      {
        assignmentId: 'assign-2',
        courseOfferingId,
        instructorId: 'inst-102',
        instructorName: 'مهندس سارا عباسی',
        isPrimary: false,
        canEnterGrades: false,
        canTrackAttendance: true,
        sharePercentage: 40,
      },
    ];

    return {
      success: true,
      assignments: mockAssignments,
    };
  } catch (error: any) {
    console.error('Error in getCourseOfferingInstructorsAction:', error);
    return {
      success: false,
      error: error.message || 'خطا در دریافت فهرست اساتید ارائه',
    };
  }
}

/**
 * ثبت و ذخیره‌سازی تخصیص چنداستادی با کنترل خودکار قوانین آموزشی
 */
export async function assignInstructorsToOfferingAction(payload: {
  courseOfferingId: string;
  assignments: InstructorAssignmentInput[];
}) {
  try {
    // ۱. ارزیابی قواعد با استفاده از متد موتور برنامه‌ریزی
    const validation = SchedulingEngine.validateInstructorAssignments(payload.assignments);

    if (!validation.isValid) {
      return {
        success: false,
        error: validation.message,
      };
    }

    // ۲. در اینجا درج/به‌روزرسانی در پایگاه داده (Drizzle) انجام می‌پذیرد
    // عملیات شامل جایگزینی رکوردهای قدیمی با رکوردهای جدید تخصیص برای این ارائه است.

    revalidatePath('/admin/scheduling/instructors');
    revalidatePath(`/admin/scheduling/offerings/${payload.courseOfferingId}`);

    return {
      success: true,
      message: validation.message,
      primaryInstructorId: validation.primaryInstructorId,
    };
  } catch (error: any) {
    console.error('Error in assignInstructorsToOfferingAction:', error);
    return {
      success: false,
      error: error.message || 'خطا در ذخیره تخصیص اساتید درس',
    };
  }
}