import type { ReportFilters, ReportResult } from './report-helpers';
import { paged, studentWhere, joinAnd } from './report-helpers';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { requireRole } from '@/lib/auth';
import { getRegulationConfig } from '@/lib/regulations-engine';

// NOTE: بدون 'use server' — این ماژول CARDS (مقدار غیرتابعی) هم اکسپورت می‌کند.

export const CARDS: { kind: string; icon: string; title: string; needsTerm?: boolean; filters?: string[] }[] = [
  { kind: 'probation-violations', icon: '⚠️', title: 'تخلفات مشروطی', filters: ['degree', 'faculty', 'major', 'entry', 'q'] },
  { kind: 'probation-chains', icon: '🔗', title: 'مشروطی متناوب و متوالی', filters: ['degree', 'faculty', 'major', 'entry', 'q'] },
  { kind: 'unit-cap-violations', icon: '📏', title: 'عدم رعایت سقف و کف واحد', filters: ['term', 'degree', 'faculty', 'major', 'entry', 'q'] },
  { kind: 'repeated-courses', icon: '🔁', title: 'دروس چندبار اخذشده', filters: ['term', 'degree', 'faculty', 'major', 'entry', 'q'] },
];

/** پرچم مشروطی: هرکدام از سه ستون ۱ باشد یعنی مشروط (اولویت با محاسبهٔ آیین‌نامه نیست — اجتماع). */
const PROB = sql`(COALESCE(sts."isProbation", 0) = 1 OR COALESCE(sts."calculatedProbation", 0) = 1 OR COALESCE(sts."sourceProbation", 0) = 1)`;

/**
 * سقف‌ها و کف‌های آیین‌نامه‌ای به‌ازای هر (آیین‌نامه، مقطع) — با همان اعمالِ
 * تفاوت‌های مقطعی که موتور می‌کند (`getRegulationConfig` → `applyLevelConfig`).
 *
 * 🔒 چرا از JSON خام نمی‌خوانیم؟ چون آیین‌نامه‌های ۱۳۹۱/۱۳۹۳/۱۴۰۲ یک متن‌اند و
 * تفاوت مقطعی در `levels` است: گروه **SHORT** (کاردانی پیوسته/ناپیوسته و
 * کارشناسی ناپیوسته — کدهای سما ۱/۵/۹/۱۰ و سید AD) سقف مشروطی **۲** دارد و
 * گروه LONG (پیوسته) **۳**؛ همچنین کف واحد ۱۴ برای آن گروه.
 */
type LevelCaps = {
  total: number; consecutive: number; threshold: number;
  minUnits: number; maxUnits: number; probMax: number;
};

async function levelCapsForStudents(f: ReportFilters): Promise<Map<string, LevelCaps>> {
  const pairs = await db.execute<{ reg: number | null; deg: number | null }>(sql`
    SELECT DISTINCT s."regulationId" AS reg, s."degreeLevelId" AS deg
      FROM students s
     WHERE ${sql.join(studentWhere(f), sql` AND `)}
     LIMIT 60
  `);
  const map = new Map<string, LevelCaps>();
  for (const p of pairs.rows ?? []) {
    const cfg = await getRegulationConfig(p.reg, p.deg).catch(() => null);
    const pt = cfg?.probation_and_tenure;
    const rt = cfg?.regular_term_rules;
    map.set(`${p.reg ?? 0}:${p.deg ?? 0}`, {
      total: Number(pt?.max_total_probations ?? 3),
      consecutive: Number(pt?.max_consecutive_probations ?? 3),
      threshold: Number(pt?.probation_gpa_threshold ?? 12),
      minUnits: Number(rt?.min_units ?? 12),
      maxUnits: Number(rt?.max_units ?? 20),
      probMax: Number(rt?.probation_max_units ?? 14),
    });
  }
  return map;
}

/** CASE «آیین‌نامه+مقطع → مقدار» با fallback به خواندن JSON (برای جفت‌های بیرون فهرست) */
function capCase(map: Map<string, LevelCaps>, pick: (c: LevelCaps) => number, fallback: SQL): SQL {
  const whens = [...map.entries()].map(([k, c]) => {
    const [reg, deg] = k.split(':').map(Number);
    return sql`WHEN s."regulationId" = ${reg} AND s."degreeLevelId" = ${deg} THEN ${pick(c)}::numeric`;
  });
  return sql`(CASE ${sql.join(whens, sql` `)} ELSE ${fallback} END)`;
}

