import type { ReportFilters, ReportResult } from './actions';
import { paged, studentWhere, joinAnd } from './actions';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { requireRole } from '@/lib/auth';

// NOTE: بدون 'use server' — این ماژول CARDS (مقدار غیرتابعی) هم اکسپورت می‌کند.

export const CARDS: { kind: string; icon: string; title: string; needsTerm?: boolean; filters?: string[] }[] = [
  { kind: 'probation-violations', icon: '⚠️', title: 'تخلفات مشروطی', filters: ['degree', 'faculty', 'major', 'entry', 'q'] },
  { kind: 'probation-chains', icon: '🔗', title: 'مشروطی متناوب و متوالی', filters: ['degree', 'faculty', 'major', 'entry', 'q'] },
  { kind: 'unit-cap-violations', icon: '📏', title: 'عدم رعایت سقف و کف واحد', filters: ['term', 'degree', 'faculty', 'major', 'entry', 'q'] },
  { kind: 'repeated-courses', icon: '🔁', title: 'دروس چندبار اخذشده', filters: ['term', 'degree', 'faculty', 'major', 'entry', 'q'] },
];

/** پرچم مشروطی: هرکدام از سه ستون ۱ باشد یعنی مشروط (اولویت با محاسبهٔ آیین‌نامه نیست — اجتماع). */
const PROB = sql`(COALESCE(sts."isProbation", 0) = 1 OR COALESCE(sts."calculatedProbation", 0) = 1 OR COALESCE(sts."sourceProbation", 0) = 1)`;

