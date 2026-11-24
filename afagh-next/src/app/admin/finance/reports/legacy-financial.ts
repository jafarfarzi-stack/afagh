import { sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  CREDIT_LEDGER_TYPES,
  DEBT_LEDGER_TYPES,
  ledgerTypesCsv,
} from '@/lib/ledger-balance';

/**
 * بارگذاری مشترک سه گزارشِ رسمی مالی «سامانهٔ سما» (fqSumTa / fqTrDaTe / fqTr).
 *
 * چرا یک ماژول؟ سه فرم قدیمی از یک منبع داده و یک مدلِ مبلغ تغذیه می‌شوند و
 * فقط سطحِ تجمیعشان فرق دارد:
 *   • r1 `semester-major-detail` (fqSumTa) → (رشته × نیمسال ورود) + جمع رشته
 *   • r2 `faculty-financial`     (fqTrDaTe) → (دانشکده × نیمسال ورود) + جمع دانشکده
 *   • r4 `semester-financial`    (fqTr)     → (نیمسال ورود) + جمع نیمسال
 *
 * 🔒 منبعِ جمعیت: `legacy_moshgel_enrollments` (فقط ACTIVE) برای ترم‌هایی که
 * دادهٔ سما دارند؛ برای ترم‌های بدون دادهٔ سما، دانشجویانِ دارای ردیف دفترِ
 * همان ترم. ترتیبِ اولویت مهم است: تنها منبعی که تعدادهای PDFِ سما را
 * بازتولید می‌کند moshgel است (۳۰۲۵ نفر برای ۱۴۰۵۱).
 *
 * 🔒 بُعدِ دانشکده در r2/r4 از `moshgel.facultyCode` می‌آید، نه دانشکدهٔ فعلیِ
 * رشته؛ فقط یک دانشجو (۴۰۳۲۲۲۷۵۰۱) بین این دو اختلاف دارد و همین باعث می‌شد
 * جمعِ دانشکده یک نفر بیشتر شود. بُعدِ «رشته» در r1 از دانشکدهٔ فعلیِ رشته
 * می‌آید تا سرفصل/باندِ دانشکده با نام رشته هم‌خوان بماند.
 *
 * 🔒 مدلِ مبلغ (دقیقاً منطبق با PDF):
 *   شهریه متغیر   = TUITION_VARIABLE
 *   شهریه ثابت    = TUITION_FIXED + TUITION_CHARGE
 *   تخفیفات متغیر = DISCOUNT_VARIABLE + TUITION_BATES_VARIABLE
 *   تخفیفات ثابت  = DISCOUNT_FIXED + TUITION_BATES_FIXED
 *   تخفیفات مبلغی = TUITION_BATES + TUITION_BATES_AMOUNT + TUITION_ADJUST_INC
 *   پرداختی‌ها    = PAYMENT + POS_PAYMENT + SPONSORSHIP + CREDIT (بدون LOAN)
 *   مساعده        = LOAN
 *   مبالغ موضوعی  = SUBJECT_ADDITIVE − SUBJECT_DEDUCTIVE
 *   جمع بدهکار    = واژگانِ کانونیکِ DEBT_LEDGER_TYPES
 *   جمع بستانکار  = واژگانِ کانونیکِ CREDIT_LEDGER_TYPES
 *
 * ⚠ ماندهٔ هر ردیف = max(بدهکار − بستانکار, 0) / max(بستانکار − بدهکار, 0)؛
 *   ماندهٔ جمع‌ها (جمع رشته/دانشکده/نیمسال) = **جمعِ ماندهٔ ردیف‌ها**، نه بازمحاسبه
 *   از جمعِ بدهکار/بستانکار. این تفاوت در PDF واقعی است (مثلاً جمع نیمسال:
 *   مانده بدهکار ۲۷۷٬۳۱۷٬۸۵۴٬۶۴۷ در حالی که بدهکار−بستانکار = ۲۷۴٬۱۶۷٬۸۵۴٬۶۴۷).
 */

