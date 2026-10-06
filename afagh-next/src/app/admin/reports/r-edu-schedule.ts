/**
 * گزارش‌های برنامهٔ آموزشی (r-edu-schedule)
 *
 * یافته‌های اسکیما (src/db/schema.ts):
 * - زمان هفتگی کلاس در course_offerings نیست؛ در جدول schedules است
 *   (scheduleType='CLASS'، dayOfWeek، startTime/endTime از نوع time).
 *   class_sessions فقط رخدادهای تاریخ‌دار (sessionDate) همان برنامه است.
 * - امتحان هر ارائه درس هم در schedules است (scheduleType='EXAM' با examDate)؛
 *   exam_sessions لایهٔ سالن/صندلی (seat_allocations) است نه برنامهٔ هر درس.
 * - پیش‌نیاز/هم‌نیاز در course_rules (ruleType ‏PREREQ/COREQ‏، logicTree از نوع
 *   JSON با کد درس‌ها)؛ ترتیب زمانی ترم‌ها از academic_terms.sortOrder.
 * - enrollments.gradeValue در اسکیما numeric است (نه text)؛ samaGradeStatusCode
 *   همان ستون کد وضعیت سماست.
 * - جدول اختصاصی ثبت تغییرات انتخاب واحد وجود ندارد (فقط grade_change_log
 *   برای نمره و audit_logs عمومی)؛ گزارش انتخاب واحد فقط شمارشی است.
 */
import type { ReportFilters, ReportResult } from './report-helpers';
import { joinAnd, paged, studentWhere } from './report-helpers';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { requireRole } from '@/lib/auth';

type ExtFilters = ReportFilters & Record<string, unknown>;

export const CARDS = [
  { kind: 'student-weekly-conflicts', icon: '🗓', title: 'تداخل برنامه هفتگی دانشجویان', needsTerm: true },
  { kind: 'student-exam-conflicts', icon: '📝', title: 'تداخل برنامه امتحانی', needsTerm: true },
  { kind: 'prereq-violations', icon: '⛓', title: 'عدم رعایت پیش‌نیاز/هم‌نیاز', needsTerm: true },
  {
    kind: 'course-grade-status', icon: '📋', title: 'وضعیت درس و نمره دانشجویان', needsTerm: true,
    filters: [
      { key: 'gradeStatus', title: 'وضعیت نمره (تطبیق دقیق)', type: 'text' },
      { key: 'samaCode', title: 'کد وضعیت سما', type: 'text' },
    ],
  },
  { kind: 'enrollment-pick', icon: '🧾', title: 'انتخاب واحد دانشجویان + تغییرات', needsTerm: true },
];

const PER = 50;

/** آخرین ترم وقتی فیلتر ترم خالی است */
async function effectiveTerm(f: ReportFilters): Promise<string> {
  if (f.term) return f.term;
  const r = await db.execute<{ code: string }>(
    sql`SELECT "termCode" AS code FROM academic_terms ORDER BY "termCode" DESC LIMIT 1`,
  );
  return r.rows[0]?.code ?? '';
}

function empty(columns: ReportResult['columns'], summary: string): ReportResult {
  return { columns, rows: [], total: 0, page: 1, per: PER, totalPages: 1, summary };
}

const DAY_FA = sql`CASE sc1."dayOfWeek" WHEN 1 THEN 'شنبه' WHEN 2 THEN 'یکشنبه' WHEN 3 THEN 'دوشنبه' WHEN 4 THEN 'سه‌شنبه' WHEN 5 THEN 'چهارشنبه' WHEN 6 THEN 'پنج‌شنبه' ELSE COALESCE('روز ' || sc1."dayOfWeek"::text, '—') END`;