// سقف مجاز مشروطی = سقف آیین‌نامهٔ مقطع + ارفاق اختصاصی دانشجو.
// 🔒 پیش‌تر فقط ستون `extraAllowedProbations` ملاک بود ⇒ دانشجوی لیسانس با ۱–۳
//    مشروطی و بدون ارفاق، به‌اشتباه «متخلف» علامت می‌خورد (سقف آیین‌نامه ۲/۳ است).
// تابستان و معادل‌سازی هم طبق آیین‌نامه مشروطی ندارند.
async function probationViolations(f: ReportFilters): Promise<ReportResult> {
  const caps = await levelCapsForStudents(f);
  const jsonTotal = sql`COALESCE((SELECT (er."rulesConfig"::jsonb -> 'probation_and_tenure' ->> 'max_total_probations')::numeric FROM educational_regulations er WHERE er.id = s."regulationId"), 3)`;
  const cap = sql`(${capCase(caps, c => c.total, jsonTotal)} + COALESCE(s."extraAllowedProbations", 0))`;
  const counted = sql`${PROB} AND NOT (sts."termCode" ~ '3$' OR sts."termCode" ~ '5$')`;
  const from = sql`FROM students s JOIN users u ON u.id = s."userId" LEFT JOIN majors m ON m.id = s."majorId" JOIN student_term_states sts ON sts."studentId" = s.id`;
  const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name, m.name AS major, COUNT(*) FILTER (WHERE ${counted})::int AS "probTerms", ${cap}::int AS allowed, ROUND(AVG(COALESCE(sts."normalizedTermAvg", sts."termAvg", sts."sourceTermAvg")) FILTER (WHERE ${counted}), 2) AS avg`;
  const r = await paged(
    [
      { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
      { key: 'major', title: 'رشته' }, { key: 'probTerms', title: 'ترم مشروطی' },
      { key: 'allowed', title: 'سقف مجاز' }, { key: 'avg', title: 'میانگین' },
    ],
    from, [...studentWhere(f)], cols, sql`ORDER BY "probTerms" DESC, code`, f,
    sql`s."studentCode", u."firstName", u."lastName", m.name, s.id, s."regulationId", s."extraAllowedProbations"`,
    sql`COUNT(*) FILTER (WHERE ${counted}) > ${cap}`,
  );
  r.summary = `${r.total.toLocaleString('fa-IR')} دانشجو بیش از سقف مجاز مشروطی (سقف = سقف آیین‌نامهٔ مقطع + ارفاق دانشجو؛ تابستان/معادل‌سازی شمرده نشد)`;
  return r;
}

// بلندترین رشتهٔ متوالی مشروطی هر دانشجو (gaps-and-islands روی ترتیب زمانی ترم‌ها).
// ترتیب: academic_terms.sortOrder و در صورت NULL بودن، termCode به‌عنوان جایگزین.
async function probationChains(f: ReportFilters): Promise<ReportResult> {
  const caps = await levelCapsForStudents(f);
  const jsonConsec = sql`COALESCE((SELECT (er."rulesConfig"::jsonb -> 'probation_and_tenure' ->> 'max_consecutive_probations')::numeric FROM educational_regulations er WHERE er.id = s."regulationId"), 3)`;
  const from = sql`FROM (
    SELECT sid, MAX(len)::int AS "chainLength", (ARRAY_AGG(terms ORDER BY len DESC, terms))[1] AS "chainTerms"
    FROM (
      SELECT sid, COUNT(*) AS len, STRING_AGG(tc, '، ' ORDER BY rn) AS terms
      FROM (
        SELECT sid, tc, rn, (rn - ROW_NUMBER() OVER (PARTITION BY sid ORDER BY rn)) AS grp
        FROM (
          SELECT sts."studentId" AS sid, sts."termCode" AS tc,
            ROW_NUMBER() OVER (PARTITION BY sts."studentId" ORDER BY COALESCE(t."sortOrder", 2147483647), sts."termCode") AS rn,
            CASE WHEN (COALESCE(sts."isProbation", 0) = 1 OR COALESCE(sts."calculatedProbation", 0) = 1 OR COALESCE(sts."sourceProbation", 0) = 1) THEN 1 ELSE 0 END AS prob
          FROM student_term_states sts LEFT JOIN academic_terms t ON t.id = sts."termId"
        ) o WHERE prob = 1 AND NOT (tc ~ '3$' OR tc ~ '5$')
      ) p GROUP BY sid, grp
    ) g GROUP BY sid
  ) b
  JOIN students s ON s.id = b.sid JOIN users u ON u.id = s."userId" LEFT JOIN majors m ON m.id = s."majorId"`;
  const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name, m.name AS major, b."chainLength" AS "chainLength", b."chainTerms" AS "chainTerms", CASE WHEN b."chainLength" > ${capCase(caps, c => c.consecutive, jsonConsec)} THEN 'تخلف' ELSE '—' END AS "violation"`;
  const r = await paged(
    [
      { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
      { key: 'major', title: 'رشته' }, { key: 'chainLength', title: 'طول زنجیره' },
      { key: 'chainTerms', title: 'ترم‌های زنجیره' }, { key: 'violation', title: 'تخلف سقف متوالی؟' },
    ],
    from, [...studentWhere(f)], cols, sql`ORDER BY b."chainLength" DESC, code`, f,
    sql`s."studentCode", u."firstName", u."lastName", m.name, s.id, s."regulationId", b."chainLength", b."chainTerms"`,
  );
  r.summary = `${r.total.toLocaleString('fa-IR')} دانشجو با سابقهٔ مشروطی (مرتب به‌ترتیب طولانی‌ترین زنجیرهٔ متوالی؛ تابستان/معادل‌سازی شمرده نشد)`;
  return r;
}

// سقف/کف واحد از **آیین‌نامهٔ همان مقطع** خوانده می‌شود (regular/probation/summer)
// و تنها اخذهای جاری (REGISTERED/PENDING_COUNCIL) شمرده می‌شوند — هم‌راستا با
// موتور انتخاب واحد. پیش‌تر کف ثابت ۱۲ و سقف COALESCE(...,20) بود ⇒ سقف ۱۴ مشروط
// و کف ۱۴ ارشد هرگز اعمال نمی‌شد.
async function unitCapViolations(f: ReportFilters): Promise<ReportResult> {
  const caps = await levelCapsForStudents(f);
  const jsonMin = sql`COALESCE((SELECT (er."rulesConfig"::jsonb -> 'regular_term_rules' ->> 'min_units')::numeric FROM educational_regulations er WHERE er.id = s."regulationId"), 12)`;
  const jsonMax = sql`COALESCE((SELECT (er."rulesConfig"::jsonb -> 'regular_term_rules' ->> 'max_units')::numeric FROM educational_regulations er WHERE er.id = s."regulationId"), 20)`;
  const jsonProbMax = sql`COALESCE((SELECT (er."rulesConfig"::jsonb -> 'regular_term_rules' ->> 'probation_max_units')::numeric FROM educational_regulations er WHERE er.id = s."regulationId"), 14)`;
  const cfgMin = capCase(caps, c => c.minUnits, jsonMin);
  const cfgMax = capCase(caps, c => c.maxUnits, jsonMax);
  const cfgProbMax = capCase(caps, c => c.probMax, jsonProbMax);
  const cfgSummerMax = sql`COALESCE((SELECT (er."rulesConfig"::jsonb -> 'summer_term_rules' ->> 'default_max_units')::numeric FROM educational_regulations er WHERE er.id = s."regulationId"), 8)`;
  const isSummerTerm = sql`(COALESCE(t."isSummer", 0) = 1 OR t."termCode" ~ '3$')`;
  const probLastTerm = sql`COALESCE((SELECT CASE WHEN COALESCE(sts2."isProbation", 0) = 1 THEN 1 ELSE 0 END FROM student_term_states sts2 WHERE sts2."studentId" = s.id ORDER BY sts2."termCode" DESC LIMIT 1), 0)`;
  const effMax = sql`(CASE WHEN ${isSummerTerm} THEN ${cfgSummerMax} WHEN ${probLastTerm} = 1 THEN ${cfgProbMax} ELSE ${cfgMax} END)`;
  const effMin = sql`(CASE WHEN ${isSummerTerm} THEN 0 ELSE ${cfgMin} END)`;
  const unitsSum = sql`SUM(c.units)`;
  const violation = sql`CASE WHEN ${unitsSum} > ${effMax} THEN 'تخطی سقف' WHEN ${unitsSum} < ${effMin} THEN 'تخطی کف' END`;

  const from = sql`FROM enrollments e JOIN course_offerings o ON o.id = e."offeringId" JOIN courses c ON c.id = o."courseId" JOIN academic_terms t ON t.id = o."termId" JOIN students s ON s.id = e."studentId" JOIN users u ON u.id = s."userId" LEFT JOIN majors m ON m.id = s."majorId" LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"`;
  const conds = [
    // فقط اخذهای جاری — حذف‌شده/لیست انتظار/معادل‌شده در سقف واحد اثر ندارند
    sql`e.status IN ('REGISTERED', 'PENDING_COUNCIL')`,
    ...(f.term ? [sql`t."termCode" = ${f.term}`] : []),
    ...studentWhere(f),
  ];
  const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name, t."termCode" AS term, ${unitsSum}::float AS "unitsTaken", ${effMin}::int AS "min", ${effMax}::int AS "max", ${violation} AS violation`;
  const r = await paged(
    [
      { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
      { key: 'term', title: 'ترم' }, { key: 'unitsTaken', title: 'واحد اخذشده' },
      { key: 'min', title: 'کف' }, { key: 'max', title: 'سقف' }, { key: 'violation', title: 'نوع تخلف' },
    ],
    from, conds, cols, sql`ORDER BY term DESC, code`, f,
    sql`s."studentCode", u."firstName", u."lastName", t."termCode", m.name, s.id, s."regulationId", t."isSummer", t."termCode"`,
    sql`${unitsSum} > ${effMax} OR ${unitsSum} < ${effMin}`,
  );
  r.summary = `${r.total.toLocaleString('fa-IR')} مورد تخطی سقف/کف واحد (سقف و کف از آیین‌نامهٔ مقطع؛ فقط اخذهای جاری)`;
  return r;
}

// NOTE: enrollments.gradeValue در اسکیما numeric است (نه text)؛ پس بدون regex، با MAX/IS NOT NULL.
async function repeatedCourses(f: ReportFilters): Promise<ReportResult> {
  const from = sql`FROM enrollments e JOIN course_offerings o ON o.id = e."offeringId" JOIN courses c ON c.id = o."courseId" JOIN students s ON s.id = e."studentId" JOIN users u ON u.id = s."userId" LEFT JOIN majors m ON m.id = s."majorId"`;
  const conds = [
    ...(f.term
      ? [sql`EXISTS (SELECT 1 FROM enrollments e2 JOIN course_offerings o2 ON o2.id = e2."offeringId" JOIN academic_terms t2 ON t2.id = o2."termId" WHERE e2."studentId" = s.id AND o2."courseId" = c.id AND t2."termCode" = ${f.term})`]
      : []),
    ...studentWhere(f),
  ];
  const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name, m.name AS major, c.code AS "courseCode", c.title AS "courseTitle", COUNT(*) FILTER (WHERE e.status <> 'DROPPED')::int AS attempts, MAX(e."gradeValue") AS "bestGrade"`;
  const r = await paged(
    [
      { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
      { key: 'major', title: 'رشته' }, { key: 'courseCode', title: 'کد درس' },
      { key: 'courseTitle', title: 'نام درس' }, { key: 'attempts', title: 'تعداد اخذ' },
      { key: 'bestGrade', title: 'بهترین نمره' },
    ],
    from, conds, cols, sql`ORDER BY attempts DESC, code`, f,
    sql`s."studentCode", u."firstName", u."lastName", m.name, c.code, c.title`,
    sql`COUNT(*) FILTER (WHERE e.status <> 'DROPPED') > 1`,
  );
  r.summary = `${r.total.toLocaleString('fa-IR')} درس چندبار اخذشده (حذف‌شده‌ها شمرده نشدند)`;
  return r;
}

export async function run(kind: string, f: ReportFilters & Record<string, unknown>): Promise<ReportResult | null> {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  switch (kind) {
    case 'probation-violations': return probationViolations(f);
    case 'probation-chains': return probationChains(f);
    case 'unit-cap-violations': return unitCapViolations(f);
    case 'repeated-courses': return repeatedCourses(f);
    default: return null;
  }
}
