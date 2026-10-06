import type { ReportFilters, ReportResult } from './actions';
import { paged, studentWhere } from './actions';
import { sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';

const ROLES = ['ADMIN', 'EDU_EXPERT', 'FINANCE_EXPERT', 'FINANCE'];

export const CARDS = [
  { kind: 'tuition-tariff', icon: '💰', title: 'تعرفه تحصیلی' },
  { kind: 'tuition-statement', icon: '🧾', title: 'صورت‌حساب شهریه دانشجو', needsTerm: true },
];

const CHARGE = sql`sl."transactionType" IN ('TUITION_FIXED','TUITION_VARIABLE','SUBJECT_ADDITIVE')`;
const DISC = sql`sl."transactionType" IN ('DISCOUNT_FIXED','DISCOUNT_VARIABLE','SUBJECT_DEDUCTIVE')`;
const PAID = sql`sl."transactionType" IN ('PAYMENT','POS_PAYMENT','LOAN','SPONSORSHIP')`;

export async function run(kind: string, f: ReportFilters): Promise<ReportResult | null> {
  await requireRole(ROLES);

  // ── تعرفه تحصیلی: قواعد tuition_rules ──
  if (kind === 'tuition-tariff') {
    const from = sql`FROM tuition_rules tr
      LEFT JOIN degree_level_configs d ON d.id = tr."degreeLevelId"
      LEFT JOIN majors m ON m.id = tr."majorId"
      LEFT JOIN faculties fc ON fc.id = tr."facultyId"
      LEFT JOIN financial_terms fct ON fct.id = tr."currentTermId"
      LEFT JOIN academic_terms at ON at.id = fct."academicTermId"`;
    const conds = [];
    if (f.universityId) conds.push(sql`(tr."universityId" = ${f.universityId} OR tr."universityId" IS NULL)`);
    if (f.degreeId) conds.push(sql`tr."degreeLevelId" = ${f.degreeId}`);
    if (f.facultyId) conds.push(sql`tr."facultyId" = ${f.facultyId}`);
    if (f.majorId) conds.push(sql`tr."majorId" = ${f.majorId}`);
    if (f.entryYear) conds.push(sql`(tr."entryYearFrom" IS NULL OR tr."entryYearFrom" <= ${f.entryYear}) AND (tr."entryYearTo" IS NULL OR tr."entryYearTo" >= ${f.entryYear})`);
    if (f.term) conds.push(sql`(tr."currentTermId" IS NULL OR at."termCode" = ${f.term})`);
    if (f.q) {
      const like = `%${f.q}%`;
      conds.push(sql`(tr.code ILIKE ${like} OR tr.title ILIKE ${like})`);
    }
    const cols = sql`tr.code AS code, tr.title AS title, d.title AS degree, m.name AS major,
      tr."entryYearFrom" AS yfrom, tr."entryYearTo" AS yto, tr."termType" AS termtype,
      tr."fixedAmount" AS fixed, tr."perUnitTheory" AS theory, tr."perUnitPractical" AS practical,
      tr."perUnitGeneral" AS general,
      CASE WHEN tr."isActive" = 1 THEN 'فعال' ELSE 'غیرفعال' END AS active`;
    const r = await paged(
      [
        { key: 'code', title: 'کد تعرفه' }, { key: 'title', title: 'عنوان' },
        { key: 'degree', title: 'مقطع' }, { key: 'major', title: 'رشته' },
        { key: 'yfrom', title: 'ورودی از' }, { key: 'yto', title: 'ورودی تا' },
        { key: 'termtype', title: 'نوع ترم' }, { key: 'fixed', title: 'شهریه ثابت' },
        { key: 'theory', title: 'نظری/واحد' }, { key: 'practical', title: 'عملی/واحد' },
        { key: 'general', title: 'عمومی/واحد' }, { key: 'active', title: 'وضعیت' },
      ],
      from, conds, cols, sql`ORDER BY tr.priority, tr.id`, f,
    );
    r.summary = `${r.total.toLocaleString('fa-IR')} قاعده تعرفه`;
    return r;
  }

  // ── صورت‌حساب شهریه دانشجو: تجمیع student_ledger ──
  if (kind === 'tuition-statement') {
    const ledgerJoin = f.term
      ? sql`LEFT JOIN student_ledger sl ON sl."studentId" = s.id AND sl."termId" = (SELECT id FROM academic_terms WHERE "termCode" = ${f.term} LIMIT 1)`
      : sql`LEFT JOIN student_ledger sl ON sl."studentId" = s.id`;
    const from = sql`FROM students s JOIN users u ON u.id = s."userId"
      LEFT JOIN majors m ON m.id = s."majorId"
      LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"
      ${ledgerJoin}`;
    const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name,
      m.name AS major, d.title AS degree, s."entryYear" AS y,
      COALESCE(SUM(sl.amount) FILTER (WHERE ${CHARGE}), 0)::bigint AS charge,
      COALESCE(SUM(sl.amount) FILTER (WHERE ${DISC}), 0)::bigint AS discount,
      COALESCE(SUM(sl.amount) FILTER (WHERE ${PAID}), 0)::bigint AS paid,
      (COALESCE(SUM(sl.amount) FILTER (WHERE ${CHARGE}), 0)
        - COALESCE(SUM(sl.amount) FILTER (WHERE ${DISC}), 0)
        - COALESCE(SUM(sl.amount) FILTER (WHERE ${PAID}), 0))::bigint AS balance,
      COUNT(sl.id)::int AS txns`;
    const r = await paged(
      [
        { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
        { key: 'major', title: 'رشته' }, { key: 'degree', title: 'مقطع' },
        { key: 'y', title: 'ورودی' }, { key: 'charge', title: 'بدهی شهریه' },
        { key: 'discount', title: 'تخفیف' }, { key: 'paid', title: 'پرداختی' },
        { key: 'balance', title: 'مانده بدهی' }, { key: 'txns', title: 'تراکنش' },
      ],
      from, studentWhere(f), cols, sql`ORDER BY balance DESC`, f,
      sql`s.id, s."studentCode", u."firstName", u."lastName", m.name, d.title, s."entryYear"`,
    );
    r.summary = `${r.total.toLocaleString('fa-IR')} دانشجو${f.term ? ` — ترم ${f.term}` : ' — همه ترم‌ها'} (مانده = بدهی − تخفیف − پرداختی)`;
    return r;
  }

  return null;
}