// سقف مجاز مشروطی = students.extraAllowedProbations (پایهٔ آیین‌نامه در educational_regulations.rulesConfig
// به‌صورت JSON آزاد است و قابل اتکای SQL نیست؛ پس مبنا همان ستون الحاقی دانشجوست).
async function probationViolations(f: ReportFilters): Promise<ReportResult> {
  const from = sql`FROM students s JOIN users u ON u.id = s."userId" LEFT JOIN majors m ON m.id = s."majorId" JOIN student_term_states sts ON sts."studentId" = s.id`;
  const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name, m.name AS major, COUNT(*) FILTER (WHERE ${PROB})::int AS "probTerms", COALESCE(s."extraAllowedProbations", 0)::int AS allowed, ROUND(AVG(sts."termAvg"), 2) AS avg`;
  const r = await paged(
    [
      { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
      { key: 'major', title: 'رشته' }, { key: 'probTerms', title: 'ترم مشروطی' },
      { key: 'allowed', title: 'سقف مجاز' }, { key: 'avg', title: 'میانگین' },
    ],
    from, [...studentWhere(f)], cols, sql`ORDER BY "probTerms" DESC, code`, f,
    sql`s."studentCode", u."firstName", u."lastName", m.name, s."extraAllowedProbations", s.id`,
    sql`COUNT(*) FILTER (WHERE ${PROB}) > COALESCE(s."extraAllowedProbations", 0)`,
  );
  r.summary = `${r.total.toLocaleString('fa-IR')} دانشجو بیش از سقف مجاز مشروطی (سقف = extraAllowedProbations)`;
  return r;
}

// بلندترین رشتهٔ متوالی مشروطی هر دانشجو (gaps-and-islands روی ترتیب زمانی ترم‌ها).
// ترتیب: academic_terms.sortOrder و در صورت NULL بودن، termCode به‌عنوان جایگزین.
async function probationChains(f: ReportFilters): Promise<ReportResult> {
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
        ) o WHERE prob = 1
      ) p GROUP BY sid, grp
    ) g GROUP BY sid
  ) b
  JOIN students s ON s.id = b.sid JOIN users u ON u.id = s."userId" LEFT JOIN majors m ON m.id = s."majorId"`;
  const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name, m.name AS major, b."chainLength" AS "chainLength", b."chainTerms" AS "chainTerms", CASE WHEN b."chainLength" > 1 THEN 'بله' ELSE 'خیر' END AS "isConsecutive"`;
  const r = await paged(
    [
      { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
      { key: 'major', title: 'رشته' }, { key: 'chainLength', title: 'طول زنجیره' },
      { key: 'chainTerms', title: 'ترم‌های زنجیره' }, { key: 'isConsecutive', title: 'متوالی؟' },
    ],
    from, [...studentWhere(f)], cols, sql`ORDER BY b."chainLength" DESC, code`, f,
  );
  r.summary = `${r.total.toLocaleString('fa-IR')} دانشجو با سابقهٔ مشروطی (مرتب به‌ترتیب طولانی‌ترین زنجیرهٔ متوالی)`;
  return r;
}

// NOTE کف واحد: در اسکیما کف واحد «ترم» وجود ندارد (majors.minUnits حداقل کل دوره است و
// degree_level_configs فقط maxUnitsPerTerm دارد)؛ پس کف ثابت ۱۲ در نظر گرفته شد.
// سقف = نزدیک‌ترین curriculum_versions (تطبیق major/degree/entryYear، اولویت PUBLISHED) وگرنه
// degree_level_configs.maxUnitsPerTerm وگرنه ۲۰.
async function unitCapViolations(f: ReportFilters): Promise<ReportResult> {
  const cap = sql`COALESCE(cv."maxUnitsPerTerm", d."maxUnitsPerTerm", 20)`;
  const from = sql`FROM enrollments e JOIN course_offerings o ON o.id = e."offeringId" JOIN courses c ON c.id = o."courseId" JOIN academic_terms t ON t.id = o."termId" JOIN students s ON s.id = e."studentId" JOIN users u ON u.id = s."userId" LEFT JOIN majors m ON m.id = s."majorId" LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"
    LEFT JOIN LATERAL (
      SELECT cv2."maxUnitsPerTerm" FROM curriculum_versions cv2
      WHERE cv2."majorId" = s."majorId" AND cv2."degreeLevelId" = s."degreeLevelId"
        AND s."entryYear" >= cv2."entryYearFrom" AND (cv2."entryYearTo" IS NULL OR s."entryYear" <= cv2."entryYearTo")
      ORDER BY CASE cv2.status WHEN 'PUBLISHED' THEN 0 WHEN 'APPROVED' THEN 1 ELSE 2 END, cv2."entryYearFrom" DESC LIMIT 1
    ) cv ON true`;
  const conds = [
    sql`e.status <> 'DROPPED'`,
    ...(f.term ? [sql`t."termCode" = ${f.term}`] : []),
    ...studentWhere(f),
  ];
  // courses.units از نوع numeric است؛ جمع مستقیم و تبدیل برای نمایش.
  const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name, t."termCode" AS term, SUM(c.units)::float AS "unitsTaken", 12 AS "min", ${cap}::int AS "max", CASE WHEN SUM(c.units) > ${cap} THEN 'تخطی سقف' WHEN SUM(c.units) < 12 THEN 'تخطی کف' END AS violation`;
  const r = await paged(
    [
      { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
      { key: 'term', title: 'ترم' }, { key: 'unitsTaken', title: 'واحد اخذشده' },
      { key: 'min', title: 'کف' }, { key: 'max', title: 'سقف' }, { key: 'violation', title: 'نوع تخلف' },
    ],
    from, conds, cols, sql`ORDER BY term DESC, code`, f,
    sql`s."studentCode", u."firstName", u."lastName", t."termCode", m.name, cv."maxUnitsPerTerm", d."maxUnitsPerTerm"`,
    sql`SUM(c.units) > COALESCE(cv."maxUnitsPerTerm", d."maxUnitsPerTerm", 20) OR SUM(c.units) < 12`,
  );
  r.summary = `${r.total.toLocaleString('fa-IR')} مورد تخطی سقف/کف واحد (کف ثابت ۱۲)`;
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
