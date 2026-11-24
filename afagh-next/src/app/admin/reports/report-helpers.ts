// ══════════════════════════════════════════════════════════════════════
// هلپرها و تایپ‌های مشترک گزارش‌ها (بدون 'use server' — چون توابع/ثابت‌های
// غیرasync هم اکسپورت می‌کند؛ فایل‌های r-*.ts و actions.ts از اینجا می‌خوانند.
// ══════════════════════════════════════════════════════════════════════
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { STUDENT_STATUS_FA } from '@/lib/student-labels';
import { escapeLikeChars, toEnDigits } from '@/lib/persian-search';
import { parseCodeList } from '@/lib/code-list';
import { isRealUniversityId } from '@/lib/university-scope';

export const PER = 50;

export type ReportFilters = {
  /** کد یک ترم (سازگاری عقبرو با همهٔ ماژولهای r-*.ts)؛ خالی = بدون فیلتر ترم */
  term?: string;
  /**
   * فهرست ترمهای انتخابشده، جدا شده با ویرگول (مثلاً «14051,14052»).
   * وقتی بیش از یک ترم باشد، `runReport` هر ترم را جدا اجرا و نتایج را
   * با ستون «ترم» ادغام میکند. یکترم/همهترمها همچنان از `term` میگذرند.
   */
  terms?: string;
  /**
   * فهرست کدهای دانشجویی (ویرگول/فاصله/خط جدید/بازه) — «فقط همین‌ها را بیاور».
   * کاربر فهرست را از Excel می‌چسباند؛ تجزیه در `@/lib/code-list` انجام می‌شود.
   * خالی = بدون فیلتر. اگر متنی بدهید که هیچ کد معتبری ندارد، عمداً «هیچ ردیفی»
   * برمی‌گردد (fail-closed) تا فیلترِ خراب به‌معنای «همه» تفسیر نشود.
   */
  studentCodes?: string;
  degreeId?: number;
  facultyId?: number;
  majorId?: number;
  departmentId?: number;
  entryYear?: number;
  /** نیمسال ورود (۱ = اول، ۲ = دوم، ۳ = تابستان) */
  entryTerm?: number;
  /** بازهٔ سال ورود (فرم‌های «از ورودی … تا ورودی …») */
  entryYearFrom?: number;
  entryYearTo?: number;
  /** جنسیت (MALE/FEMALE) — روی users.gender */
  gender?: string;
  /** سهمیه (NORMAL/SHAHED/STAFF/TOP_TALENT) */
  quotaType?: string;
  /** دامنهٔ وضعیت دانشجو: ACTIVE | INACTIVE | ALL (پیش‌فرض ALL) */
  statusScope?: string;
  /** وضعیت تحصیلیِ دقیق (ACTIVE | GRADUATED | EXPELLED | WITHDRAWN | SUSPENDED | TRANSFERRED | NO_SHOW | DECEASED) */
  status?: string;
  /** دامنهٔ گزارش: 'term' = فقط دانشجویانِ فعال در همان نیمسال، 'all' = کل دوره */
  scope?: string;
  q?: string;
  nationalCode?: string;
  miss?: string;
  page?: number;
  /** اندازهٔ صفحه برای مسیر چاپ/خروجی — پیش‌فرض ۵۰ (فقط برای کاهش رفت‌وبرگشت) */
  pageSize?: number;
  universityId?: number;
  /** فیلترهای سفارشی ماژول‌ها (مثل gradeStatus/samaCode/onlyStale) */
  [key: string]: string | number | boolean | undefined;
};

export type ReportColumn = {
  key: string;
  title: string;
  /**
   * قالب نمایش/خروجی سلول — در `@/lib/report-format` تفسیر می‌شود تا هیچ تاریخ
   * میلادی یا مبلغ بدون جداکننده به کاربر نرسد.
   */
  format?: 'DATE' | 'DATETIME' | 'MONEY' | 'AMOUNT' | 'NUMBER' | 'YEAR';
  /**
   * ستون‌های «دوخطی» (pair): فرم‌های رسمی مثل fqSumTa هر ستون را با **دو عددِ
   * انباشته** چاپ می‌کنند (شهریه متغیر روی شهریه ثابت). هر دو ستون یک `pair`
   * مشترک دارند و `line` نشان می‌دهد کدام خطِ بالای سلول را می‌گیرد.
   * رندر این دو ستون در یک `<td>` انجام می‌شود؛ CSV همچنان دو ستون جدا می‌دهد.
   */
  pair?: string;
  line?: 'top' | 'bottom';
};
/**
 * یک ردیفِ گزارش — علاوه بر ستونهای واقعی، میتواند «نشانگرهای ساختاری» داشته
 * باشد تا گزارشهای گروهبندیشده (مثل fqSumTa) بدون تغییر نوعِ `ReportResult.rows`
 * بتوانند ردیفِ «بند دانشکده» و «جمع رشته» را از ردیف داده تشخیص دهند.
 * رندرکنندهها (جدولِ صفحه و چاپ) فقط همین چهار کلید را میخوانند.
 */
