// برچسب‌ها و انواع مشترک درخواست «بدون رعایت پیش‌نیاز / تداخل امتحانی».
// این فایل عمداً server-only نیست تا هم کامپوننت‌های کلاینت و هم موتور سمت سرور
// بتوانند از یک منبع واحد برچسب‌ها استفاده کنند.

export type BypassKind = 'PREREQ' | 'EXAM_CONFLICT';
export type BypassStatus =
  | 'PENDING_MANAGER'
  | 'ESCALATED_EXPERT'
  | 'APPROVED'
  | 'REJECTED'
  | 'AUTO_REJECTED'
  | 'CANCELLED';

export const BYPASS_KIND_LABEL: Record<BypassKind, string> = {
  PREREQ: 'پیش‌نیاز',
  EXAM_CONFLICT: 'تداخل امتحانی',
};

export const BYPASS_REASON_LABEL: Record<string, string> = {
  LOW_GPA_PREV_TERM: 'معدل پایین ترم قبل',
  GROUP_COUNCIL_DISAGREE: 'مخالفت شورای گروه',
  UNRESOLVABLE_EXAM_CONFLICT: 'تداخل امتحانی غیرقابل رفع',
  OTHER: 'سایر (توضیح تکمیلی)',
  NO_RESPONSE: 'بدون پاسخ در مهلت تعیین‌شده',
};

export const BYPASS_STATUS_LABEL: Record<BypassStatus, string> = {
  PENDING_MANAGER: 'در انتظار مدیر گروه',
  ESCALATED_EXPERT: 'ارجاع به کارشناس آموزش',
  APPROVED: 'تأیید و ثبت شد',
  REJECTED: 'رد شد',
  AUTO_REJECTED: 'رد خودکار (بدون پاسخ)',
  CANCELLED: 'لغو شد',
};

export interface BypassRequestRow {
  id: number;
  studentId: number;
  offeringId: number;
  kind: BypassKind;
  status: BypassStatus;
  reasonCode: string | null;
  reasonText: string | null;
  managerDeadlineAt: Date;
  expertDeadlineAt: Date | null;
  decidedRole: string | null;
  decidedAt: Date | null;
  createdAt: Date | null;
  courseTitle: string;
  courseCode: string;
  units: string;
  studentName: string;
  studentCode: string;
  majorName: string | null;
}
