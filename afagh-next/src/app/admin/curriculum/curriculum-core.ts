// ════════════════════════════════════════════════════════════════════════
//  هستهٔ خالص ماژول برنامهٔ درسی — بدون React، بدون DB، بدون DOM.
//  ثابت‌های نمایشی + قاعدهٔ درختی + چارت ترمی + فیلترها.
//  همه قابل Unit Test → tests/curriculum-core.test.ts
// ════════════════════════════════════════════════════════════════════════
import type { LogicNode } from '@/lib/curriculum-types';
import { SUMMER_SEMESTER, isSummerSemester } from '@/lib/term-plan';
import type { BankCourse, CourseRow, MajorItem, CurriculumTab } from './types';

// ─────────────────────────── ثابت‌های نمایشی ───────────────────────────

export const faNum = (n: any) => (n === null || n === undefined || n === '' ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]));

export const STATUS_UI: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'پیش‌نویس', cls: 'bg-slate-200 text-slate-800' },
  REVIEW: { label: 'در بازبینی', cls: 'bg-amber-200 text-amber-900' },
  APPROVED: { label: 'تأییدشده', cls: 'bg-blue-200 text-blue-900' },
  PUBLISHED: { label: 'منتشرشده', cls: 'bg-emerald-200 text-emerald-900' },
  ARCHIVED: { label: 'بایگانی‌شده', cls: 'bg-rose-200 text-rose-900' },
};

export const ROLE_LABELS: Record<string, string> = {
  CORE: 'پایه', MAJOR: 'اصلی', ELECTIVE: 'اختیاری', GENERAL: 'عمومی',
  THESIS: 'پایان‌نامه', INTERNSHIP: 'کارآموزی', WORKSHOP: 'کارگاه',
};

export const TABS: { key: CurriculumTab; icon: string; label: string }[] = [
  { key: 'CATALOG', icon: '🗂️', label: 'تعریف کاتالوگ رشته' },
  { key: 'COURSES', icon: '📖', label: 'دروس کاتالوگ' },
  { key: 'SEMESTERS', icon: '📅', label: 'ترم‌بندی چارت' },
  { key: 'VERIFY', icon: '🧪', label: 'بررسی و خاتمه' },
  { key: 'TRANSFER', icon: '🔄', label: 'انتقال کاتالوگ' },
];


export const faDate = (d: Date | string | null | undefined) => {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(dt);
};

export const leafCourseCodesOf = (t: LogicNode | undefined): string[] => {
  if (!t) return [];
  const out: string[] = [];
  for (const c of t.conditions ?? []) {
    const n = c as unknown as LogicNode;
    if (n.operator) out.push(...leafCourseCodesOf(n));
    else if ((c as { course?: unknown }).course != null) out.push(String((c as { course?: unknown }).course));
  }
  return out;
};

export const leafTotalOf = (t: LogicNode | undefined): number => {
  if (!t) return 0;
  let n = 0;
  for (const c of t.conditions ?? []) {
    const sn = c as unknown as LogicNode;
    n += sn.operator ? leafTotalOf(sn) : 1;
  }
  return n;
};


// ─────────────────────────── پیوندپذیری تب‌ها ───────────────────────────

export const CURRICULUM_TABS = TABS.map(t => t.key);

/** مقدار ?tab= نامعتبر/خالی → تب اول (هر تب مستقل قابل رندر باشد) */
export function resolveTab(raw: string | null | undefined): CurriculumTab {
  return (CURRICULUM_TABS as readonly string[]).includes(raw ?? '') ? (raw as CurriculumTab) : CURRICULUM_TABS[0];
}

// ─────────────────────────── درخت قاعدهٔ درس ───────────────────────────
// (این چهار تابع فقط روی LogicNode کار می‌کنند: هیچ DB و React ندارند.)

/** ساخت درخت AND/OR از کدهای درس — لیست خالی یعنی «بدون قاعده» (null) */
export function buildRuleTree(codes: string[], op: 'AND' | 'OR'): LogicNode | null {
  return codes.length === 0 ? null : { operator: op, conditions: codes.map(code => ({ course: code })) };
}

/**
 * بررسی «کف نمره» واردشده در مودال قاعده.
 * بدون تغییر → changed:false (اکشن صدا زده نمی‌شود)؛ بجز ۰..۲۰ → error.
 */
export function validateMinGrade(raw: string | null | undefined, current: string): { changed: boolean; value: number | null; error: string | null } {
  const trimmed = (raw ?? '').trim();
  if (trimmed === current) return { changed: false, value: null, error: null };
  const parsed = trimmed === '' ? null : Number(trimmed);
  if (parsed != null && (!(parsed >= 0) || !(parsed <= 20))) {
    return { changed: true, value: null, error: 'کف نمره باید بین ۰ تا ۲۰ باشد.' };
  }
  return { changed: true, value: parsed, error: null };
}

// ─────────────────────── چیدمان چارت ترمی (خالص) ───────────────────────

export type SemesterGroups = { bySemester: Map<number, CourseRow[]>; unassigned: CourseRow[] };