export type ReportRow = Record<string, unknown> & {
  /** نوعِ ردیفِ ساختاری — نبودش یعنی ردیفِ معمولیِ داده */
  __kind?: 'band' | 'subtotal';
  /** متن برچسب (نام دانشکده / «جمع رشته») */
  __label?: string;
  /** کلیدِ ستونی که برچسب باید در آن نمایش داده شود */
  __labelCol?: string;
};

export type ReportResult = {
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  total: number;
  /**
   * جمعِ «قابل‌انتظار» پیش از اعمال هر سقفی (مثلاً سقف ۳۰۰۰ ردیف در گزارش
   * چنده‌ترمی). اگر از `total` بزرگ‌تر باشد، یعنی ردیف جا افتاده و سند/CSV
   * باید «ناقص» علامت بخورد. مسیر چاپ و خروجی از همین استفاده می‌کند.
   */
  expectedTotal?: number;
  /** آیا نتیجه پیش از این بریده شده است؟ (سقف ترم/سقف ماژول) */
  truncated?: boolean;
  page: number;
  per: number;
  totalPages: number;
  summary?: string;
  /**
   * ردیفِ «جمع» برای پایینِ جدول (tfoot) — مثل فرم‌های رسمیِ کاغذی که یک ردیفِ
   * جمعِ سیاه در انتها دارند. فقط ماژول‌هایی که خودشان این ردیف را می‌سازند
   * پر می‌کنند؛ کلیدها همان `columns[].key` هستند. این ردیف **جزو** `rows`
   * نیست، پس صفحه‌بندی/CSV دست‌نخورده می‌ماند.
   */
  totals?: Record<string, unknown>;
};

export type FilterOptions = {
  terms: { code: string; title: string | null }[];
  degrees: { id: number; title: string }[];
  faculties: { id: number; name: string }[];
  departments: { id: number; name: string; code: string | null }[];
  majors: { id: number; name: string; code: string | null }[];
  entryYears: number[];
  latestTerm: string;
  universities: { id: number; code: string; title: string; kind: string }[];
  /** نام دانشگاهِ فعال (پروفایل دانشگاه ← تنظیمات UNIVERSITY_NAME) */
  universityTitle: string;
  /** آرم دانشگاهِ فعال (universities.logoUrl ← تنظیمات UNIVERSITY_LOGO) */
  universityLogoUrl: string;
  /** برچسب جایگاههای امضای فرم جاری، از «تنظیمات سامانه» */
  signers: string[];
};

export const NUM = sql`e."gradeValue"::text ~ '^[0-9]+(\\.[0-9]+)?$'`;

export function faStatus(s: unknown): string {
  const k = String(s ?? '');
  return STUDENT_STATUS_FA[k] ?? k;
}

