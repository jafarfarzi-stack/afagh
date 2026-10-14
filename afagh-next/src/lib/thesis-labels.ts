/** برچسب‌های دفتر پایان‌نامه — بدون وابستگی سرور (قابل import در کلاینت) */

export const THESIS_ROLES = ['SUPERVISOR', 'ADVISOR'] as const;
export const THESIS_ROLE_FA: Record<string, string> = {
  SUPERVISOR: 'راهنما',
  ADVISOR: 'مشاور',
};

export const THESIS_STATUSES = ['ONGOING', 'COMPLETED', 'CANCELLED'] as const;
export const THESIS_STATUS_FA: Record<string, string> = {
  ONGOING: 'در جریان',
  COMPLETED: 'تکمیل‌شده',
  CANCELLED: 'لغوشده',
};