/** تفکیک دروس نسخه به «ترم مشخص» و «بدون ترم» */
export function groupBySemester(courses: CourseRow[] | null | undefined): SemesterGroups {
  const bySemester = new Map<number, CourseRow[]>();
  const unassigned: CourseRow[] = [];
  for (const c of courses ?? []) {
    if (c.recommendedSemester != null) {
      const arr = bySemester.get(c.recommendedSemester) ?? [];
      arr.push(c);
      bySemester.set(c.recommendedSemester, arr);
    } else {
      unassigned.push(c);
    }
  }
  return { bySemester, unassigned };
}

/** جمع واحد یک فهرست درس (واحد نامعتبر = صفر) */
export function semesterUnitTotal(list: CourseRow[] | null | undefined): number {
  return (list ?? []).reduce((s, c) => s + Number(c.units || 0), 0);
}

/** ترم‌های خارج از چارت که در داده هست (مثلاً نسخهٔ کاردانی با درس در ترم ۵..۸) گم نمی‌شوند */
export function overflowSemesters(usedTerms: Iterable<number>, planTerms: number[]): number[] {
  return [...usedTerms].filter(t => t !== SUMMER_SEMESTER && !planTerms.includes(t)).sort((a, b) => a - b);
}

/** ستون‌های شبکهٔ ترم: چارت + سرریزها + تابستان */
export function termGrid(planTerms: number[], usedTerms: Iterable<number>): number[] {
  return [...planTerms, ...overflowSemesters(usedTerms, planTerms), SUMMER_SEMESTER];
}

/** آیا این ترم بیرون از چارت مقطع است؟ (برچسب هشدار در سرستون) */
export function isOverflowSemester(sem: number, planTerms: number[]): boolean {
  return !planTerms.includes(sem) && !isSummerSemester(sem);
}

/** برچسب فارسی شمارهٔ ترم */
export function semLabel(sem: number | null | undefined): string {
  return sem == null ? 'نامشخص' : isSummerSemester(sem) ? 'تابستان' : `ترم ${faNum(sem)}`;
}

// ─────────────────────── خلاصهٔ نوع درس / سهم نقش ───────────────────────

export type TypeSummaryRow = { role: string; count: number; units: number };

/** جمع‌بندی نوع درس نسخه (معادل «نمایش اطلاعات نوع درس» مدل قدیم: جمع ۲) */
export function typeSummaryRows(courses: CourseRow[] | null | undefined): TypeSummaryRow[] {
  const m = new Map<string, { count: number; units: number }>();
  for (const c of courses ?? []) {
    const e = m.get(c.roleType) ?? { count: 0, units: 0 };
    e.count += 1; e.units += Number(c.units || 0);
    m.set(c.roleType, e);
  }
  const order = Object.keys(ROLE_LABELS);
  return [...m.entries()]
    .map(([role, v]) => ({ role, ...v }))
    .sort((a, b) => (order.indexOf(a.role) === -1 ? 99 : order.indexOf(a.role)) - (order.indexOf(b.role) === -1 ? 99 : order.indexOf(b.role)));
}

/** واحد موجود هر نقش (برای مقایسه با سهم مقرر در ویرایشگر سطرِ نقش) */
export function unitsByRoleMap(courses: CourseRow[] | null | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of courses ?? []) m.set(c.roleType, (m.get(c.roleType) ?? 0) + Number(c.units || 0));
  return m;
}

// ─────────────────── فیلتر درختی رشته و بانک دروس ───────────────────

const faSort = (a: string, b: string) => a.localeCompare(b, 'fa');

/** دانشکده‌های یکتا، مرتب (فیلتر بالای صفحه) */
export function facultyNames(majors: MajorItem[]): string[] {
  return [...new Set(majors.map(m => m.facultyName).filter(Boolean) as string[])].sort(faSort);
}

/** گروه‌های آموزشیِ یک دانشکده (یا همه، اگر دانشکده انتخاب نشده) */
export function departmentNames(majors: MajorItem[], faculty: string): string[] {
  const pool = faculty ? majors.filter(m => m.facultyName === faculty) : majors;
  return [...new Set(pool.map(m => m.departmentName).filter(Boolean) as string[])].sort(faSort);
}

/** رشته‌های قابل‌نمایش پس از فیلتر دانشکده/گروه */
export function filterMajorsByTree(majors: MajorItem[], faculty: string, dept: string): MajorItem[] {
  return majors.filter(m => (!faculty || m.facultyName === faculty) && (!dept || m.departmentName === dept));
}

/** سقف ردیف‌های بانک در مودال (جلوگیری از رندر هزاران ردیف) */
export const BANK_VISIBLE_LIMIT = 60;

export function filterBankCourses(bank: BankCourse[], query: string, prefix: string): BankCourse[] {
  const q = query.trim();
  const p = prefix.trim();
  return bank.filter(b => {
    const okQ = !q || String(b.id).includes(q) || b.code.includes(q) || b.title.includes(q);
    const okP = !p || b.code.startsWith(p);
    return okQ && okP;
  });
}

/** سقف نمایش + برچسب «بیش از X مورد» — همان منطق قبلی، فقط خالص */
export function visibleBank(bankFiltered: BankCourse[]): BankCourse[] {
  return bankFiltered.slice(0, BANK_VISIBLE_LIMIT);
}

export function allBankSelected(bankFiltered: BankCourse[], selected: Set<number>): boolean {
  return bankFiltered.length > 0 && bankFiltered.every(b => selected.has(b.id));
}
