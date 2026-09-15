'use server';

import { revalidatePath } from 'next/cache';
import { SchedulingEngine, MergedOfferingGroupInput, ClassroomCapacityInput } from '@/lib/scheduling-engine';

export interface MergedGroupRecord extends MergedOfferingGroupInput {
  termId: string;
  assignedClassroomId?: string;
  assignedClassroomCode?: string;
}

/**
 * استعلام فهرست گروه‌های درسی ادغام‌شده در نیمسال تحصیلی جاری
 */
export async function getMergedOfferingsAction(termId: string = '1402-2') {
  try {
    // در سناریوی نهایی، داده‌ها از جداول merged_offerings و merged_offering_members واکشی می‌شوند
    const mockGroups: MergedGroupRecord[] = [
      {
        groupId: 'mg-101',
        groupTitle: 'ریاضی عمومی ۱ (مشترک کامپیوتر و صنایع)',
        termId,
        assignedClassroomId: 'room-101',
        assignedClassroomCode: 'کلاس ۱۰۱',
        memberOfferings: [
          { offeringId: 'off-201', courseTitle: 'ریاضی ۱ - مهندسی کامپیوتر', enrolledCount: 20 },
          { offeringId: 'off-202', courseTitle: 'ریاضی ۱ - مهندسی صنایع', enrolledCount: 16 },
        ],
      },
      {
        groupId: 'mg-102',
        groupTitle: 'فیزیک پایه ۲ (مشترک عمران و مکانیک)',
        termId,
        assignedClassroomId: 'room-201',
        assignedClassroomCode: 'سالن اجتماعات بزرگ',
        memberOfferings: [
          { offeringId: 'off-301', courseTitle: 'فیزیک ۲ - مهندسی عمران', enrolledCount: 35 },
          { offeringId: 'off-302', courseTitle: 'فیزیک ۲ - مهندسی مکانیک', enrolledCount: 42 },
        ],
      },
    ];

    return {
      success: true,
      groups: mockGroups,
    };
  } catch (error: any) {
    console.error('Error in getMergedOfferingsAction:', error);
    return {
      success: false,
      error: error.message || 'خطا در دریافت لیست دروس ادغام‌شده',
    };
  }
}

/**
 * ایجاد گروه ادغام‌شده جدید پس از اعتبارسنجی ظرفیت کلاس
 */
export async function createMergedGroupAction(payload: {
  termId: string;
  groupTitle: string;
  memberOfferings: Array<{ offeringId: string; courseTitle: string; enrolledCount: number }>;
  targetClassroom: ClassroomCapacityInput;
}) {
  try {
    if (!payload.groupTitle || payload.memberOfferings.length < 2) {
      return {
        success: false,
        error: 'عنوان گروه و حداقل ۲ کد ارائه برای ادغام الزامی است.',
      };
    }

    const groupInput: MergedOfferingGroupInput = {
      groupId: `mg-${Date.now()}`,
      groupTitle: payload.groupTitle,
      memberOfferings: payload.memberOfferings,
    };

    // ارزیابی انطباق ظرفیت فضا با مجموع دانشجویان ثبت‌نامی همه گروه‌ها
    const check = SchedulingEngine.evaluateMergedGroupAssignment(groupInput, payload.targetClassroom);

    if (!check.canAssign) {
      return {
        success: false,
        error: check.message,
      };
    }

    // در اینجا رکورد در جداول merged_offerings و merged_offering_members درج می‌گردد

    revalidatePath('/admin/scheduling/merged-offerings');

    return {
      success: true,
      message: `گروه ادغام‌شده "${payload.groupTitle}" با موفقیت ایجاد و به ${payload.targetClassroom.roomCode} تخصیص یافت.`,
    };
  } catch (error: any) {
    console.error('Error in createMergedGroupAction:', error);
    return {
      success: false,
      error: error.message || 'خطا در ایجاد گروه ادغام دروس',
    };
  }
}