/** هلپرهای مشترک گزارش‌ها — ماژول‌های r-*.ts از همین‌ها استفاده می‌کنند */
export function studentWhere(f: ReportFilters, alias = 's') {
  const a = sql.identifier(alias);
  const c = [];
  // تفکیک دانشگاه اجباری (fail-closed): بدون دانشگاهِ معتبر هیچ ردیفی برنگردان
  // ⚠ پیش‌تر وقتی runReport برای دانشگاه نامشخص مقدار -1 می‌گذاشت، شرط
  //   «= -1 OR IS NULL» می‌شد و ردیف‌های بدون دانشگاه به‌جای «هیچ»، همه برمی‌گشتند.
  // 🔒 شاخهٔ `OR IS NULL` حذف شد: دانشجوی بدون دانشگاه (مثلاً خروجی ایمپورت سنجش)
  //   به همهٔ دانشگاه‌ها نمایش داده می‌شد. صفر/نامعتبر = هیچ ردیف؛ دادهٔ بدون
  //   دانشگاه باید با backfill اصلاح شود، نه با بازکردن مرز بین دانشگاه‌ها.
  if (isRealUniversityId(f.universityId)) c.push(sql`${a}."universityId" = ${f.universityId}`);
  else c.push(sql`1 = 0`);
  // مقطع: عنوان‌ها در کاتالوگ تکراری‌اند (SAMA/HAMAVA) — با عنوان تطبیق بده تا همهٔ شناسه‌های هم‌عنوان بیایند
  if (f.degreeId) c.push(sql`${a}."degreeLevelId" IN (SELECT id FROM degree_level_configs WHERE title = (SELECT title FROM degree_level_configs WHERE id = ${f.degreeId}))`);
  if (f.facultyId) c.push(sql`m."facultyId" = ${f.facultyId}`);
  if (f.departmentId) c.push(sql`m."departmentId" = ${f.departmentId}`);
  if (f.majorId) c.push(sql`${a}."majorId" = ${f.majorId}`);
  if (f.entryYear) c.push(sql`${a}."entryYear" = ${f.entryYear}`);  /* ── لیستِ کدهای دانشجویی (چسباندن از Excel) ──
     فقط دانشجویانِ همان فهرست. اگر متن داده شده ولی هیچ کد معتبری ندارد،
     `1=0` می‌گذاریم تا فیلترِ خراب به «همهٔ دانشجویان» تبدیل نشود. */
  if (typeof f.studentCodes === 'string' && f.studentCodes.trim()) {
    const picked = parseCodeList(f.studentCodes, { minDigits: 4, maxDigits: 20 }).codes;
    if (!picked.length) {
      c.push(sql`1 = 0`);
    } else {
      c.push(sql`${a}."studentCode" IN (${sql.join(picked.map((code) => sql`${code}`), sql`, `)})`);
    }
  }
  if (f.entryYearFrom) c.push(sql`${a}."entryYear" >= ${Number(f.entryYearFrom)}`);
  if (f.entryYearTo) c.push(sql`${a}."entryYear" <= ${Number(f.entryYearTo)}`);
  if (f.entryTerm) c.push(sql`${a}."entryTerm" = ${Number(f.entryTerm)}`);
  if (f.gender === 'MALE' || f.gender === 'FEMALE') c.push(sql`u."gender" = ${f.gender}`);
  if (f.quotaType) c.push(sql`${a}."quotaType" = ${String(f.quotaType)}`);
  // دامنهٔ وضعیت: پیش‌فرض «همه» تا با فرم‌های قدیم (فعال/غیرفعال/همه) یکی باشد
  if (f.statusScope === 'ACTIVE') c.push(sql`${a}."status" = 'ACTIVE'`);
  else if (f.statusScope === 'INACTIVE') c.push(sql`${a}."status" <> 'ACTIVE'`);
  /* ── وضعیت تحصیلیِ دقیق (انتخاب کاربر از منوی گزارش‌ها) ──
     'ALL' یا خالی = بدون فیلتر. بقیه دقیقاً روی s.status اعمال می‌شود. */
  if (f.status && f.status !== 'ALL') {
    c.push(sql`${a}."status" = ${String(f.status)}`);
  }
  /* ── دامنه: «کل دوره» یا «فقط همین نیمسال» ──
     وقتی scope='term' باشد، فقط دانشجویانی می‌آیند که در نیمسال انتخابی
     «فعالیت» دارند (ثبت‌نام یا ردیف دفتر مالی). بدون این شرط، گزارشِ ترم
     دانشجویانِ بی‌ارتباطِ ترم‌های دیگر را هم می‌آورد. */
  if (f.scope === 'term' && f.term) {
    c.push(sql`(
      EXISTS (
        SELECT 1 FROM enrollments en
          JOIN course_offerings co ON co.id = en."offeringId"
          JOIN academic_terms t2 ON t2.id = co."termId"
        WHERE en."studentId" = ${a}.id AND t2."termCode" = ${String(f.term)}
      ) OR EXISTS (
        SELECT 1 FROM student_ledger sl2
          JOIN academic_terms t3 ON t3.id = sl2."termId"
        WHERE sl2."studentId" = ${a}.id AND t3."termCode" = ${String(f.term)}
      )
    )`);
  }
  if (f.nationalCode) {
    // کدهای ذخیره‌شده انگلیسی‌اند؛ ارقام فارسی ورودی نرمال می‌شود تا کدهای SA/SS هم پیدا شوند.
    // فرار ٪ _ \ تا wildcard تزریقی معنا نگیرد (با ESCAPE '\').
    const like = `%${escapeLikeChars(toEnDigits(String(f.nationalCode)))}%`;
    c.push(sql`u."nationalCode" ILIKE ${like} ESCAPE '\\'`);
  }
  if (f.q) {
    const like = `%${escapeLikeChars(toEnDigits(String(f.q)))}%`;
    c.push(sql`(${a}."studentCode" ILIKE ${like} ESCAPE '\\' OR u."firstName" ILIKE ${like} ESCAPE '\\' OR u."lastName" ILIKE ${like} ESCAPE '\\' OR u."nationalCode" ILIKE ${like} ESCAPE '\\')`);
  }
  return c;
}

