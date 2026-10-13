// ══════════════════════════════════════════════════════════════════════
//  کمیته انضباطی — قراردادهای مشترک ماژول (.types / نگاشت رنگ‌ها / کمک‌ها)
//
//  وضعیت‌ها و تصمیم‌ها عیناً از سیستم قدیم (سما) آمده‌اند و به‌صورت
//  متن فارسی در DB ذخیره می‌شوند (مثل statusTitle در student_term_states).
//  این فایل هم سمت سرور (API) و هم سمت کلاینت (UI) مصرف می‌شود —
//  پس هیچ وابستگی server-only ندارد.
// ══════════════════════════════════════════════════════════════════════

/** وضعیت‌های پروندهٔ انضباطی — ترتیب چرخهٔ حیات */
export const DISCIPLINE_STATUSES = ['در حال بررسی', 'در کمیته', 'تصمیم‌گیری‌شده', 'تجدیدنظر'] as const;
export type DisciplineStatus = (typeof DISCIPLINE_STATUSES)[number];

export const DEFAULT_DISCIPLINE_STATUS: DisciplineStatus = 'در حال بررسی';

/** تصمیمات احتمالی کمیتهٔ انضباطی */
export const DISCIPLINE_DECISIONS = ['تذکر شفاهی', 'تذکر کتبی', 'اخطار', 'تعلیق موقت', 'اخراج', 'تبرئه'] as const;
export type DisciplineDecision = (typeof DISCIPLINE_DECISIONS)[number];

/** نوع تخلف‌های پرکاربرد (پیشنهادی در فرم — متن آزاد هم پذیرفته می‌شود) */
export const DISCIPLINE_VIOLATION_TYPES = [
  'غیبت غیرموجه',
  'تقلب در امتحان',
  'رفتار نامناسب در کلاس',
  'عدم رعایت حجاب',
  'اخلال در نظم دانشگاه',
  'آسیب به اموال دانشگاه',
  'تجاوز به حریم دیگران',
  'سایر',
] as const;

/** نگاشت رنگ نشان (badge) وضعیت‌ها — کلاس‌های Tailwind همان پالت صفحات ادمین */
export const STATUS_BADGE: Record<DisciplineStatus, string> = {
  'در حال بررسی': 'bg-amber-50 text-amber-700 border border-amber-200',
  'در کمیته': 'bg-blue-50 text-blue-700 border border-blue-200',
  'تصمیم‌گیری‌شده': 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  'تجدیدنظر': 'bg-rose-50 text-rose-700 border border-rose-200',
};

/** نگاشت رنگ نشان تصمیم‌ها — شدت از تذکر تا اخراج */
export const DECISION_BADGE: Record<DisciplineDecision, string> = {
  'تذکر شفاهی': 'bg-slate-100 text-slate-700 border border-slate-300',
  'تذکر کتبی': 'bg-sky-50 text-sky-700 border border-sky-200',
  'اخطار': 'bg-amber-50 text-amber-800 border border-amber-300',
  'تعلیق موقت': 'bg-orange-50 text-orange-800 border border-orange-300',
  'اخراج': 'bg-red-50 text-red-800 border border-red-300',
  'تبرئه': 'bg-emerald-50 text-emerald-700 border border-emerald-200',
};

/** بررسی عضویت در مقادیر مجاز (برای اعتبارسنجی سمت سرور و اطمینان از UI) */
export function isDisciplineStatus(v: string): v is DisciplineStatus {
  return (DISCIPLINE_STATUSES as readonly string[]).includes(v);
}
export function isDisciplineDecision(v: string): v is DisciplineDecision {
  return (DISCIPLINE_DECISIONS as readonly string[]).includes(v);
}

/** کلاس badge وضعیت — با fallback برای مقدار ناشناخته (دادهٔ قدیمی) */
export function statusBadgeClass(status: string): string {
  return STATUS_BADGE[status as DisciplineStatus] ?? 'bg-slate-100 text-slate-600 border border-slate-300';
}

/** کلاس badge تصمیم — با fallback برای مقدار ناشناخته */
export function decisionBadgeClass(decision: string | null | undefined): string {
  if (!decision) return 'bg-slate-50 text-slate-400 border border-dashed border-slate-300';
  return DECISION_BADGE[decision as DisciplineDecision] ?? 'bg-slate-100 text-slate-600 border border-slate-300';
}

// ═══════ انواع ردیف‌های API (مشترک بین route و Client) ═══════

export type DisciplineCaseRow = {
  id: number;
  studentId: number;
  studentCode: string;
  studentName: string;
  violationType: string;
  description: string | null;
  reporterName: string | null;
  status: string;
  committeeDecision: string | null;
  decisionNotes: string | null;
  caseDate: string | null;
  decidedAt: string | null;
  createdAt: string | null;
  documentCount: number;
};

export type DisciplineDocumentRow = {
  id: number;
  caseId: number;
  fileName: string;
  fileUrl: string;
  uploadedAt: string | null;
};

/** نتیجهٔ جست‌وجوی دانشجو برای انتخاب‌گر فرم */
export type DisciplineStudentHit = {
  studentId: number;
  studentCode: string;
  name: string;
  entryYear: number | null;
};

/** پارامترهای فیلتر فهرست پرونده‌ها (همان‌هایی که GET می‌پذیرد) */
export type DisciplineFilters = {
  status?: string;
  studentId?: number;
  dateFrom?: string; // ISO میلادی YYYY-MM-DD
  dateTo?: string;   // ISO میلادی YYYY-MM-DD
  q?: string;        // جست‌وجوی شماره/نام دانشجو
  page?: number;
};

export const DISCIPLINE_PAGE_SIZE = 50;

/** رشتهٔ فیلترها → query string برای fetch کلاینت */
export function disciplineQuery(f: DisciplineFilters): string {
  const p = new URLSearchParams();
  if (f.status) p.set('status', f.status);
  if (f.studentId) p.set('studentId', String(f.studentId));
  if (f.dateFrom) p.set('dateFrom', f.dateFrom);
  if (f.dateTo) p.set('dateTo', f.dateTo);
  if (f.q) p.set('q', f.q);
  if (f.page && f.page > 1) p.set('page', String(f.page));
  return p.toString();
}
