// ============================================================================
// Afagh ERP - Scheduling & Space Management Engine (موتور برنامه‌ریزی و فضاها)
// پیاده‌سازی قوانین تخصیص کلاس، کنترل ظرفیت‌های آموزشی/امتحانی و مدیریت ادغام دروس
// ============================================================================

export interface ClassroomCapacityInput {
  classroomId: string;
  roomCode: string;
  teachingCapacity: number;
  examCapacity: number;
  isExamArea: boolean;
}

export interface MergedOfferingGroupInput {
  groupId: string;
  groupTitle: string;
  memberOfferings: Array<{
    offeringId: string;
    courseTitle: string;
    enrolledCount: number;
  }>;
}

export class SchedulingEngine {
  /**
   * بررسی انطباق ظرفیت آموزشی کلاس با تعداد دانشجویان ثبت‌نامی
   */
  public static validateTeachingCapacity(
    classroom: ClassroomCapacityInput,
    totalEnrolledStudents: number
  ): { isAllowed: boolean; deficit: number; message: string } {
    if (totalEnrolledStudents > classroom.teachingCapacity) {
      const deficit = totalEnrolledStudents - classroom.teachingCapacity;
      return {
        isAllowed: false,
        deficit,
        message: `ظرفیت آموزشی کلاس ${classroom.roomCode} (${classroom.teachingCapacity} نفر) برای تعداد ${totalEnrolledStudents} دانشجو ناکافی است. کسری ظرفیت: ${deficit} نفر`,
      };
    }

    return {
      isAllowed: true,
      deficit: 0,
      message: 'ظرفیت آموزشی کلاس کاملاً مناسب است.',
    };
  }

  /**
   * بررسی ظرفیت صندلی‌های امتحانی در حوزه برگزاری آزمون
   */
  public static validateExamCapacity(
    classroom: ClassroomCapacityInput,
    totalExamStudents: number
  ): { isAllowed: boolean; message: string } {
    if (!classroom.isExamArea) {
      return {
        isAllowed: false,
        message: `فضای ${classroom.roomCode} به عنوان حوزه مجاز امتحانی تعریف نشده است.`,
      };
    }

    if (totalExamStudents > classroom.examCapacity) {
      return {
        isAllowed: false,
        message: `ظرفیت صندلی امتحانی کلاس ${classroom.roomCode} (${classroom.examCapacity} نفر) پاسخگوی ${totalExamStudents} داوطلب نیست.`,
      };
    }

    return {
      isAllowed: true,
      message: 'ظرفیت حوزه امتحانی تایید شد.',
    };
  }

  /**
   * محاسبه مجموع دانشجویان در یک گروه ادغام‌ شده (Merged Offering)
   */
  public static calculateMergedGroupTotalStudents(group: MergedOfferingGroupInput): number {
    return group.memberOfferings.reduce((sum, member) => sum + member.enrolledCount, 0);
  }

  /**
   * بررسی اعتبار یک گروه ادغام‌شده در تخصیص کلاس
   */
  public static evaluateMergedGroupAssignment(
    group: MergedOfferingGroupInput,
    classroom: ClassroomCapacityInput
  ): { canAssign: boolean; totalStudents: number; message: string } {
    const totalStudents = this.calculateMergedGroupTotalStudents(group);
    const capacityCheck = this.validateTeachingCapacity(classroom, totalStudents);

    if (!capacityCheck.isAllowed) {
      return {
        canAssign: false,
        totalStudents,
        message: `گروه ادغام‌شده "${group.groupTitle}" با مجموع ${totalStudents} دانشجو نمی‌تواند به این کلاس تخصیص یابد: ${capacityCheck.message}`,
      };
    }

    return {
      canAssign: true,
      totalStudents,
      message: `تخصیص کلاس ${classroom.roomCode} به گروه ادغام‌شده "${group.groupTitle}" با ${totalStudents} دانشجو بلامانع است.`,
    };
  }
}