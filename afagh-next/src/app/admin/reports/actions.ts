'use server';

import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import {
  NUM,
  PER,
  STU_COLS,
  STU_FROM,
  faStatus,
  joinAnd,
  paged,
  studentListReport,
  studentWhere,
} from './report-helpers';
import type { FilterOptions, ReportColumn, ReportFilters, ReportResult } from './report-helpers';
export type { FilterOptions, ReportColumn, ReportFilters, ReportResult } from './report-helpers';

// ── ماژول‌های گزارش (هر خانواده یک فایل r-*.ts؛ اولین غیرnull برنده است) ──
import { run as runClass } from './r-class';
import { run as runCouncilLetters } from './r-council-letters';
import { run as runEduProbation } from './r-edu-probation';
import { run as runEduRoster } from './r-edu-roster';
import { run as runEduSchedule } from './r-edu-schedule';
import { run as runExam } from './r-exam';
import { run as runFinance } from './r-finance';
import { run as runStaff } from './r-staff';
import { run as runStatusOps } from './r-status-ops';
import { run as runThesis } from './r-thesis';
import { run as runCollect } from './r-collect-external';

const ROLES = ['ADMIN', 'EDU_EXPERT', 'ARCHIVE_EXPERT', 'MILITARY_OFFICER'] as never[];
export async function getFilterOptions({ universityId }: { universityId?: number } = {}): Promise<FilterOptions> {
  await requireRole(ROLES);
  const terms = await db.execute<{ code: string; title: string | null }>(
    universityId
      ? sql`SELECT DISTINCT "termCode" AS code, MAX(title) AS title FROM academic_terms WHERE "universityId" = ${universityId} GROUP BY "termCode" ORDER BY "termCode" DESC`
      : sql`SELECT DISTINCT "termCode" AS code, MAX(title) AS title FROM academic_terms GROUP BY "termCode" ORDER BY "termCode" DESC`,
  );
  const degrees = await db.execute<{ id: number; title: string }>(
    sql`SELECT MIN(id) AS id, title FROM degree_level_configs GROUP BY title ORDER BY MIN(id)`,
  );
  const faculties = await db.execute<{ id: number; name: string }>(
    universityId
      ? sql`SELECT id, name FROM faculties WHERE "universityId" = ${universityId} OR "universityId" IS NULL ORDER BY id`
      : sql`SELECT id, name FROM faculties ORDER BY id`,
  );
  const departments = await db.execute<{ id: number; name: string; code: string | null }>(
    universityId
      ? sql`SELECT id, name, "departmentCode" AS code FROM departments WHERE "universityId" = ${universityId} OR "universityId" IS NULL ORDER BY name`
      : sql`SELECT id, name, "departmentCode" AS code FROM departments ORDER BY name`,
  );
  const majors = await db.execute<{ id: number; name: string; code: string | null }>(
    universityId
      ? sql`SELECT id, name, "majorCode" AS code FROM majors WHERE "universityId" = ${universityId} OR "universityId" IS NULL ORDER BY name`
      : sql`SELECT id, name, "majorCode" AS code FROM majors ORDER BY name`,
  );
  const years = await db.execute<{ y: number }>(
    sql`SELECT DISTINCT "entryYear" AS y FROM students ${universityId ? sql`WHERE "universityId" = ${universityId}` : sql``} ORDER BY 1 DESC`,
  );
  return {
    terms: terms.rows,
    degrees: degrees.rows,
    faculties: faculties.rows,
    departments: departments.rows,
    majors: majors.rows,
    entryYears: years.rows.map(r => Number(r.y)),
    latestTerm: terms.rows[0]?.code ?? '',
    universities: (await db.execute<{ id: number; code: string; title: string; kind: string }>(
      sql`SELECT id, code, title, kind FROM universities WHERE "isActive" = 1 ORDER BY id`
    )).rows,
  };
}

