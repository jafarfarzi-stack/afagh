'use server';

import { revalidatePath } from 'next/cache';
import { SchedulingEngine, ClassroomCapacityInput } from '@/lib/scheduling-engine';

export interface ClassroomRecord extends ClassroomCapacityInput {
  buildingId?: string;
  floor: number;
  isActive: boolean;
}

/**
 * دریافت لیست کلاس‌ها و فضاهای فیزیکی دانشگاه
 */
export async function getClassroomsAction(universityId: string = 'uni-afagh') {
  try {
    // در سیستم واقعی، این اطلاعات از جدول classrooms در دیتابیس خوانده می‌شوند
    const mockClassrooms: ClassroomRecord[] = [
      {
        classroomId: 'room-101',
        roomCode: 'کلاس ۱۰۱',
        buildingId: 'bldg-main',
        floor: 1,
        teachingCapacity: 40,
        examCapacity: 25,
        isExamArea: true,
        isActive: true,
      },
      {
        classroomId: 'room-102',
        roomCode: 'آزمایشگاه کامپیوتر',
        buildingId: 'bldg-tech',
        floor: 2,
        teachingCapacity: 30,
        examCapacity: 0,
        isExamArea: false,
        isActive: true,
      },
      {
        classroomId: 'room-201',
        roomCode: 'سالن اجتماعات بزرگ',
        buildingId: 'bldg-main',
        floor: 2,
        teachingCapacity: 120,
        examCapacity: 80,
        isExamArea: true,
        isActive: true,
      },
    ];

    return {
      success: true,
      classrooms: mockClassrooms,
    };
  } catch (error: any) {
    console.error('Error in getClassroomsAction:', error);
    return {
      success: false,
      error: error.message || 'خطا در دریافت لیست کلاس‌ها و فضاها',
    };
  }
}

/**
 * ثبت یا به‌روزرسانی مشخصات و ظرفیت‌های یک فضای فیزیکی
 */
export async function upsertClassroomAction(payload: ClassroomRecord) {
  try {
    if (!payload.roomCode || payload.teachingCapacity <= 0) {
      return { success: false, error: 'کد فضا و ظرفیت آموزشی معتبر الزامی است.' };
    }

    // در اینجا عملیات درج یا به‌روزرسانی در دیتابیس (Drizzle) انجام می‌شود

    revalidatePath('/admin/scheduling/classrooms');

    return {
      success: true,
      message: `فضای فیزیکی "${payload.roomCode}" با موفقیت ثبت/به‌روزرسانی شد.`,
    };
  } catch (error: any) {
    console.error('Error in upsertClassroomAction:', error);
    return {
      success: false,
      error: error.message || 'خطا در ذخیره‌سازی اطلاعات کلاس',
    };
  }
}

/**
 * ارزیابی زنده تخصیص کلاس به یک درس یا امتحان بر اساس موتور برنامه‌ریزی
 */
export async function evaluateClassroomAssignmentAction(
  classroom: ClassroomCapacityInput,
  demandCount: number,
  mode: 'teaching' | 'exam'
) {
  try {
    if (mode === 'teaching') {
      const check = SchedulingEngine.validateTeachingCapacity(classroom, demandCount);
      return { success: true, check };
    } else {
      const check = SchedulingEngine.validateExamCapacity(classroom, demandCount);
      return { success: true, check };
    }
  } catch (error: any) {
    console.error('Error in evaluateClassroomAssignmentAction:', error);
    return {
      success: false,
      error: error.message || 'خطا در ارزیابی ظرفیت فضا',
    };
  }
}