// ══════════════════════════════════════════════════════════════════════
// هلپرها و تایپ‌های مشترک گزارش‌ها (بدون 'use server' — چون توابع/ثابت‌های
// غیرasync هم اکسپورت می‌کند؛ فایل‌های r-*.ts و actions.ts از اینجا می‌خوانند.
// ══════════════════════════════════════════════════════════════════════
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { STUDENT_STATUS_FA } from '@/lib/student-labels';

export const PER = 50;

export type ReportFilters = {
  term?: string;
  degreeId?: number;
  facultyId?: number;
  majorId?: number;
  departmentId?: number;
  entryYear?: number;
  q?: string;
  nationalCode?: string;
  miss?: string;
  page?: number;
  universityId?: number;
  /** فیلترهای سفارشی ماژول‌ها (مثل gradeStatus/samaCode/onlyStale) */
  [key: string]: string | number | boolean | undefined;
};

export type ReportColumn = { key: string; title: string };
export type ReportResult = {
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  per: number;
  totalPages: number;
  summary?: string;
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
};

export const NUM = sql`e."gradeValue" ~ '^[0-9]+(\\.[0-9]+)?$'`;

export function faStatus(s: unknown): string {
  const k = String(s ?? '');
  return STUDENT_STATUS_FA[k] ?? k;
}

/** هلپرهای مشترک گزارش‌ها — ماژول‌های r-*.ts از همین‌ها استفاده می‌کنند */
export function studentWhere(f: ReportFilters, alias = 's') {
  const a = sql.identifier(alias);
  const c = [];
  if (f.universityId) c.push(sql`(${a}."universityId" = ${f.universityId} OR ${a}."universityId" IS NULL)`);
  // مقطع: عنوان‌ها در کاتالوگ تکراری‌اند (SAMA/HAMAVA) — با عنوان تطبیق بده تا همهٔ شناسه‌های هم‌عنوان بیایند
  if (f.degreeId) c.push(sql`${a}."degreeLevelId" IN (SELECT id FROM degree_level_configs WHERE title = (SELECT title FROM degree_level_configs WHERE id = ${f.degreeId}))`);
  if (f.facultyId) c.push(sql`m."facultyId" = ${f.facultyId}`);
  if (f.departmentId) c.push(sql`m."departmentId" = ${f.departmentId}`);
  if (f.majorId) c.push(sql`${a}."majorId" = ${f.majorId}`);
  if (f.entryYear) c.push(sql`${a}."entryYear" = ${f.entryYear}`);
  if (f.nationalCode) {
    const like = `%${f.nationalCode}%`;
    c.push(sql`u."nationalCode" ILIKE ${like}`);
  }
  if (f.q) {
    const like = `%${f.q}%`;
    c.push(sql`(${a}."studentCode" ILIKE ${like} OR u."firstName" ILIKE ${like} OR u."lastName" ILIKE ${like} OR u."nationalCode" ILIKE ${like})`);
  }
  return c;
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
  const where = joinAnd(whereConds);
  const grp = groupBy ? sql`GROUP BY ${groupBy}` : sql``;
  const hav = having ? sql`HAVING ${having}` : sql``;
  const cnt = await db.execute<{ n: string }>(
    sql`SELECT COUNT(*)::int AS n FROM (SELECT 1 ${baseFrom} ${where} ${grp} ${hav}) t`,
  );
  const total = Number(cnt.rows[0]?.n ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PER));
  const safe = Math.min(page, totalPages);
  const data = await db.execute<Record<string, unknown>>(
    sql`SELECT ${selectCols} ${baseFrom} ${where} ${grp} ${hav} ${orderBy} LIMIT ${PER} OFFSET ${(safe - 1) * PER}`,
  );
  return { columns, rows: data.rows, total, page: safe, per: PER, totalPages };
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
];

/** گیت ماتریس دسترسی برای هر گزارش: ADMIN آزاد، بقیه نیازمند reports:<kind> */
