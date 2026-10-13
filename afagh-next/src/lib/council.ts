// ══════════════════════════════════════════════════════════════════════
//  آفاق ERP — ماژول «شورای آموزشی» (Academic Council)
//
//  انواع/قراردادهای مشترک بین سرور (API و صفحهٔ سروری) و کلاینت.
//  بدون هیچ وابستگی به server-only تا در کامپوننت‌های 'use client' هم
//  قابل استفاده باشد (برچسب‌های رنگی وضعیت‌ها همین‌جا تعریف می‌شوند).
//
//  مقادیر ذخیره‌شده در دیتابیس «متن فارسی» هستند (قرارداد statusTitle)؛
//  این فایل منبع واحدِ همان مقادیر است تا API و UI هرگز از هم واگرا نشوند.
// ══════════════════════════════════════════════════════════════════════

/** نوع مصوبه — مقدار هر گزینه همان چیزی است که در دیتابیس ذخیره می‌شود. */
export const DECISION_TYPES = ['مصوبه', 'توصیه', 'درخواست تجدیدنظر'] as const;
export type DecisionType = (typeof DECISION_TYPES)[number];

/** وضعیت اجرای مصوبه. */
export const IMPLEMENTATION_STATUSES = ['در انتظار اجرا', 'در حال اجرا', 'اجراشده'] as const;
export type ImplementationStatus = (typeof IMPLEMENTATION_STATUSES)[number];

/** رفتار قراردادی «بدون فیلتر» در کوئری‌ها و کوئری‌پارام‌ها. */
export const NO_FILTER = '';

// ────────────────────────────────────────────────────────────────────────
//  انواع DTO (شکل پاسخ API — camelCase، تاریخ‌ها ISO string)
// ────────────────────────────────────────────────────────────────────────

export interface CouncilMeetingDTO {
  id: number;
  title: string;
  /** ISO — نمایش شمسی با toShamsi */
  meetingDate: string | null;
  /** هر عضو یک خط (نام — سِمت) */
  members: string | null;
  agenda: string | null;
  minutes: string | null;
  universityId: number | null;
  createdBy: number | null;
  /** تعداد مصوبات مرتبط (محاسبه‌شده در GET) */
  decisionsCount?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CouncilDecisionDTO {
  id: number;
  meetingId: number;
  /** عنوان جلسهٔ مبدأ (join در GET) */
  meetingTitle?: string | null;
  /** ISO تاریخ جلسه — برای مرتب‌سازی/نمایش */
  meetingDate?: string | null;
  studentId: number | null;
  /** نام کامل دانشجو (join در GET) */
  studentName?: string | null;
  studentCode?: string | null;
  decisionType: DecisionType | string;
  content: string;
  implementationStatus: ImplementationStatus | string;
  /** ISO — مهلت اجرا */
  deadline: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

// ────────────────────────────────────────────────────────────────────────
//  برچسب‌های رنگی (همان کلاس‌هایی که در بقیهٔ UI استفاده می‌شوند)
// ────────────────────────────────────────────────────────────────────────

const STATUS_BADGES: Record<string, string> = {
  'در انتظار اجرا': 'bg-amber-100 text-amber-800 border-amber-300',
  'در حال اجرا': 'bg-sky-100 text-sky-800 border-sky-300',
  'اجراشده': 'bg-emerald-100 text-emerald-800 border-emerald-300',
};

const TYPE_BADGES: Record<string, string> = {
  'مصوبه': 'bg-indigo-100 text-indigo-800 border-indigo-300',
  'توصیه': 'bg-violet-100 text-violet-800 border-violet-300',
  'درخواست تجدیدنظر': 'bg-rose-100 text-rose-800 border-rose-300',
};

/** کلاس‌های badge برای وضعیت اجرا (نامعلوم ⇒ خنثی). */
export function implementationStatusBadgeClass(status: string | null | undefined): string {
  return STATUS_BADGES[String(status ?? '')] ?? 'bg-slate-100 text-slate-700 border-slate-300';
}

/** کلاس‌های badge برای نوع مصوبه (نامعلوم ⇒ خنثی). */
export function decisionTypeBadgeClass(type: string | null | undefined): string {
  return TYPE_BADGES[String(type ?? '')] ?? 'bg-slate-100 text-slate-700 border-slate-300';
}

// ────────────────────────────────────────────────────────────────────────
//  نرمال‌سازی ورودی/خروجی
// ────────────────────────────────────────────────────────────────────────

/** رشتهٔ چندخطی اعضا/دستور جلسه → آرایهٔ ردیف‌های غیرخالی (trim). */
export function splitLines(raw: string | null | undefined): string[] {
  return String(raw ?? '')
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
}

/** آرایهٔ ردیف‌ها → متن چندخطی برای ذخیره در text. */
export function joinLines(lines: readonly string[]): string {
  return lines.map(s => s.trim()).filter(Boolean).join('\n');
}

/** متن رشته‌ای پارامترهای کوئری — خالی/نامعتبر ⇒ undefined (یعنی بدون فیلتر). */
export function strParam(sp: URLSearchParams, key: string): string | undefined {
  const v = sp.get(key)?.trim();
  return v ? v : undefined;
}

/** عدد صحیح پارامتر کوئری — صفر/خالی/نامعتبر ⇒ undefined. */
export function intParam(sp: URLSearchParams, key: string): number | undefined {
  const raw = sp.get(key);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** تاریخ معتبر پارامتر کوئری (YYYY-MM-DD یا ISO) — نامعتبر ⇒ undefined. */
export function dateParam(sp: URLSearchParams, key: string): Date | undefined {
  const raw = strParam(sp, key);
  if (!raw) return undefined;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? undefined : d;
}

/** عضویت امن در لیست مقدارهای مجاز (برای اعتبارسنجی سمت سرور). */
export function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}
