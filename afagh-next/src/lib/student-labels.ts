/**
 * برچسب‌های فارسی وضعیت/سهمیه دانشجو — Single Source برای UI.
 * کدهای وضعیت از نگاشت واقعی «وضعيت دانشجو.txt» سما استخراج شده‌اند.
 */

/** کد سما → وضعیت داخلی */
export const SAMA_STATUS_TO_INTERNAL: Record<string, string> = {
  '1': 'ACTIVE', '5': 'ACTIVE', '10': 'ACTIVE', '23': 'ACTIVE', '26': 'ACTIVE',
  '2': 'GRADUATED', '9': 'GRADUATED', '25': 'GRADUATED',
  '41': 'GRADUATED', '42': 'GRADUATED', '43': 'GRADUATED',
  '44': 'GRADUATED', '45': 'GRADUATED', '46': 'GRADUATED',
  '16': 'EXPELLED', '34': 'EXPELLED',
  '17': 'WITHDRAWN', '18': 'WITHDRAWN', '35': 'WITHDRAWN', '12': 'WITHDRAWN',
  '22': 'SUSPENDED',
  '3': 'TRANSFERRED', '4': 'TRANSFERRED', '14': 'TRANSFERRED',
  '15': 'TRANSFERRED', '24': 'TRANSFERRED', '37': 'TRANSFERRED',
  '0': 'UNKNOWN', '11': 'UNKNOWN', '8': 'UNKNOWN',
  '21': 'NO_SHOW', '29': 'NO_SHOW', '7': 'NO_SHOW',
  '20': 'DECEASED', '6': 'DECEASED',
};

/** عنوان دقیق سما برای هر کد وضعیت (برای نمایش جزئیات) */
export const SAMA_STATUS_TITLE: Record<string, string> = {
  '0': 'نامشخص', '1': 'در حال تحصیل', '2': 'فارغ‌التحصیل',
  '3': 'انتقالی', '4': 'انتقال توام با تغییر رشته', '5': 'میهمان به دانشگاه',
  '6': 'شهید', '7': 'عدم مراجعه تحصیلات تکمیلی', '8': 'معرفی سنجش',
  '9': 'اتمام دروس ـ تطبیق واحد', '10': 'در حال تحصیل ـ مدارک ناقص',
  '11': 'بلاتکلیف', '12': 'لغو قبولی', '14': 'تغییر رشته', '15': 'جابجایی',
  '16': 'اخراج', '17': 'انصراف', '18': 'انصراف ـ تسویه نکرده',
  '20': 'فوت', '21': 'عدم مراجعه', '22': 'محروم از تحصیل',
  '23': 'مهمان از دانشگاه', '24': 'مهمان از دانشگاه (غیرفعال)',
  '25': 'اتمام دروس ـ تسویه نکرده', '26': 'در حال تحصیل ـ آزاد',
  '29': 'عدم مراجعه', '34': 'اخراج ـ اداره ثبت‌نام',
  '35': 'انصراف حین تحصیل', '37': 'پایان دوره میهمانی',
  '41': 'فارغ‌التحصیل کاردانی ناپیوسته', '42': 'فارغ‌التحصیل کاردانی پیوسته',
  '43': 'فارغ‌التحصیل کارشناسی ناپیوسته', '44': 'فارغ‌التحصیل کارشناسی پیوسته',
  '45': 'فارغ‌التحصیل کارشناسی ارشد', '46': 'فارغ‌التحصیل کاردانی بین‌مقطعی',
};

/** وضعیت داخلی → فارسی */
export const STUDENT_STATUS_FA: Record<string, string> = {
  ACTIVE: 'در حال تحصیل',
  GRADUATED: 'فارغ‌التحصیل',
  EXPELLED: 'اخراج',
  WITHDRAWN: 'انصراف',
  SUSPENDED: 'محروم از تحصیل',
  TRANSFERRED: 'انتقالی / میهمان',
  UNKNOWN: 'نامشخص',
  NO_SHOW: 'عدم مراجعه',
  DECEASED: 'فوت',
};

export function studentStatusFa(status: string | null | undefined, samaCode?: string | null): string {
  if (samaCode && SAMA_STATUS_TITLE[samaCode]) return SAMA_STATUS_TITLE[samaCode];
  if (!status) return 'نامشخص';
  return STUDENT_STATUS_FA[status] ?? status;
}

/** رنگ چیپ وضعیت */
export function studentStatusChip(status: string | null | undefined): string {
  switch (status) {
    case 'ACTIVE': return 'bg-emerald-100 text-emerald-800';
    case 'GRADUATED': return 'bg-sky-100 text-sky-800';
    case 'EXPELLED': return 'bg-red-100 text-red-800';
    case 'WITHDRAWN': return 'bg-orange-100 text-orange-800';
    case 'SUSPENDED': return 'bg-amber-100 text-amber-800';
    case 'TRANSFERRED': return 'bg-violet-100 text-violet-800';
    case 'NO_SHOW': return 'bg-slate-200 text-slate-600';
    case 'DECEASED': return 'bg-zinc-800 text-zinc-100';
    default: return 'bg-slate-100 text-slate-600';
  }
}

/** سهمیه → فارسی */
export const QUOTA_FA: Record<string, string> = {
  NORMAL: 'عادی',
  SHAHED: 'شاهد / ایثارگر',
  STAFF: 'کارکنان',
  TOP_TALENT: 'استعداد درخشان',
};

export function quotaFa(q: string | null | undefined): string {
  if (!q) return 'عادی';
  return QUOTA_FA[q] ?? q;
}
