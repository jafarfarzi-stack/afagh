/**
 * برچسب‌های فارسی وضعیت‌های صندوق (POS)
 * — یک منبع مشترک برای صفحهٔ گزارش و ترمینال، تا کد خام در UI دیده نشود.
 */

export const POS_TXN_TYPE_FA: Record<string, string> = {
  SALE: 'فروش',
  REFUND: 'بازگشت وجه',
  VOID: 'ابطال',
};

export const POS_ENTRY_MODE_FA: Record<string, string> = {
  CHIP: 'کارت‌خوان (چیپ)',
  CONTACTLESS: 'بدون تماس',
  MAGSTRIPE: 'نوار مغناطیسی',
  FALLBACK: 'حالت جایگزین',
  MANUAL: 'دستی',
};

export const POS_TXN_STATUS_FA: Record<string, string> = {
  APPROVED: 'تأییدشده',
  DECLINED: 'ردشده',
  ERROR: 'خطا',
  VOIDED: 'باطل‌شده',
  PENDING_SETTLEMENT: 'در انتظار تسویه',
};

/** عنوان فارسی با بازگشت به مقدار اصلی برای مقادیر ناشناخته. */
export function posLabel(map: Record<string, string>, value: string | null | undefined): string {
  if (!value) return '—';
  return map[value] ?? value;
}