const VARIABLE_T = ['TUITION_VARIABLE'] as const;
const FIXED_T = ['TUITION_FIXED', 'TUITION_CHARGE'] as const;
const DISC_VAR_T = ['DISCOUNT_VARIABLE', 'TUITION_BATES_VARIABLE'] as const;
const DISC_FIXED_T = ['DISCOUNT_FIXED', 'TUITION_BATES_FIXED'] as const;
const DISC_AMOUNT_T = ['TUITION_BATES', 'TUITION_BATES_AMOUNT', 'TUITION_ADJUST_INC'] as const;
const PAID_T = ['PAYMENT', 'POS_PAYMENT', 'SPONSORSHIP', 'CREDIT'] as const;
const LOAN_T = ['LOAN'] as const;
const SUBJ_ADD_T = ['SUBJECT_ADDITIVE'] as const;
const SUBJ_DEC_T = ['SUBJECT_DEDUCTIVE'] as const;

/** شرطِ IN روی نوع تراکنش — فهرست فقط از ثابت‌های کد می‌آید (بدون ورودی کاربر). */
const inTypes = (alias: string, types: readonly string[]) =>
  sql.raw(`"${alias}"."transactionType" IN (${ledgerTypesCsv(types)})`);

/** یک ردیف در ریزترین سطحِ مشترک: (دانشکدهٔ سما × رشته × نیمسال ورود). */
export type LegacyCommonRow = {
  mosFacultyCode: string;
  mosFaculty: string;
  majorFacultyId: number;
  majorFacultyCode: string;
  majorFaculty: string;
  majorCode: string;
  major: string;
  entryCode: string;
  students: number;
  variable: number;
  fixed: number;
  discVar: number;
  discFixed: number;
  discAmount: number;
  paid: number;
  loan: number;
  subject: number;
  debit: number;
  credit: number;
};

/** جمعِ مبالغ (بدون مانده) — پیش از محاسبهٔ مانده در سطحِ نهاییِ هر گزارش. */
export type LegacyAmounts = {
  students: number;
  variable: number;
  fixed: number;
  discVar: number;
  discFixed: number;
  discAmount: number;
  paid: number;
  loan: number;
  subject: number;
  debit: number;
  credit: number;
};

/** جمعِ کامل شامل مانده‌ها — برای ردیف/جمعِ نهاییِ گزارش. */
export type LegacyTotals = LegacyAmounts & {
  debtBalance: number;
  creditBalance: number;
};

const AMOUNT_KEYS: (keyof LegacyAmounts)[] = [
  'variable', 'fixed', 'discVar', 'discFixed', 'discAmount',
  'paid', 'loan', 'subject', 'debit', 'credit',
];

export const emptyAmounts = (): LegacyAmounts => ({
  students: 0, variable: 0, fixed: 0, discVar: 0, discFixed: 0,
  discAmount: 0, paid: 0, loan: 0, subject: 0, debit: 0, credit: 0,
});

/** جمعِ مبالغِ چند ردیف (دانشجو + همهٔ اقلام، بدون مانده). */
export function sumAmounts(rows: readonly LegacyAmounts[]): LegacyAmounts {
  const out = emptyAmounts();
  for (const r of rows) {
    out.students += Number(r.students) || 0;
    for (const k of AMOUNT_KEYS) out[k] += Number(r[k]) || 0;
  }
  return out;
}

/** مانده از بدهکار/بستانکار — فقط برای یک ردیفِ نهایی (گروه) به کار می‌رود. */
export function withBalance(a: LegacyAmounts): LegacyTotals {
  return {
    ...a,
    debtBalance: Math.max(a.debit - a.credit, 0),
    creditBalance: Math.max(a.credit - a.debit, 0),
  };
}

/** جمعِ جمع‌ها (جمع رشته/دانشکده/نیمسال) = جمعِ همهٔ فیلدها شامل مانده‌ها. */
export function sumTotals(list: readonly LegacyTotals[]): LegacyTotals {
  const out: LegacyTotals = { ...emptyAmounts(), debtBalance: 0, creditBalance: 0 };
  for (const t of list) {
    out.students += Number(t.students) || 0;
    for (const k of AMOUNT_KEYS) out[k] += Number(t[k]) || 0;
    out.debtBalance += Number(t.debtBalance) || 0;
    out.creditBalance += Number(t.creditBalance) || 0;
  }
  return out;
}