/** ۱) تداخل برنامه هفتگی: دو اخذ یک دانشجو در یک ترم با روز یکسان و بازهٔ زمانی هم‌پوشان */
async function weeklyConflicts(f: ExtFilters): Promise<ReportResult> {
  const term = await effectiveTerm(f);
  const columns = [
    { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
    { key: 'course1', title: 'درس اول' }, { key: 'course2', title: 'درس دوم' },
    { key: 'day', title: 'روز' }, { key: 'time1', title: 'ساعت درس اول' },
    { key: 'time2', title: 'ساعت درس دوم' },
  ];
  if (!term) return empty(columns, 'ترمی یافت نشد');
  const from = sql`
    FROM enrollments e1
    JOIN course_offerings o1 ON o1.id = e1."offeringId"
    JOIN academic_terms t ON t.id = o1."termId"
    JOIN students s ON s.id = e1."studentId"
    JOIN users u ON u.id = s."userId"
    LEFT JOIN majors m ON m.id = s."majorId"
    JOIN courses c1 ON c1.id = o1."courseId"
    JOIN schedules sc1 ON sc1."offeringId" = o1.id AND sc1."scheduleType" = 'CLASS' AND sc1."dayOfWeek" IS NOT NULL
    JOIN enrollments e2 ON e2."studentId" = e1."studentId" AND e2.id > e1.id
    JOIN course_offerings o2 ON o2.id = e2."offeringId" AND o2."termId" = o1."termId"
    JOIN courses c2 ON c2.id = o2."courseId"
    JOIN schedules sc2 ON sc2."offeringId" = o2.id AND sc2."scheduleType" = 'CLASS'
      AND sc2."dayOfWeek" = sc1."dayOfWeek"
      AND sc1."startTime" < sc2."endTime" AND sc2."startTime" < sc1."endTime"`;
  const conds = [
    sql`t."termCode" = ${term}`,
    sql`e1.status <> 'DROPPED'`, sql`e2.status <> 'DROPPED'`,
    ...studentWhere(f),
  ];
  const select = sql`
    s."studentCode" AS code,
    u."firstName" || ' ' || u."lastName" AS name,
    (c1.code || ' — ' || c1.title) AS course1,
    (c2.code || ' — ' || c2.title) AS course2,
    ${DAY_FA} AS day,
    (to_char(sc1."startTime", 'HH24:MI') || ' تا ' || to_char(sc1."endTime", 'HH24:MI')) AS time1,
    (to_char(sc2."startTime", 'HH24:MI') || ' تا ' || to_char(sc2."endTime", 'HH24:MI')) AS time2`;
  const r = await paged(columns, from, conds, select, sql`ORDER BY code, course1, course2`, f);
  r.summary = `${r.total.toLocaleString('fa-IR')} مورد تداخل هفتگی در ترم ${term} (مبنای زمان: schedules با scheduleType='CLASS')`;
  return r;
}

/** ۲) تداخل امتحانی: دو اخذ یک دانشجو در یک ترم با تاریخ امتحان یکسان و بازهٔ هم‌پوشان */
async function examConflicts(f: ExtFilters): Promise<ReportResult> {
  const term = await effectiveTerm(f);
  const columns = [
    { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
    { key: 'course1', title: 'درس اول' }, { key: 'course2', title: 'درس دوم' },
    { key: 'exam_date', title: 'تاریخ امتحان' }, { key: 'time1', title: 'ساعت درس اول' },
    { key: 'time2', title: 'ساعت درس دوم' },
  ];
  if (!term) return empty(columns, 'ترمی یافت نشد');
  const from = sql`
    FROM enrollments e1
    JOIN course_offerings o1 ON o1.id = e1."offeringId"
    JOIN academic_terms t ON t.id = o1."termId"
    JOIN students s ON s.id = e1."studentId"
    JOIN users u ON u.id = s."userId"
    LEFT JOIN majors m ON m.id = s."majorId"
    JOIN courses c1 ON c1.id = o1."courseId"
    JOIN schedules sc1 ON sc1."offeringId" = o1.id AND sc1."scheduleType" = 'EXAM' AND sc1."examDate" IS NOT NULL
    JOIN enrollments e2 ON e2."studentId" = e1."studentId" AND e2.id > e1.id
    JOIN course_offerings o2 ON o2.id = e2."offeringId" AND o2."termId" = o1."termId"
    JOIN courses c2 ON c2.id = o2."courseId"
    JOIN schedules sc2 ON sc2."offeringId" = o2.id AND sc2."scheduleType" = 'EXAM'
      AND sc2."examDate" = sc1."examDate"
      AND sc1."startTime" < sc2."endTime" AND sc2."startTime" < sc1."endTime"`;
  const conds = [
    sql`t."termCode" = ${term}`,
    sql`e1.status <> 'DROPPED'`, sql`e2.status <> 'DROPPED'`,
    ...studentWhere(f),
  ];
  const select = sql`
    s."studentCode" AS code,
    u."firstName" || ' ' || u."lastName" AS name,
    (c1.code || ' — ' || c1.title) AS course1,
    (c2.code || ' — ' || c2.title) AS course2,
    sc1."examDate"::text AS exam_date,
    (sc1."startTime"::text || ' تا ' || sc1."endTime"::text) AS time1,
    (sc2."startTime"::text || ' تا ' || sc2."endTime"::text) AS time2`;
  const r = await paged(columns, from, conds, select, sql`ORDER BY code, exam_date, course1`, f);
  r.summary = `${r.total.toLocaleString('fa-IR')} مورد تداخل امتحانی در ترم ${term} (مبنای زمان: schedules با scheduleType='EXAM')`;
  return r;
}

// ── ۳) پیش‌نیاز/هم‌نیاز ──
type LogicCond = { course?: string; minGrade?: number; unitsPassed?: number; operator?: string; conditions?: LogicCond[] };

function evalTree(
  node: LogicCond,
  isCoreq: boolean,
  passedBefore: Map<string, number>,
  sameTerm: Set<string>,
  passedUnits: number,
): { ok: boolean; missing: string[] } {
  if (node.course) {
    if (isCoreq && sameTerm.has(node.course)) return { ok: true, missing: [] };
    const g = passedBefore.get(node.course);
    const need = node.minGrade ?? 10;
    const ok = g !== undefined && g >= need;
    return { ok, missing: ok ? [] : [node.course] };
  }
  if (node.unitsPassed != null) {
    const ok = passedUnits >= node.unitsPassed;
    return { ok, missing: ok ? [] : [`${node.unitsPassed} واحد`] };
  }
  const conds = node.conditions ?? [];
  if (!conds.length) return { ok: true, missing: [] };
  const rs = conds.map(c => evalTree(c, isCoreq, passedBefore, sameTerm, passedUnits));
  const op = String(node.operator ?? 'AND').toUpperCase();
  if (op === 'OR') {
    if (rs.some(r => r.ok)) return { ok: true, missing: [] };
    return { ok: false, missing: rs.flatMap(r => r.missing) };
  }
  return { ok: rs.every(r => r.ok), missing: rs.flatMap(r => r.missing) };
}

async function prereqViolations(f: ExtFilters): Promise<ReportResult> {
  const term = await effectiveTerm(f);
  const columns = [
    { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
    { key: 'course', title: 'درس اخذشده' }, { key: 'rule', title: 'نوع قاعده' },
    { key: 'missing', title: 'پیش‌نیاز/هم‌نیاز رعایت‌نشده' }, { key: 'term', title: 'ترم اخذ' },
  ];
  if (!term) return empty(columns, 'ترمی یافت نشد');

  const termRows = await db.execute<{ code: string; so: number | null }>(
    sql`SELECT "termCode" AS code, "sortOrder" AS so FROM academic_terms`,
  );
  const ordered = [...termRows.rows].sort((a, b) => (a.so ?? 999999999) - (b.so ?? 999999999) || (a.code < b.code ? -1 : 1));
  const orderOf = new Map(ordered.map((t, i) => [t.code, i]));
  const targetOrder = orderOf.get(term) ?? 999999999;

  const rules = await db.execute<{ courseId: number; ccode: string; ruleType: string; logicTree: string }>(
    sql`SELECT r."courseId" AS "courseId", c.code AS ccode, r."ruleType" AS "ruleType", r."logicTree" AS "logicTree"
         FROM course_rules r JOIN courses c ON c.id = r."courseId"
         WHERE r."ruleType" IN ('PREREQ', 'COREQ')`,
  );
  const ruleByCourse = new Map<string, { ruleType: string; tree: LogicCond }[]>();
  let badRules = 0;
  for (const r of rules.rows) {
    try {
      const tree = JSON.parse(r.logicTree) as LogicCond;
      if (!tree || typeof tree !== 'object' || !Array.isArray(tree.conditions) || !tree.conditions.length) continue;
      const list = ruleByCourse.get(r.ccode) ?? [];
      list.push({ ruleType: r.ruleType, tree });
      ruleByCourse.set(r.ccode, list);
    } catch { badRules++; }
  }
  if (!ruleByCourse.size) return empty(columns, `قاعدهٔ پیش‌نیاز/هم‌نیاز قابل ارزیابی یافت نشد${badRules ? ` (${badRules} قاعدهٔ خراب نادیده گرفته شد)` : ''}`);

  // اخذهای ترم هدف فقط برای دروسی که قاعده دارند
  const codes = [...ruleByCourse.keys()];
  const target = await db.execute<Record<string, unknown>>(sql`
    SELECT e."studentId" AS sid, s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name,
      c.code AS ccode, c.title AS ctitle
    FROM enrollments e
    JOIN course_offerings o ON o.id = e."offeringId"
    JOIN academic_terms t ON t.id = o."termId"
    JOIN students s ON s.id = e."studentId"
    JOIN users u ON u.id = s."userId"
    LEFT JOIN majors m ON m.id = s."majorId"
    JOIN courses c ON c.id = o."courseId"
    ${joinAnd([sql`t."termCode" = ${term}`, sql`e.status <> 'DROPPED'`, sql`c.code IN ${codes}`, ...studentWhere(f)])}`);
  if (!target.rows.length) return empty(columns, `در ترم ${term} اخذی برای دروس دارای قاعده یافت نشد`);

  const sids = [...new Set(target.rows.map(r => Number(r.sid)))];
  // سابقهٔ قبولی‌ها (فقط دانشجویان درگیر ترم هدف) + واحد دروس پاس‌شده
  const hist = await db.execute<Record<string, unknown>>(sql`
    SELECT e."studentId" AS sid, c.code AS ccode, e."gradeValue" AS g, t."termCode" AS tcode,
      c."gradingType" AS gt, c.units AS units
    FROM enrollments e
    JOIN course_offerings o ON o.id = e."offeringId"
    JOIN academic_terms t ON t.id = o."termId"
    JOIN courses c ON c.id = o."courseId"
    WHERE e."gradeStatus" = 'FINALIZED' AND e."gradeValue" IS NOT NULL AND e."studentId" IN ${sids}`);

  const bestBefore = new Map<number, Map<string, number>>(); // sid → code → بهترین نمرهٔ قبولیِ ترم‌های قبل
  const unitsBefore = new Map<number, number>();
  for (const h of hist.rows) {
    const sid = Number(h.sid);
    const ord = orderOf.get(String(h.tcode)) ?? 999999999;
    if (ord >= targetOrder) continue;
    const g = Number(h.g);
    if (!Number.isFinite(g)) continue;
    const passed = String(h.gt) === 'DESCRIPTIVE' ? g === 1 : g >= 10;
    if (!passed) continue;
    const code = String(h.ccode);
    const m = bestBefore.get(sid) ?? new Map<string, number>();
    if (m.get(code) === undefined || (m.get(code) as number) < g) m.set(code, g);
    bestBefore.set(sid, m);
    unitsBefore.set(sid, (unitsBefore.get(sid) ?? 0) + Number(h.units ?? 0));
  }
  const sameTermByStudent = new Map<number, Set<string>>();
  for (const r of target.rows) {
    const sid = Number(r.sid);
    const set = sameTermByStudent.get(sid) ?? new Set<string>();
    set.add(String(r.ccode));
    sameTermByStudent.set(sid, set);
  }

  const rows: Record<string, unknown>[] = [];
  for (const r of target.rows) {
    const sid = Number(r.sid);
    const ccode = String(r.ccode);
    for (const rule of ruleByCourse.get(ccode) ?? []) {
      const ev = evalTree(
        rule.tree, rule.ruleType === 'COREQ',
        bestBefore.get(sid) ?? new Map(), sameTermByStudent.get(sid) ?? new Set(), unitsBefore.get(sid) ?? 0,
      );
      if (!ev.ok) {
        rows.push({
          code: r.code, name: r.name,
          course: `${ccode} — ${String(r.ctitle)}`,
          rule: rule.ruleType === 'COREQ' ? 'هم‌نیاز' : 'پیش‌نیاز',
          missing: [...new Set(ev.missing)].join('، '),
          term,
        });
        break; // هر اخذ یک‌بار (اگر چند قاعده دارد، اولین نقض کافی است)
      }
    }
  }
  rows.sort((a, b) => String(a.code).localeCompare(String(b.code), 'fa') || String(a.course).localeCompare(String(b.course), 'fa'));

  const page = Math.max(1, f.page || 1);
  const totalPages = Math.max(1, Math.ceil(rows.length / PER));
  const safe = Math.min(page, totalPages);
  const note = badRules ? ` — ${badRules} قاعدهٔ خراب نادیده گرفته شد` : '';
  return {
    columns, rows: rows.slice((safe - 1) * PER, safe * PER),
    total: rows.length, page: safe, per: PER, totalPages,
    summary: `${rows.length.toLocaleString('fa-IR')} مورد عدم رعایت پیش‌نیاز/هم‌نیاز در ترم ${term} (مبنای قبولی: نمرهٔ نهایی ۱۰ به بالا در ترم‌های قبل طبق sortOrder؛ هم‌نیاز با اخذ هم‌زمان هم پوشش داده می‌شود)${note}`,
  };
}

/** ۴) وضعیت درس و نمره: فهرست اخذها با فیلتر ترم + تطبیق دقیق وضعیت نمره و کد سما */
async function gradeStatusList(f: ExtFilters): Promise<ReportResult> {
  const term = await effectiveTerm(f);
  const columns = [
    { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
    { key: 'course', title: 'درس' }, { key: 'term', title: 'ترم' },
    { key: 'gradeValue', title: 'نمره' }, { key: 'gradeStatus', title: 'وضعیت نمره' },
    { key: 'samaCode', title: 'کد سما' },
  ];
  if (!term) return empty(columns, 'ترمی یافت نشد');
  const gs = typeof f.gradeStatus === 'string' && f.gradeStatus ? f.gradeStatus : '';
  const sc = typeof f.samaCode === 'string' && f.samaCode ? f.samaCode : '';
  const from = sql`
    FROM enrollments e
    JOIN course_offerings o ON o.id = e."offeringId"
    JOIN academic_terms t ON t.id = o."termId"
    JOIN students s ON s.id = e."studentId"
    JOIN users u ON u.id = s."userId"
    LEFT JOIN majors m ON m.id = s."majorId"
    JOIN courses c ON c.id = o."courseId"`;
  const conds = [
    sql`t."termCode" = ${term}`,
    ...(gs ? [sql`e."gradeStatus" = ${gs}`] : []),
    ...(sc ? [sql`e."samaGradeStatusCode" = ${sc}`] : []),
    ...studentWhere(f),
  ];
  const select = sql`
    s."studentCode" AS code,
    u."firstName" || ' ' || u."lastName" AS name,
    (c.code || ' — ' || c.title) AS course,
    t."termCode" AS term,
    e."gradeValue" AS "gradeValue",
    e."gradeStatus" AS "gradeStatus",
    e."samaGradeStatusCode" AS "samaCode"`;
  const r = await paged(columns, from, conds, select, sql`ORDER BY code, course`, f);
  const extra = `${gs ? ` — وضعیت: ${gs}` : ''}${sc ? ` — کد سما: ${sc}` : ''}`;
  r.summary = `${r.total.toLocaleString('fa-IR')} رکورد درس و نمره در ترم ${term}${extra}`;
  return r;
}

/** ۵) انتخاب واحد: تجمیع تعداد درس/واحد هر دانشجو در ترم + تفکیک وضعیت.
 * جدول اختصاصی ثبت تغییرات انتخاب واحد در اسکیما نیست (فقط grade_change_log
 * برای نمره و audit_logs عمومی)؛ پس بخش «تغییرات» فقط در حد شمارش حذف‌شده‌هاست. */
async function enrollmentPick(f: ExtFilters): Promise<ReportResult> {
  const term = await effectiveTerm(f);
  const columns = [
    { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
    { key: 'major', title: 'رشته' }, { key: 'courses', title: 'تعداد درس' },
    { key: 'units', title: 'جمع واحد' }, { key: 'dropped', title: 'حذف‌شده' },
  ];
  if (!term) return empty(columns, 'ترمی یافت نشد');
  const from = sql`
    FROM enrollments e
    JOIN course_offerings o ON o.id = e."offeringId"
    JOIN academic_terms t ON t.id = o."termId"
    JOIN students s ON s.id = e."studentId"
    JOIN users u ON u.id = s."userId"
    LEFT JOIN majors m ON m.id = s."majorId"
    JOIN courses c ON c.id = o."courseId"`;
  const conds = [sql`t."termCode" = ${term}`, ...studentWhere(f)];
  const select = sql`
    s."studentCode" AS code,
    u."firstName" || ' ' || u."lastName" AS name,
    m.name AS major,
    COUNT(*) FILTER (WHERE e.status <> 'DROPPED')::int AS courses,
    COALESCE(SUM(c.units) FILTER (WHERE e.status <> 'DROPPED'), 0) AS units,
    COUNT(*) FILTER (WHERE e.status = 'DROPPED')::int AS dropped`;
  const r = await paged(
    columns, from, conds, select, sql`ORDER BY code`, f,
    sql`s."studentCode", u."firstName", u."lastName", m.name`,
  );
  r.summary = `${r.total.toLocaleString('fa-IR')} دانشجو با انتخاب واحد در ترم ${term} — جدول ثبت تغییرات انتخاب واحد در اسکیما نیست، پس «تغییرات» فقط در حد شمارش حذف‌شده‌ها گزارش می‌شود`;
  return r;
}

export async function run(kind: string, f: ReportFilters & Record<string, unknown>): Promise<ReportResult | null> {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  const ff = f as ExtFilters;
  switch (kind) {
    case 'student-weekly-conflicts': return weeklyConflicts(ff);
    case 'student-exam-conflicts': return examConflicts(ff);
    case 'prereq-violations': return prereqViolations(ff);
    case 'course-grade-status': return gradeStatusList(ff);
    case 'enrollment-pick': return enrollmentPick(ff);
    default: return null;
  }
}