/** شرطِ «فقط کدهای دانشجوییِ این فهرست» — null یعنی فیلتری اعمال نشود */
export function studentCodeCond(f: ReportFilters, alias = 's') {
  if (typeof f.studentCodes !== 'string' || !f.studentCodes.trim()) return null;
  const picked = parseCodeList(f.studentCodes, { minDigits: 4, maxDigits: 20 }).codes;
  if (!picked.length) return sql`1 = 0`;
  return sql`${sql.identifier(alias)}."studentCode" IN (${sql.join(picked.map((code) => sql`${code}`), sql`, `)})`;
}

export function joinAnd(conds: ReturnType<typeof sql>[]) {
  if (!conds.length) return sql``;
  return sql`WHERE ${sql.join(conds, sql` AND `)}`;
}

export async function paged(
  columns: ReportColumn[],
  baseFrom: ReturnType<typeof sql>,
  whereConds: ReturnType<typeof sql>[],
  selectCols: ReturnType<typeof sql>,
  orderBy: ReturnType<typeof sql>,
  f: ReportFilters,
  groupBy?: ReturnType<typeof sql>,
  having?: ReturnType<typeof sql>,
): Promise<ReportResult> {
  const page = Math.max(1, f.page || 1);
  // اندازهٔ صفحه: پیش‌فرض PER؛ مسیر چاپ/CSV با pageSize بزرگ‌تر (تا ۱۰۰۰)
  // تعداد رفت‌وبرگشت‌ها را کم می‌کند. رفتار صفحهٔ عادی دست‌نخورده می‌ماند.
  const per = Math.min(Math.max(1, Number(f.pageSize) || PER), 1000);
  const where = joinAnd(whereConds);
  const grp = groupBy ? sql`GROUP BY ${groupBy}` : sql``;
  const hav = having ? sql`HAVING ${having}` : sql``;
  // شمارش و داده هم‌زمان اجرا می‌شوند (هر دو به هم وابسته نیستند)؛ فقط اگر
  // شمارهٔ صفحه از محدوده بیرون باشد، یک بار دیگر با صفحهٔ نهایی خوانده می‌شود.
  const dataSql = (safePage: number) =>
    sql`SELECT ${selectCols} ${baseFrom} ${where} ${grp} ${hav} ${orderBy} LIMIT ${per} OFFSET ${(safePage - 1) * per}`;
  const [cnt, firstData] = await Promise.all([
    db.execute<{ n: string }>(
      sql`SELECT COUNT(*)::int AS n FROM (SELECT 1 ${baseFrom} ${where} ${grp} ${hav}) t`,
    ),
    db.execute<Record<string, unknown>>(dataSql(page)),
  ]);
  const total = Number(cnt.rows[0]?.n ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / per));
  const safe = Math.min(page, totalPages);
  const rows = safe === page
    ? firstData.rows
    : (await db.execute<Record<string, unknown>>(dataSql(safe))).rows;
  return { columns, rows, total, page: safe, per, totalPages };
}