export async function assertReportPermission(kind: string): Promise<void> {
  const user = await requireRole(ROLES);
  if (user.roles.includes('ADMIN')) return;
  const { hasPermission } = await import('@/lib/permissions-enforcer');
  if (!(await hasPermission(user.id, `reports:${kind}`))) {
    throw new Error('دسترسی به این گزارش در ماتریس دسترسی‌ها داده نشده است.');
  }
}

/** گزارش‌هایی که کاربر جاری مجاز است (برای فیلتر کارت‌ها) — ADMIN یعنی همه */
export async function allowedReportKinds(kinds: string[]): Promise<string[] | null> {
  const user = await requireRole(ROLES);
  if (user.roles.includes('ADMIN')) return null;
  const { getUserPermissions } = await import('@/lib/permissions-enforcer');
  const perms = await getUserPermissions(user.id);
  return kinds.filter(k => perms.has(`reports:${k}`));
}

export async function runReport(kind: string, f: ReportFilters): Promise<ReportResult> {
  await requireRole(ROLES);
  await assertReportPermission(kind);
  const term = f.term || '';

  switch (kind) {
    // ── دانشجویان فعال هر ترم ──
    case 'active-term': {
      const effectiveTerm = term || (await db.execute<{ code: string }>(sql`SELECT "termCode" AS code FROM academic_terms ORDER BY "termCode" DESC LIMIT 1`)).rows[0]?.code || '';
      const conds = [sql`t."termCode" = ${effectiveTerm}`, ...studentWhere(f)];
      const from = sql`FROM enrollments e JOIN course_offerings o ON o.id = e."offeringId" JOIN academic_terms t ON t.id = o."termId" JOIN students s ON s.id = e."studentId" JOIN users u ON u.id = s."userId" LEFT JOIN majors m ON m.id = s."majorId" LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"`;
      const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name, m.name AS major, d.title AS degree, COUNT(e.id)::int AS units, ROUND(AVG(CASE WHEN e."gradeStatus" = 'FINALIZED' AND ${NUM} THEN e."gradeValue"::numeric END), 2) AS avg`;
      const r = await paged(
        [
          { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
          { key: 'major', title: 'رشته' }, { key: 'degree', title: 'مقطع' },
          { key: 'units', title: 'تعداد درس' }, { key: 'avg', title: 'میانگین' },
        ],
        from, conds, cols, sql`ORDER BY code`, f,
        sql`s."studentCode", u."firstName", u."lastName", m.name, d.title`,
      );
      r.summary = `${r.total.toLocaleString('fa-IR')} دانشجو در ترم ${effectiveTerm}`;
      return r;
    }

    // ── خلاصه وضعیت تحصیلی ──
    case 'status-summary': {
      const uniCond = f.universityId ? sql`WHERE (s."universityId" = ${f.universityId} OR s."universityId" IS NULL)` : sql``;
      const data = await db.execute<Record<string, unknown>>(sql`
        SELECT s.status AS st, d.title AS degree, COUNT(*)::int AS n
        FROM students s LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"
        ${uniCond}
        GROUP BY s.status, d.title ORDER BY 1, 2`);
      const rows = data.rows.map(x => ({ st: faStatus(x.st), degree: x.degree, n: x.n }));
      const total = rows.reduce((a, x) => a + Number(x.n), 0);
      return {
        columns: [{ key: 'st', title: 'وضعیت' }, { key: 'degree', title: 'مقطع' }, { key: 'n', title: 'تعداد' }],
        rows, total, page: 1, per: total || 1, totalPages: 1,
        summary: `جمع کل: ${total.toLocaleString('fa-IR')} پرونده`,
      };
    }

    // ── به تفکیک دانشکده ──
    case 'by-faculty': {
      const uniCond = f.universityId ? sql`WHERE (s."universityId" = ${f.universityId} OR s."universityId" IS NULL)` : sql``;
      const data = await db.execute<Record<string, unknown>>(sql`
        SELECT COALESCE(fc.name, '— بدون دانشکده —') AS faculty, s.status AS st, COUNT(*)::int AS n
        FROM students s LEFT JOIN majors m ON m.id = s."majorId" LEFT JOIN faculties fc ON fc.id = m."facultyId"
        ${uniCond}
        GROUP BY fc.name, s.status ORDER BY 1, 2`);
      const acc = new Map<string, Record<string, unknown>>();
      for (const r of data.rows) {
        const k = String(r.faculty);
        if (!acc.has(k)) acc.set(k, { faculty: k, total: 0 });
        const o = acc.get(k)!;
        o[String(r.st)] = r.n;
        o.total = Number(o.total) + Number(r.n);
      }
      const statuses = [...new Set(data.rows.map(r => String(r.st)))];
      const rows = [...acc.values()].map(o => {
        const out: Record<string, unknown> = { faculty: o.faculty, total: o.total };
        for (const s of statuses) out[s] = Number(o[s] ?? 0) ? `${Number(o[s]).toLocaleString('fa-IR')} ${faStatus(s)}` : '—';
        return out;
      });
      const cols: ReportColumn[] = [{ key: 'faculty', title: 'دانشکده' }, { key: 'total', title: 'جمع' },
        ...statuses.map(s => ({ key: s, title: faStatus(s) }))];
      return { columns: cols, rows, total: rows.length, page: 1, per: rows.length || 1, totalPages: 1 };
    }

    // ── به تفکیک رشته ──
    case 'by-major': {
      const conds = studentWhere(f);
      const where = joinAnd(conds);
      const data = await db.execute<Record<string, unknown>>(sql`
        SELECT m."majorCode" AS code, m.name AS major, d.title AS degree, COALESCE(fc.name, '—') AS faculty,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE s.status = 'ACTIVE')::int AS a,
          COUNT(*) FILTER (WHERE s.status = 'GRADUATED')::int AS g,
          COUNT(*) FILTER (WHERE s.status = 'WITHDRAWN')::int AS w,
          COUNT(*) FILTER (WHERE s.status = 'NO_SHOW')::int AS n
        ${STU_FROM} ${where}
        GROUP BY m."majorCode", m.name, d.title, fc.name ORDER BY total DESC`);
      return {
        columns: [
          { key: 'code', title: 'کد' }, { key: 'major', title: 'رشته' },
          { key: 'degree', title: 'مقطع' }, { key: 'faculty', title: 'دانشکده' },
          { key: 'total', title: 'جمع' }, { key: 'a', title: 'فعال' },
          { key: 'g', title: 'فارغ‌التحصیل' }, { key: 'w', title: 'انصراف' }, { key: 'n', title: 'عدم مراجعه' },
        ],
        rows: data.rows, total: data.rows.length, page: 1, per: data.rows.length || 1, totalPages: 1,
      };
    }

    // ── وضعیت نمرات ترم ──
    case 'grade-status': {
      const uniCond = f.universityId ? sql`AND (s."universityId" = ${f.universityId} OR s."universityId" IS NULL)` : sql``;
      const data = await db.execute<Record<string, unknown>>(sql`
        SELECT e."gradeStatus" AS st, COUNT(*)::int AS n,
          ROUND(AVG(CASE WHEN ${NUM} THEN e."gradeValue"::numeric END), 2) AS avg
        FROM enrollments e JOIN course_offerings o ON o.id = e."offeringId" JOIN academic_terms t ON t.id = o."termId"
        JOIN students s ON s.id = e."studentId"
        WHERE t."termCode" = ${term} ${uniCond} GROUP BY 1 ORDER BY 2 DESC`);
      const total = data.rows.reduce((a, x) => a + Number(x.n), 0);
      return {
        columns: [{ key: 'st', title: 'وضعیت نمره' }, { key: 'n', title: 'تعداد' }, { key: 'avg', title: 'میانگین نمرات' }],
        rows: data.rows, total, page: 1, per: data.rows.length || 1, totalPages: 1,
        summary: `${total.toLocaleString('fa-IR')} رکورد نمره در ترم ${term}`,
      };
    }

    // ── مشروطی‌های ترم ──
    case 'probation': {
      const from = sql`FROM enrollments e JOIN course_offerings o ON o.id = e."offeringId" JOIN academic_terms t ON t.id = o."termId" JOIN students s ON s.id = e."studentId" JOIN users u ON u.id = s."userId" LEFT JOIN majors m ON m.id = s."majorId"`;
      const conds = [sql`t."termCode" = ${term}`, sql`e."gradeStatus" = 'FINALIZED'`, sql`${NUM}`, ...studentWhere(f)];
      const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name, m.name AS major, COUNT(*)::int AS units, ROUND(AVG(e."gradeValue"::numeric), 2) AS avg`;
      const r = await paged(
        [
          { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
          { key: 'major', title: 'رشته' }, { key: 'units', title: 'درس نهایی‌شده' }, { key: 'avg', title: 'میانگین ترم' },
        ],
        from, conds, cols, sql`ORDER BY avg`, f,
        sql`s."studentCode", u."firstName", u."lastName", m.name`,
        sql`AVG(e."gradeValue"::numeric) < 12 AND COUNT(*) >= 2`,
      );
      r.summary = `${r.total.toLocaleString('fa-IR')} مشروط در ترم ${term}`;
      return r;
    }

    // ── نمرات برتر هر رشته ──
    case 'top': {
      const from = sql`FROM enrollments e JOIN students s ON s.id = e."studentId" JOIN users u ON u.id = s."userId" LEFT JOIN majors m ON m.id = s."majorId" LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"`;
      const conds = [sql`e."gradeStatus" = 'FINALIZED'`, sql`${NUM}`, ...studentWhere(f)];
      const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name, m.name AS major, d.title AS degree, s."entryYear" AS y, COUNT(*)::int AS units, ROUND(AVG(e."gradeValue"::numeric), 2) AS avg`;
      return paged(
        [
          { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
          { key: 'major', title: 'رشته' }, { key: 'degree', title: 'مقطع' },
          { key: 'y', title: 'ورودی' }, { key: 'units', title: 'درس' }, { key: 'avg', title: 'میانگین کل' },
        ],
        from, conds, cols, sql`ORDER BY avg DESC`, f,
        sql`s."studentCode", u."firstName", u."lastName", m.name, d.title, s."entryYear"`,
        sql`COUNT(*) >= 10 AND AVG(e."gradeValue"::numeric) >= 17`,
      );
    }

    // ── پرونده‌های ناقص (تکمیلی) ──
    case 'incomplete': {
      const miss = f.miss || 'national';
      const extra =
        miss === 'mobile' ? sql`u.mobile IS NULL OR u.mobile = '' OR u.mobile = '—'` :
        miss === 'major' ? sql`s."majorId" IS NULL` :
        sql`u."nationalCode" IS NULL OR u."nationalCode" !~ '^[0-9]{10}$'`;
      return studentListReport(
        [
          { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
          { key: 'nc', title: 'کد ملی' }, { key: 'major', title: 'رشته' },
          { key: 'degree', title: 'مقطع' }, { key: 'y', title: 'ورودی' }, { key: 'st', title: 'وضعیت' },
        ],
        [extra], f,
      );
    }

    // ── دروس بار سوم (مردودی دو بار قبلی) ──
    // «بار سوم» یعنی ثبت‌نام جاری (هنوز نمره‌نخورده) در ترمی که فیلتر ترم انتخاب
    // کرده، به‌علاوهٔ حداقل دو مردودی نهایی از **کل سابقه** (نه فقط همان ترم)؛
    // شمارش سابقه در LATERAL انجام می‌شود تا فیلتر ترم فقط «اخذِ جاری» را محدود کند.
    case 'third-attempt': {
      const from = sql`FROM enrollments ce
        JOIN course_offerings o ON o.id = ce."offeringId"
        JOIN courses c ON c.id = o."courseId"
        JOIN academic_terms t ON t.id = o."termId"
        JOIN students s ON s.id = ce."studentId"
        JOIN users u ON u.id = s."userId"
        LEFT JOIN majors m ON m.id = s."majorId"
        LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"
        JOIN LATERAL (
          SELECT COUNT(*) FILTER (WHERE e."status" <> 'DROPPED')::int AS total_attempts,
            COUNT(*) FILTER (WHERE e."gradeStatus" = 'FINALIZED' AND ${NUM} AND e."gradeValue"::numeric < 10)::int AS failed_count,
            (ARRAY_AGG(e."gradeValue" ORDER BY t2."sortOrder" DESC NULLS LAST, t2."termCode" DESC, o2.id DESC)
              FILTER (WHERE e."gradeStatus" = 'FINALIZED' AND ${NUM}))[1] AS last_grade
          FROM enrollments e
            JOIN course_offerings o2 ON o2.id = e."offeringId"
            JOIN academic_terms t2 ON t2.id = o2."termId"
          WHERE e."studentId" = ce."studentId" AND o2."courseId" = o."courseId"
        ) h ON h.failed_count >= 2`;
      const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name,
        m.name AS major, d.title AS degree, s."entryYear" AS y,
        c.code AS course_code, c.title AS course_title,
        h.total_attempts, h.failed_count, t."termCode" AS current_term, h.last_grade`;
      const r = await paged(
        [
          { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
          { key: 'major', title: 'رشته' }, { key: 'degree', title: 'مقطع' },
          { key: 'y', title: 'ورودی' }, { key: 'course_code', title: 'کد درس' },
          { key: 'course_title', title: 'نام درس' }, { key: 'total_attempts', title: 'تکل تلاش' },
          { key: 'failed_count', title: 'تکرار مردودی' }, { key: 'current_term', title: 'ترم جاری' },
          { key: 'last_grade', title: 'آخرین نمره' },
        ],
        from,
        [
          sql`s.status = 'ACTIVE'`,
          sql`ce."status" IN ('REGISTERED', 'PENDING_COUNCIL', 'WAITLISTED')`,
          ...(term ? [sql`t."termCode" = ${term}`] : []),
          ...studentWhere(f),
        ],
        cols,
        sql`ORDER BY failed_count DESC, last_grade ASC NULLS LAST`,
        f,
        sql`s."studentCode", u."firstName", u."lastName", m.name, d.title, s."entryYear", c.code, c.title, t."termCode", h.total_attempts, h.failed_count, h.last_grade`,
      );
      r.summary = `${r.total.toLocaleString('fa-IR')} درس بار سوم (مردودی از کل سابقه) — ${term ? `اخذ در ترم ${term}` : 'اخذ در همه ترم‌ها'}`;
      return r;
    }

    // ── دانش‌آموختگان / ورودی‌ها / عدم مراجعه / انتقالی / میهمان ──
    case 'graduates':
      return studentListReport(
        [
          { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
          { key: 'nc', title: 'کد ملی' }, { key: 'major', title: 'رشته' },
          { key: 'degree', title: 'مقطع' }, { key: 'y', title: 'ورودی' },
        ],
        [sql`s.status = 'GRADUATED'`], f,
      );
    case 'entries': {
      const years = await db.execute<{ y: number }>(sql`SELECT DISTINCT "entryYear" AS y FROM students ORDER BY 1 DESC LIMIT 1`);
      const y = f.entryYear || Number(years.rows[0]?.y ?? 0);
      const r = await studentListReport(
        [
          { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
          { key: 'major', title: 'رشته' }, { key: 'degree', title: 'مقطع' }, { key: 'st', title: 'وضعیت' },
        ],
        [sql`s."entryYear" = ${y}`], f,
      );
      r.summary = `ورودی ${y} — ${r.total.toLocaleString('fa-IR')} نفر`;
      return r;
    }
    case 'noshow':
      return studentListReport(
        [
          { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
          { key: 'nc', title: 'کد ملی' }, { key: 'major', title: 'رشته' },
          { key: 'degree', title: 'مقطع' }, { key: 'y', title: 'ورودی' },
        ],
        [sql`s.status = 'NO_SHOW'`], f,
      );
    case 'transfers': {
      // Get transfer/guest students with the term they attended as guest/transfer
      const uniCond = f.universityId ? sql`AND (s."universityId" = ${f.universityId} OR s."universityId" IS NULL)` : sql``;
      const data = await db.execute<Record<string, unknown>>(sql`
        SELECT s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name,
          u."nationalCode" AS nc, m.name AS major, d.title AS degree, s."entryYear" AS y,
          s.status AS st,
          sts."termCode" AS guest_transfer_term,
          sts."statusTitle" AS guest_transfer_status
        FROM students s JOIN users u ON u.id = s."userId"
          LEFT JOIN majors m ON m.id = s."majorId"
          LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"
          LEFT JOIN student_term_states sts ON sts."studentId" = s.id
            AND (sts."normalizedStatusTitle" ILIKE '%میهمان%' OR sts."normalizedStatusTitle" ILIKE '%انتقال%' OR sts."statusTitle" ILIKE '%میهمان%' OR sts."statusTitle" ILIKE '%انتقال%')
        WHERE s.status IN ('TRANSFERRED', 'GUEST') ${uniCond}
        ORDER BY s."studentCode"`);
      const total = data.rows.length;
      return {
        columns: [
          { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
          { key: 'nc', title: 'کد ملی' }, { key: 'major', title: 'رشته' },
          { key: 'degree', title: 'مقطع' }, { key: 'y', title: 'ورودی' },
          { key: 'st', title: 'وضعیت کلی' }, { key: 'guest_transfer_term', title: 'ترم میهمانی/انتقال' },
          { key: 'guest_transfer_status', title: 'وضعیت ترم' },
        ],
        rows: data.rows.map(x => ({ ...x, st: faStatus(x.st) })),
        total, page: 1, per: total || 1, totalPages: 1,
        summary: `${total.toLocaleString('fa-IR')} دانشجو میهمان/انتقالی`,
      };
    }

    // ── گزارش شهریه / تراکنش‌های مالی ترم ──
    case 'tuition': {
      const uniCond = f.universityId ? sql`AND (s."universityId" = ${f.universityId} OR s."universityId" IS NULL)` : sql``;
      const termCond = term ? sql`AND t."termCode" = ${term}` : sql``;
      const data = await db.execute<Record<string, unknown>>(sql`
        SELECT s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name,
          m.name AS major, d.title AS degree,
          COALESCE(SUM(CASE WHEN sl."transactionType" = 'CREDIT' THEN sl.amount ELSE 0 END), 0)::int AS credit,
          COALESCE(SUM(CASE WHEN sl."transactionType" = 'DEBIT' THEN sl.amount ELSE 0 END), 0)::int AS debit,
          COALESCE(SUM(CASE WHEN sl."transactionType" = 'CREDIT' THEN sl.amount ELSE -sl.amount END), 0)::int AS balance,
          COUNT(sl.id)::int AS txCount
        FROM students s JOIN users u ON u.id = s."userId"
          LEFT JOIN majors m ON m.id = s."majorId"
          LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"
          LEFT JOIN student_ledger sl ON sl."studentId" = s.id
          LEFT JOIN academic_terms t ON t.id = sl."termId"
        WHERE s.status = 'ACTIVE' ${uniCond} ${termCond}
        GROUP BY s."studentCode", u."firstName", u."lastName", m.name, d.title
        ORDER BY balance DESC`);
      const total = data.rows.length;
      const totalCredit = data.rows.reduce((a, x) => a + Number(x.credit), 0);
      const totalDebit = data.rows.reduce((a, x) => a + Number(x.debit), 0);
      return {
        columns: [
          { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
          { key: 'major', title: 'رشته' }, { key: 'degree', title: 'مقطع' },
          { key: 'credit', title: 'بدهکار' }, { key: 'debit', title: 'بستانکار' },
          { key: 'balance', title: 'مانده' }, { key: 'txCount', title: 'تراکنش' },
        ],
        rows: data.rows, total, page: 1, per: total || 1, totalPages: 1,
        summary: `جمع بدهکار: ${totalCredit.toLocaleString('fa-IR')} — بستانکار: ${totalDebit.toLocaleString('fa-IR')}`,
      };
    }

    // ── گزارش پاسخ‌های طرح پایش ──
    case 'payesh': {
      const uniCond = f.universityId ? sql`AND o."universityId" = ${f.universityId}` : sql``;
      const termCond = term ? sql`AND t."termCode" = ${term}` : sql``;
      const data = await db.execute<Record<string, unknown>>(sql`
        SELECT f.id AS fid, f.title AS form_title,
          q.id AS qid, q.text AS question,
          COUNT(r.id)::int AS responses,
          CASE WHEN q.type = 'SCALE' THEN ROUND(AVG(CASE WHEN qo.value IS NOT NULL THEN qo.value END), 1)::text ELSE NULL END AS avg_score
        FROM evaluation_periods p
          JOIN evaluation_forms f ON f."periodId" = p.id
          JOIN evaluation_questions q ON q."formId" = f.id
          LEFT JOIN question_options qo ON qo."questionId" = q.id
          LEFT JOIN evaluation_responses r ON r."questionId" = q.id AND r."selectedOptionId" = qo.id
          LEFT JOIN course_offerings o ON o.id = r."offeringId"
          LEFT JOIN academic_terms t ON t.id = o."termId"
        WHERE 1=1 ${termCond} ${uniCond}
        GROUP BY f.id, f.title, q.id, q.text, q.type
        ORDER BY f.id, q.id`);
      const total = data.rows.length;
      return {
        columns: [
          { key: 'form_title', title: 'فرم' }, { key: 'question', title: 'سؤال' },
          { key: 'responses', title: 'پاسخ‌ها' }, { key: 'avg_score', title: 'میانگین نمره' },
        ],
        rows: data.rows, total, page: 1, per: total || 1, totalPages: 1,
        summary: `${total.toLocaleString('fa-IR')} سؤال پایش`,
      };
    }

    // ── دانشجویان واجد شرایط آزمون جامع ──
    case 'jame': {
      const uniCond = f.universityId ? sql`AND (s."universityId" = ${f.universityId} OR s."universityId" IS NULL)` : sql``;
      const data = await db.execute<Record<string, unknown>>(sql`
        SELECT s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name,
          m.name AS major, d.title AS degree, s."entryYear" AS y,
          COUNT(DISTINCT e."offeringId")::int AS courses_passed,
          ROUND(AVG(CASE WHEN e."gradeStatus" = 'FINALIZED' AND e."gradeValue" ~ '^[0-9]+(\\.[0-9]+)?$' THEN e."gradeValue"::numeric END), 2) AS avg
        FROM students s JOIN users u ON u.id = s."userId"
          LEFT JOIN majors m ON m.id = s."majorId"
          LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"
          LEFT JOIN enrollments e ON e."studentId" = s.id AND e."gradeStatus" = 'FINALIZED' AND e."gradeValue" ~ '^[0-9]+(\\.[0-9]+)?$' AND e."gradeValue"::numeric >= 12
        WHERE s.status = 'ACTIVE' ${uniCond}
        GROUP BY s."studentCode", u."firstName", u."lastName", m.name, d.title, s."entryYear"
        HAVING COUNT(DISTINCT e."offeringId") >= 10
        ORDER BY avg DESC`);
      const total = data.rows.length;
      return {
        columns: [
          { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
          { key: 'major', title: 'رشته' }, { key: 'degree', title: 'مقطع' },
          { key: 'y', title: 'ورودی' }, { key: 'courses_passed', title: 'درس قبول' },
          { key: 'avg', title: 'میانگین' },
        ],
        rows: data.rows, total, page: 1, per: total || 1, totalPages: 1,
        summary: `${total.toLocaleString('fa-IR')} دانشجو واجد شرایط جامع`,
      };
    }

    // ── مدارک دانشجو ──
    case 'docs': {
      const uniCond = f.universityId ? sql`AND (s."universityId" = ${f.universityId} OR s."universityId" IS NULL)` : sql``;
      const data = await db.execute<Record<string, unknown>>(sql`
        SELECT s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name,
          m.name AS major, d.title AS degree, s.status AS st,
          COUNT(sd.id)::int AS doc_count,
          COUNT(DISTINCT sd."categoryId")::int AS cat_count
        FROM students s JOIN users u ON u.id = s."userId"
          LEFT JOIN majors m ON m.id = s."majorId"
          LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"
          LEFT JOIN student_documents sd ON sd."personUserId" = u.id
        WHERE s.status = 'ACTIVE' ${uniCond}
        GROUP BY s."studentCode", u."firstName", u."lastName", m.name, d.title, s.status
        ORDER BY doc_count ASC`);
      const total = data.rows.length;
      const noDoc = data.rows.filter(r => Number(r.doc_count) === 0).length;
      return {
        columns: [
          { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
          { key: 'major', title: 'رشته' }, { key: 'degree', title: 'مقطع' },
          { key: 'doc_count', title: 'تعداد مدرک' }, { key: 'cat_count', title: 'دسته مدرک' },
        ],
        rows: data.rows, total, page: 1, per: total || 1, totalPages: 1,
        summary: `${total.toLocaleString('fa-IR')} پرونده فعال — ${noDoc.toLocaleString('fa-IR')} بدون مدرک`,
      };
    }

    default: {
      // واگذاری به ماژول‌های خانواده‌ها (r-*.ts) — اولین پاسخی که null نیست
      const delegated =
        (await runClass(kind, f)) ??
        (await runCouncilLetters(kind, f)) ??
        (await runEduProbation(kind, f)) ??
        (await runEduRoster(kind, f)) ??
        (await runEduSchedule(kind, f)) ??
        (await runExam(kind, f)) ??
        (await runFinance(kind, f)) ??
        (await runStaff(kind, f)) ??
        (await runStatusOps(kind, f)) ??
        (await runThesis(kind, f)) ??
        (await runCollect(kind, f));
      if (delegated) return delegated;
      return { columns: [], rows: [], total: 0, page: 1, per: PER, totalPages: 1 };
    }
  }
}

/** خروجی CSV — ورق‌زدن همه صفحات تا سقف ۵۰۰۰ ردیف */
export async function exportReport(kind: string, f: ReportFilters): Promise<{ header: string[]; lines: string[][] }> {
  await requireRole(ROLES);
  await assertReportPermission(kind);
  const first = await runReport(kind, { ...f, page: 1 });
  const all = [...first.rows];
  for (let p = 2; p <= first.totalPages && all.length < 5000; p++) {
    const r = await runReport(kind, { ...f, page: p });
    all.push(...r.rows);
  }
  return {
    header: first.columns.map(c => c.title),
    lines: all.slice(0, 5000).map(row => first.columns.map(c => String(row[c.key] ?? ''))),
  };
}
