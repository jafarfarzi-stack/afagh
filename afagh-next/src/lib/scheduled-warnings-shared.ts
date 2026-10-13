// ══════════════════════════════════════════════════════════════════════
//  ثابت‌ها و کمک‌تابع‌های خالص «هشدارهای زمان‌بندی‌شده» — بدون وابستگی سرور
//
//  فایل الحاقی؛ ماژول اصلی src/lib/scheduled-warnings.ts باید server-only
//  بماند (db + messaging). برای همین این بخشِ خالص جدا شده تا کامپوننت‌های
//  'use client' بتوانند بدون کشیده‌شدن کتابخانه‌های سروری از آن استفاده کنند.
//  نکته: هر مقداری که اینجا تغییر کند باید در lib/scheduled-warnings.ts هم
//  از همین فایل re-export شود (منبع واحد حقیقت).
// ══════════════════════════════════════════════════════════════════════

export const WARNING_STATUSES = ['pending', 'sent', 'cancelled'] as const;
export type WarningStatus = (typeof WARNING_STATUSES)[number];

export const WARNING_TYPES = [
  'TUITION_DEADLINE',    // یادآوری سررسید شهریه
  'LOW_ATTENDANCE',      // هشدار غیبت زیاد
  'MISSING_DOCS',        // نقص مدارک
  'EXAM_REMINDER',       // یادآوری امتحان
  'ENROLL_DEADLINE',     // مهلت انتخاب واحد
  'CUSTOM',              // هشدار دلخواه
] as const;
export type WarningType = (typeof WARNING_TYPES)[number];

export function isWarningType(v: string): v is WarningType {
  return (WARNING_TYPES as readonly string[]).includes(v);
}
export function isWarningStatus(v: string): v is WarningStatus {
  return (WARNING_STATUSES as readonly string[]).includes(v);
}

export const STATUS_BADGE: Record<WarningStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  sent: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-gray-200 text-gray-600',
};
export function statusBadgeClass(s: string): string {
  return STATUS_BADGE[s as WarningStatus] ?? 'bg-gray-100 text-gray-700';
}

export const WARNING_TYPE_LABEL: Record<WarningType, string> = {
  TUITION_DEADLINE: 'یادآوری شهریه',
  LOW_ATTENDANCE: 'هشدار غیبت',
  MISSING_DOCS: 'نقص مدارک',
  EXAM_REMINDER: 'یادآوری امتحان',
  ENROLL_DEADLINE: 'مهلت انتخاب واحد',
  CUSTOM: 'دلخواه',
};
export function warningTypeLabel(t: string | null): string {
  return t && isWarningType(t) ? WARNING_TYPE_LABEL[t] : (t || '—');
}

export const SCHED_WARNINGS_PAGE_SIZE = 50;