/** برچسب‌های ابلاغ آموزشی — بدون وابستگی سرور (قابل import در کلاینت) */

export const DECREE_STATUSES = ['DRAFT', 'ISSUED'] as const;
export const DECREE_STATUS_FA: Record<string, string> = {
  DRAFT: 'پیش‌نویس',
  ISSUED: 'صادرشده',
};

export const DECREE_SECTIONS = ['COURSES', 'THESIS', 'ACTIVITIES', 'EXAM', 'SUMMARY'] as const;
export const DECREE_SECTION_FA: Record<string, string> = {
  COURSES: 'درس‌ها',
  THESIS: 'پایان‌نامه',
  ACTIVITIES: 'فعالیت‌ها',
  EXAM: 'امتحانات',
  SUMMARY: 'جمع‌بندی',
};
