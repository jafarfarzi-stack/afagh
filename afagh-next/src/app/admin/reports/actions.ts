'use server';

import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { STUDENT_STATUS_FA } from '@/lib/student-labels';

const ROLES = ['ADMIN', 'EDU_EXPERT', 'ARCHIVE_EXPERT', 'MILITARY_OFFICER'] as never[];
const PER = 50;

export type ReportFilters = {
  term?: string;
  degreeId?: number;
  facultyId?: number;
  majorId?: number;
  entryYear?: number;
  q?: string;
  miss?: string;
  page?: number;
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
  majors: { id: number; name: string; code: string | null }[];
  entryYears: number[];
  latestTerm: string;
};

export async function getFilterOptions(): Promise<FilterOptions> {
  await requireRole(ROLES);
  const terms = await db.execute<{ code: string; title: string | null }>(
    sql`SELECT "termCode" AS code, title FROM academic_terms ORDER BY "termCode" DESC`,
  );
  const degrees = await db.execute<{ id: number; title: string }>(
    sql`SELECT id, title FROM degree_level_configs ORDER BY id`,
  );
  const faculties = await db.execute<{ id: number; name: string }>(
    sql`SELECT id, name FROM faculties ORDER BY id`,
  );
  const majors = await db.execute<{ id: number; name: string; code: string | null }>(
    sql`SELECT id, name, "majorCode" AS code FROM majors ORDER BY name`,
  );
  const years = await db.execute<{ y: number }>(
    sql`SELECT DISTINCT "entryYear" AS y FROM students ORDER BY 1 DESC`,
  );
  return {
    terms: terms.rows,
    degrees: degrees.rows,
    faculties: faculties.rows,
    majors: majors.rows,
    entryYears: years.rows.map(r => Number(r.y)),
    latestTerm: terms.rows[0]?.code ?? '',
  };
}

const NUM = sql`e."gradeValue" ~ '^[0-9]+(\\.[0-9]+)?$'`;

function faStatus(s: unknown): string {
  const k = String(s ?? '');
  return STUDENT_STATUS_FA[k] ?? k;
}

function studentWhere(f: ReportFilters, alias = 's') {
  const a = sql.identifier(alias);
  const c = [];
  if (f.degreeId) c.push(sql`${a}."degreeLevelId" = ${f.degreeId}`);
  if (f.facultyId) c.push(sql`m."facultyId" = ${f.facultyId}`);
  if (f.majorId) c.push(sql`${a}."majorId" = ${f.majorId}`);
  if (f.entryYear) c.push(sql`${a}."entryYear" = ${f.entryYear}`);
  if (f.q) {
    const like = `%${f.q}%`;
    c.push(sql`(${a}."studentCode" ILIKE ${like} OR u."firstName" ILIKE ${like} OR u."lastName" ILIKE ${like} OR u."nationalCode" ILIKE ${like})`);
  }
  return c;
}

function joinAnd(conds: ReturnType<typeof sql>[]) {
  if (!conds.length) return sql``;
  return sql`WHERE ${sql.join(conds, sql` AND `)}`;
}

async function paged(
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

const STU_FROM = sql`FROM students s JOIN users u ON u.id = s."userId" LEFT JOIN majors m ON m.id = s."majorId" LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId" LEFT JOIN faculties fc ON fc.id = m."facultyId"`;
const STU_COLS = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name, u."nationalCode" AS nc, m.name AS major, d.title AS degree, s."entryYear" AS y, s.status AS st`;

async function studentListReport(
  columns: ReportColumn[],
  extraConds: ReturnType<typeof sql>[],
  f: ReportFilters,
  orderDefault: ReturnType<typeof sql> = sql`ORDER BY s."studentCode"`,
): Promise<ReportResult> {
  const r = await paged(columns, STU_FROM, [...studentWhere(f), ...extraConds], STU_COLS, orderDefault, f);
  r.rows = r.rows.map(x => ({ ...x, st: faStatus(x.st) }));
  return r;
}

export async function runReport(kind: string, f: ReportFilters): Promise<ReportResult> {
  await requireRole(ROLES);
  const term = f.term || '';

  switch (kind) {
    // ── دانشجویان فعال هر ترم ──
    case 'active-term': {
      const conds = [sql`t."termCode" = ${term}`, ...studentWhere(f)];
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
      r.summary = `${r.total.toLocaleString('fa-IR')} دانشجو در ترم ${term}`;
      return r;
    }

    // ── خلاصه وضعیت تحصیلی ──
    case 'status-summary': {
      const data = await db.execute<Record<string, unknown>>(sql`
        SELECT s.status AS st, d.title AS degree, COUNT(*)::int AS n
        FROM students s LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"
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
      const data = await db.execute<Record<string, unknown>>(sql`
        SELECT COALESCE(fc.name, '— بدون دانشکده —') AS faculty, s.status AS st, COUNT(*)::int AS n
        FROM students s LEFT JOIN majors m ON m.id = s."majorId" LEFT JOIN faculties fc ON fc.id = m."facultyId"
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
      const data = await db.execute<Record<string, unknown>>(sql`
        SELECT e."gradeStatus" AS st, COUNT(*)::int AS n,
          ROUND(AVG(CASE WHEN ${NUM} THEN e."gradeValue"::numeric END), 2) AS avg
        FROM enrollments e JOIN course_offerings o ON o.id = e."offeringId" JOIN academic_terms t ON t.id = o."termId"
        WHERE t."termCode" = ${term} GROUP BY 1 ORDER BY 2 DESC`);
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

    // ── دانش‌آموختگان / ورودی‌ها / عدم مراجعه / انتقالی ──
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
    case 'transfers':
      return studentListReport(
        [
          { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
          { key: 'major', title: 'رشته' }, { key: 'degree', title: 'مقطع' },
          { key: 'y', title: 'ورودی' }, { key: 'st', title: 'وضعیت' },
        ],
        [sql`s.status = 'TRANSFERRED'`], f,
      );

    default:
      return { columns: [], rows: [], total: 0, page: 1, per: PER, totalPages: 1 };
  }
}

/** خروجی CSV — ورق‌زدن همه صفحات تا سقف ۵۰۰۰ ردیف */
export async function exportReport(kind: string, f: ReportFilters): Promise<{ header: string[]; lines: string[][] }> {
  await requireRole(ROLES);
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