/** ستون‌های خروجی SQL (پیش از تبدیل به number). */
type RawRow = {
  mos_fac_code: string | null;
  mos_faculty: string | null;
  major_faculty_id: string | number | null;
  major_faculty_code: string | null;
  major_faculty: string | null;
  major_code: string | null;
  major: string | null;
  entry_code: string | null;
  students: string | number;
  variable: string | number;
  fixed: string | number;
  disc_var: string | number;
  disc_fixed: string | number;
  disc_amount: string | number;
  paid: string | number;
  loan: string | number;
  subject: string | number;
  debit: string | number;
  credit: string | number;
};

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export type LegacyFinancial = {
  rows: LegacyCommonRow[];
  /** آیا جمعیت از moshgel آمده (در غیر این صورت fallback از دفتر مالی). */
  fromMoshgel: boolean;
};

export async function loadLegacyFinancial(opts: {
  termCode: string;
  universityId: number;
  /** فیلترِ اختیاری روی کدِ دانشکدهٔ سما (نه id). */
  facultyCode?: string | null;
}): Promise<LegacyFinancial> {
  const { termCode, universityId } = opts;
  const facultyCode = opts.facultyCode ? String(opts.facultyCode) : '';

  const termId = sql`(SELECT id FROM academic_terms
    WHERE "termCode" = ${termCode} AND "universityId" = ${universityId}
    ORDER BY id DESC LIMIT 1)`;

  // منبع جمعیت: moshgel اگر برای این ترم داده دارد، وگرنه دفتر مالی.
  const mos = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n
    FROM legacy_moshgel_enrollments
    WHERE "termCode" = ${termCode}
  `);
  const fromMoshgel = n(mos.rows?.[0]?.n) > 0;

  const popCte = fromMoshgel
    ? sql`pop AS (
        SELECT s.id AS student_id,
               mo."facultyCode"::text AS mos_fac_code,
               mo."majorCode"::text AS major_code_text,
               mo."entryCode"::text AS entry_code
        FROM legacy_moshgel_enrollments mo
        JOIN students s
          ON s."studentCode" = mo.stno
         AND s."universityId" = ${universityId}
         AND s.status = 'ACTIVE'
        WHERE mo."termCode" = ${termCode}
        ${facultyCode ? sql`AND mo."facultyCode"::text = ${facultyCode}` : sql``}
      )`
    : sql`pop AS (
        SELECT s.id AS student_id,
               COALESCE(fc."facultyCode", '') AS mos_fac_code,
               m."majorCode" AS major_code_text,
               (s."entryYear" * 10 + COALESCE(s."entryTerm", 1))::text AS entry_code
        FROM students s
        JOIN student_ledger sl
          ON sl."studentId" = s.id
         AND sl."termId" = ${termId}
         AND sl."universityId" = ${universityId}
        JOIN majors m ON m.id = s."majorId"
        LEFT JOIN faculties fc ON fc.id = m."facultyId"
        WHERE s."universityId" = ${universityId}
          AND s.status = 'ACTIVE'
          ${facultyCode ? sql`AND COALESCE(fc."facultyCode", '') = ${facultyCode}` : sql``}
        GROUP BY 1, 2, 3, 4
      )`;

  const ledCte = sql`led AS (
    SELECT sl."studentId" AS student_id,
      COALESCE(SUM(sl.amount) FILTER (WHERE ${inTypes('sl', VARIABLE_T)}), 0)::bigint AS variable,
      COALESCE(SUM(sl.amount) FILTER (WHERE ${inTypes('sl', FIXED_T)}), 0)::bigint AS fixed,
      COALESCE(SUM(sl.amount) FILTER (WHERE ${inTypes('sl', DISC_VAR_T)}), 0)::bigint AS disc_var,
      COALESCE(SUM(sl.amount) FILTER (WHERE ${inTypes('sl', DISC_FIXED_T)}), 0)::bigint AS disc_fixed,
      COALESCE(SUM(sl.amount) FILTER (WHERE ${inTypes('sl', DISC_AMOUNT_T)}), 0)::bigint AS disc_amount,
      COALESCE(SUM(sl.amount) FILTER (WHERE ${inTypes('sl', PAID_T)}), 0)::bigint AS paid,
      COALESCE(SUM(sl.amount) FILTER (WHERE ${inTypes('sl', LOAN_T)}), 0)::bigint AS loan,
      COALESCE(SUM(sl.amount) FILTER (WHERE ${inTypes('sl', SUBJ_ADD_T)}), 0)::bigint AS subject_add,
      COALESCE(SUM(sl.amount) FILTER (WHERE ${inTypes('sl', SUBJ_DEC_T)}), 0)::bigint AS subject_dec,
      COALESCE(SUM(sl.amount) FILTER (WHERE ${inTypes('sl', DEBT_LEDGER_TYPES)}), 0)::bigint AS debit,
      COALESCE(SUM(sl.amount) FILTER (WHERE ${inTypes('sl', CREDIT_LEDGER_TYPES)}), 0)::bigint AS credit
    FROM student_ledger sl
    WHERE sl."termId" = ${termId}
      AND sl."universityId" = ${universityId}
    GROUP BY 1
  )`;

  const res = await db.execute<RawRow>(sql`
    WITH ${popCte}, ${ledCte}
    SELECT
      pop.mos_fac_code,
      COALESCE(mfac.name, 'نامشخص') AS mos_faculty,
      COALESCE(mfc.id, 0) AS major_faculty_id,
      COALESCE(mfc."facultyCode", '') AS major_faculty_code,
      COALESCE(mfc.name, 'نامشخص') AS major_faculty,
      COALESCE(m."majorCode", pop.major_code_text, '') AS major_code,
      COALESCE(m.name, 'نامشخص') AS major,
      pop.entry_code,
      COUNT(DISTINCT pop.student_id)::int AS students,
      COALESCE(SUM(l.variable), 0)::bigint AS variable,
      COALESCE(SUM(l.fixed), 0)::bigint AS fixed,
      COALESCE(SUM(l.disc_var), 0)::bigint AS disc_var,
      COALESCE(SUM(l.disc_fixed), 0)::bigint AS disc_fixed,
      COALESCE(SUM(l.disc_amount), 0)::bigint AS disc_amount,
      COALESCE(SUM(l.paid), 0)::bigint AS paid,
      COALESCE(SUM(l.loan), 0)::bigint AS loan,
      (COALESCE(SUM(l.subject_add), 0) - COALESCE(SUM(l.subject_dec), 0))::bigint AS subject,
      COALESCE(SUM(l.debit), 0)::bigint AS debit,
      COALESCE(SUM(l.credit), 0)::bigint AS credit
    FROM pop
    LEFT JOIN led l ON l.student_id = pop.student_id
    LEFT JOIN LATERAL (
      SELECT mj.id, mj."majorCode", mj.name, mj."facultyId"
      FROM majors mj
      WHERE mj."majorCode" = pop.major_code_text
        AND mj."universityId" = ${universityId}
      ORDER BY mj.id
      LIMIT 1
    ) m ON true
    LEFT JOIN faculties mfc ON mfc.id = m."facultyId"
    LEFT JOIN LATERAL (
      SELECT fc.name
      FROM faculties fc
      WHERE fc."facultyCode" = pop.mos_fac_code
        AND (fc."universityId" = ${universityId} OR fc."universityId" IS NULL)
      ORDER BY fc.id
      LIMIT 1
    ) mfac ON true
    GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
    ORDER BY NULLIF(pop.mos_fac_code, '')::int, 6, 8
  `);

  const rows: LegacyCommonRow[] = (res.rows ?? []).map((r) => ({
    mosFacultyCode: String(r.mos_fac_code ?? ''),
    mosFaculty: String(r.mos_faculty ?? 'نامشخص'),
    majorFacultyId: n(r.major_faculty_id),
    majorFacultyCode: String(r.major_faculty_code ?? ''),
    majorFaculty: String(r.major_faculty ?? 'نامشخص'),
    majorCode: String(r.major_code ?? ''),
    major: String(r.major ?? 'نامشخص'),
    entryCode: String(r.entry_code ?? ''),
    students: n(r.students),
    variable: n(r.variable),
    fixed: n(r.fixed),
    discVar: n(r.disc_var),
    discFixed: n(r.disc_fixed),
    discAmount: n(r.disc_amount),
    paid: n(r.paid),
    loan: n(r.loan),
    subject: n(r.subject),
    debit: n(r.debit),
    credit: n(r.credit),
  }));

  return { rows, fromMoshgel };
}