export const STU_FROM = sql`FROM students s JOIN users u ON u.id = s."userId" LEFT JOIN majors m ON m.id = s."majorId" LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId" LEFT JOIN faculties fc ON fc.id = m."facultyId"`;
export const STU_COLS = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name, u."nationalCode" AS nc, m.name AS major, d.title AS degree, s."entryYear" AS y, s.status AS st`;

export async function studentListReport(
  columns: ReportColumn[],
  extraConds: ReturnType<typeof sql>[],
  f: ReportFilters,
  orderDefault: ReturnType<typeof sql> = sql`ORDER BY s."studentCode"`,
): Promise<ReportResult> {
  const r = await paged(columns, STU_FROM, [...studentWhere(f), ...extraConds], STU_COLS, orderDefault, f);
  r.rows = r.rows.map(x => ({ ...x, st: faStatus(x.st) }));
  return r;
}

/** همهٔ kindهای گزارش (قدیم + موج ۲ + جمع‌آوری‌شده) — برای فیلتر مجازها در UI */
export const ALL_REPORT_KINDS: string[] = [
  'active-term', 'status-summary', 'by-faculty', 'by-major', 'grade-status', 'probation',
  'top', 'incomplete', 'graduates', 'entries', 'noshow', 'transfers', 'tuition',
  'payesh', 'jame', 'docs', 'third-attempt',
  'probation-violations', 'probation-chains', 'unit-cap-violations', 'repeated-courses',
  'student-weekly-conflicts', 'student-exam-conflicts', 'prereq-violations', 'course-grade-status',
  'enrollment-pick', 'offered-course-roster', 'top-students', 'no-photo', 'graduates-info',
  'status-report', 'major-change-report', 'status-change-report', 'gpa-refresh-preview',
  'profile-refresh', 'portal-export', 'exam-session-sheet', 'seat-numbers', 'final-exam-schedule',
  'grade-entry-report', 'grade-deadline', 'empty-rooms', 'weekly-timetable', 'room-conflicts',
  'low-enrollment', 'makeup-courses', 'staff-list', 'staff-courses', 'staff-timetable',
  'attendance-list', 'tuition-tariff', 'tuition-statement', 'pending-requests', 'defenses',
  'proposals', 'council-edu', 'letter-templates', 'transcript-card', 'exam-entry-card',
  'student-card', 'study-cert', 'edu-confirm', 'grad-cert', 'military-defer',
  'finance-worklist', 'payroll-overview', 'bi-teaching-quality', 'bi-facilities',
  'graduation-dossiers', 'grade-audit-log',
  // تشکیل کلاس استادان (r-prof-class)
  'prof-formation-summary', 'prof-formation-detail', 'prof-formation-none', 'prof-sessions-unformed',
  // گزارش‌های پرداختی/مالی هم‌ریخت با اسناد سما (r-finance)
  'total-payments', 'student-payments', 'term-payments', 'accounting-voucher', 'term-financial',
  // گزارش‌های مدیریتی تجمیعی شهریه (دانشکده/مقطع/رشته/ورودی)
  'tuition-overview', 'tuition-faculty-detail', 'faculty-financial', 'major-financial', 'semester-financial',
  // فرمِ رسمیِ «گزارش تفصیلی مالی دانشجویان در نیمسال» (fqTrDaTe2)
  'semester-detail',
  // فرمِ رسمیِ «گزارش مالی نیمسال به تفکیک رشته تحصیلی و نیمسال ورود» (fqSumTa)
  'semester-major-detail',
  // گزارش‌های مالیِ کلان (r-finance-statements) — سود و زیان، ترازنامه،
  // نقدینگی، پیمانکاری، بیمه/حقوقی/VAT، کالا، هزینه، تخصیص، درآمد سلسله‌مراتبی
  'sales-report', 'income-statement', 'costing-report', 'budget-variance',
  'balance-sheet', 'cash-flow',
  'contractor-report', 'contractor-settlement',
  'insurance-report', 'legal-report', 'vat-report',
  'general-ledger', 'daily-journal', 'inventory-report', 'company-expenses',
  'allocation-report', 'revenue-hierarchy',
  // دفتر کل دوطرفه (r-gl) — تراز آزمایشی، ترازنامهٔ واقعی، صورت سود و زیان
  'gl-trial-balance', 'gl-balance-sheet', 'gl-income-statement',
];

/** گیت ماتریس دسترسی برای هر گزارش: ADMIN آزاد، بقیه نیازمند reports:<kind> */
