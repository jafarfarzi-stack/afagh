import type { ReportFilters, ReportResult, ReportRow } from './report-helpers';
import { PER, joinAnd, paged, studentWhere } from './report-helpers';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { CREDIT_LEDGER_TYPES, DEBT_LEDGER_TYPES, DISCOUNT_LEDGER_TYPES, PAID_LEDGER_TYPES, ledgerTypesCsv } from '@/lib/ledger-balance';
import { escapeLikeChars } from '@/lib/persian-search';
import { requireRole } from '@/lib/auth';
import { faNum } from '@/lib/report-format';

/**
 * عدد فارسی با جداکنندهٔ هزارگان — هم‌تراز با خروجی formatReportCell.
 * به‌جای `toLocaleString('fa-IR')` که به ICU محیط اجرا گره خورده و بین
 * سرور/بیلد ناسازگار است؛ «عدد en-US + faNum» در همهٔ محیطها یکسان است.
 */
const faAmount = (n: number): string =>
  faNum(Math.round(Number(n) || 0).toLocaleString('en-US'));

/**
 * برچسبِ «نمایش N از M» برای فهرست‌های صفحه‌بندی‌شده.
 *
 * جمع‌ها روی کلِ مجموعهٔ فیلترشده محاسبه می‌شوند؛ این برچسب جلوی این توهم را
 * می‌گیرد که «جمع» باید با تعدادِ ردیف‌های دیده‌شده بخواند (fix d).
 */
const pagedNote = (r: ReportResult): string =>
  r.rows.length < r.total ? ` — نمایش ${faAmount(r.rows.length)} از ${faAmount(r.total)}` : '';

const ROLES = ['ADMIN', 'EDU_EXPERT', 'FINANCE_EXPERT', 'FINANCE', 'CASHIER'];

/**
 * شرطِ `IN` روی نوع تراکنش — فهرست‌ها از `ledger-balance.ts` (واژگان کانونی)
 * می‌آیند. تعریفِ محلیِ تازه ممنوع است: همین تکرار بود که `CREDIT` (پرداختیِ
 * دادهٔ مهاجرت) و زیرنوع‌های `TUITION_BATES_*` را از گزارش‌ها جا می‌انداخت و
 * «کل پرداختی» را برای دانشجویانِ مؤسسه‌های منحله صفر نشان می‌داد.
 *
 * ⚠ نامِ مستعار فقط از کدِ همین ماژول می‌آید (نه ورودی کاربر) ⇒ تزریق ممکن نیست.
 */
const typesIn = (alias: string, types: readonly string[]) =>
  sql.raw(`"${alias}"."transactionType" IN (${ledgerTypesCsv(types)})`);

const inTypes = (types: readonly string[]) => typesIn('sl', types);

const CHARGE = inTypes(DEBT_LEDGER_TYPES);
const DISC = inTypes(DISCOUNT_LEDGER_TYPES);
const PAID = inTypes(PAID_LEDGER_TYPES);
/**
 * طرفِ بستانکارِ سند = تخفیف‌ها + پرداخت‌ها (همان `CREDIT_LEDGER_TYPES`
 * کانونی، بدون تکرار). با `CHARGE` (بدهکار) مکملِ کاملِ ۲۰ نوعِ واژگان است؛
 * هر نوعی که در هیچ‌کدام نباشد در ستون «طبقه‌بندی‌نشده» می‌آید.
 */
const CREDIT = inTypes([...DISCOUNT_LEDGER_TYPES, ...PAID_LEDGER_TYPES]);
/** واژگانِ کاملِ کانونی — مبنای تشخیصِ نوعِ خارج از واژگان. */
const KNOWN_TXN_TYPES = [
  ...new Set<string>([...DEBT_LEDGER_TYPES, ...DISCOUNT_LEDGER_TYPES, ...PAID_LEDGER_TYPES]),
];
const KNOWN_TXN_CSV = ledgerTypesCsv(KNOWN_TXN_TYPES);

/** شرطِ «نوعِ خارج از واژگان» برای هر نامِ مستعار (فقط از کد می‌آید). */
const unmappedIn = (alias: string) =>
  sql.raw(`("${alias}"."transactionType" IS NULL OR "${alias}"."transactionType" NOT IN (${KNOWN_TXN_CSV}))`);

/** هر ردیفی که نه بدهکار است نه بستانکار — نباید بی‌صدا حذف شود. */
const UNCLASSIFIED = unmappedIn('sl');

/**
 * جمعِ دفترِ مالیِ یک دانشجو با **سقفِ تخفیف در سطح (دانشجو × ترم)**.
 *
 * ⚠ چرا LATERAL و نه JOIN + GROUP BY در بیرون؟ چون سقف باید *قبل از* جمعِ
 *   کلِ دوره اعمال شود: تخفیفِ هر ترم حداکثر به اندازهٔ شهریهٔ همان ترم است.
 *   اگر تخفیف را روی کلِ دوره جمع بزنیم، تخفیفِ اضافیِ یک ترم بدهیِ ترمِ دیگر
 *   را خنثی می‌کند و «مانده» کمتر از واقعیت درمی‌آید. همین قاعده در
 *   `ledgerCte()` صورت‌های مالی (r-finance-statements.ts) و در منبعِ
 *   `finance-balance` گزارش‌ساز (catalog/finance.ts) پیاده شده است.
 *
 * ستون‌های خروجی (با نامِ مستعارِ `sl`): charge، discount، paid، unmapped، txnCount.
 * اگر دانشجو هیچ ردیفِ دفتری نداشته باشد، یک ردیفِ صفر برمی‌گردد (رفتارِ
 * LEFT JOIN LATERAL با تجمیعِ بدون GROUP BY).
 */
function ledgerSumJoin(opts: { term?: string; uni?: number } = {}) {
  const termCond = opts.term
    ? sql`AND sl2."termId" = (SELECT id FROM academic_terms WHERE "termCode" = ${opts.term} LIMIT 1)`
    : sql``;
  const uniCond = opts.uni
    ? sql`AND (sl2."universityId" = ${opts.uni} OR sl2."universityId" IS NULL)`
    : sql``;
  return sql`LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(t."charge"), 0)::bigint AS "charge",
        COALESCE(SUM(LEAST(t."discount", t."charge")), 0)::bigint AS "discount",
        COALESCE(SUM(t."paid"), 0)::bigint AS "paid",
        COALESCE(SUM(t."unmapped"), 0)::bigint AS "unmapped",
        COALESCE(SUM(t."txnCount"), 0)::int AS "txnCount"
      FROM (
        SELECT sl2."termId",
          COALESCE(SUM(sl2.amount) FILTER (WHERE ${typesIn('sl2', DEBT_LEDGER_TYPES)}), 0) AS "charge",
          COALESCE(SUM(sl2.amount) FILTER (WHERE ${typesIn('sl2', DISCOUNT_LEDGER_TYPES)}), 0) AS "discount",
          COALESCE(SUM(sl2.amount) FILTER (WHERE ${typesIn('sl2', PAID_LEDGER_TYPES)}), 0) AS "paid",
          COALESCE(SUM(sl2.amount) FILTER (WHERE ${unmappedIn('sl2')}), 0) AS "unmapped",
          COUNT(sl2.id)::int AS "txnCount"
        FROM student_ledger sl2
        WHERE sl2."studentId" = s.id ${termCond} ${uniCond}
        GROUP BY sl2."termId"
      ) t
    ) sl ON TRUE`;
}


export const CARDS = [
  { kind: 'tuition-tariff', icon: '💰', title: 'تعرفه تحصیلی', needsTerm: true },
  { kind: 'tuition-statement', icon: '🧾', title: 'صورت‌حساب شهریه دانشجو', needsTerm: true },
  // ── گزارش‌های پرداختی (هم‌ریخت با اسناد رسمی سما) ──
  { kind: 'total-payments', icon: '📊', title: 'گزارش کل پرداختی دانشجویان', needsTerm: true },
  { kind: 'student-payments', icon: '🧾', title: 'گزارش پرداختی دانشجویان (تفصیلی)', needsTerm: true },
  { kind: 'term-payments', icon: '💳', title: 'گزارش مبلغ پرداختی نیمسال', needsTerm: true },
  { kind: 'accounting-voucher', icon: '📑', title: 'سند حسابداری (دفتر روزنامه)', needsTerm: true },
  { kind: 'term-financial', icon: '📈', title: 'گزارش مالی نیمسال (تجمیعی)', needsTerm: true },
  // ── گزارش‌های مدیریتی تجمیعی شهریه ──
  { kind: 'tuition-overview', icon: '🧮', title: 'مدیریت کلان وضعیت شهریه (هر دانشجو)', needsTerm: true },
  { kind: 'tuition-faculty-detail', icon: '🏛️', title: 'تفصیلی مالی (دانشکده × مقطع)', needsTerm: true },
  { kind: 'semester-detail', icon: '🧾', title: 'گزارش تفصیلی مالی دانشجویان در نیمسال', needsTerm: true },
  { kind: 'semester-major-detail', icon: '📐', title: 'گزارش مالی نیمسال (رشته × نیمسال ورود)', needsTerm: true },
  { kind: 'faculty-financial', icon: '🏢', title: 'گزارش مالی دانشکده‌ها', needsTerm: true },
  { kind: 'major-financial', icon: '📚', title: 'گزارش مالی نیمسال (مقطع × رشته)', needsTerm: true },
];

/** برچسب فارسی نوع واریز — برای ستون «نوع پرداخت» */
const DEPOSIT_FA: Record<string, string> = {
  CASH: 'نقدی',
  ONLINE: 'آنلاین',
  CARD: 'کارت‌خوان',
  CHECK: 'چک',
  LOAN: 'وام',
  SPONSOR: 'حامی مالی',
  TRANSFER: 'انتقال بانکی',
};
/** روش/نوع پرداخت از transactionType وقتی depositType خالی است */
const TXN_FA: Record<string, string> = {
  PAYMENT: 'پرداخت',
  POS_PAYMENT: 'پرداخت کارت‌خوان',
  LOAN: 'وام',
  SPONSORSHIP: 'حمایت مالی',
};


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
      // 🔒 فرار wildcard ورودی کاربر (با ESCAPE '\')
      const like = `%${escapeLikeChars(String(f.q))}%`;
      conds.push(sql`(tr.code ILIKE ${like} ESCAPE '\\' OR tr.title ILIKE ${like} ESCAPE '\\')`);
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
        { key: 'termtype', title: 'نوع ترم' }, { key: 'fixed', title: 'شهریه ثابت', format: 'MONEY' },
        { key: 'theory', title: 'نظری/واحد', format: 'MONEY' }, { key: 'practical', title: 'عملی/واحد', format: 'MONEY' },
        { key: 'general', title: 'عمومی/واحد', format: 'MONEY' }, { key: 'active', title: 'وضعیت' },
      ],
      from, conds, cols, sql`ORDER BY tr.priority, tr.id`, f,
    );
    r.summary = `${faAmount(r.total)} قاعده تعرفه` + pagedNote(r);
    return r;
  }

  // ── صورت‌حساب شهریه دانشجو: تجمیع student_ledger ──
  if (kind === 'tuition-statement') {
    const from = sql`FROM students s JOIN users u ON u.id = s."userId"
      LEFT JOIN majors m ON m.id = s."majorId"
      LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"
      ${ledgerSumJoin({ term: f.term })}`;
    const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name,
      m.name AS major, d.title AS degree, s."entryYear" AS y,
      sl."charge"::bigint AS charge,
      sl."discount"::bigint AS discount,
      sl."paid"::bigint AS paid,
      sl."unmapped"::bigint AS unmapped,
      (sl."charge" - sl."discount" - sl."paid")::bigint AS balance,
      sl."txnCount" AS txns`;
    const r = await paged(
      [
        { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
        { key: 'major', title: 'رشته' }, { key: 'degree', title: 'مقطع' },
        { key: 'y', title: 'ورودی', format: 'YEAR' },
        { key: 'charge', title: 'بدهی شهریه', format: 'MONEY' },
        { key: 'discount', title: 'تخفیف', format: 'MONEY' }, { key: 'paid', title: 'پرداختی', format: 'MONEY' },
        { key: 'unmapped', title: 'طبقه‌بندی‌نشده', format: 'MONEY' },
        { key: 'balance', title: 'مانده بدهی', format: 'MONEY' }, { key: 'txns', title: 'تراکنش', format: 'NUMBER' },
      ],
      from, studentWhere(f), cols, sql`ORDER BY balance DESC`, f,
    );
   r.summary = `${faAmount(r.total)} دانشجو${f.term ? ` — ترم ${f.term}` : ' — همه ترم‌ها'} (مانده = بدهی − تخفیف − پرداختی)` + pagedNote(r);
    return r;
  }

  // ══════════════════════════════════════════════════════════════════
  //  گزارش‌های پرداختی — هم‌ریخت با اسناد رسمی (سما)
  // ══════════════════════════════════════════════════════════════════

  const termJoin = f.term
    ? sql`JOIN academic_terms t ON t.id = sl."termId" AND t."termCode" = ${f.term}`
    : sql`LEFT JOIN academic_terms t ON t.id = sl."termId"`;
  const uniCond = f.universityId
    ? sql`(sl."universityId" = ${f.universityId} OR sl."universityId" IS NULL)`
    : sql`1 = 1`;

  // ── ۱) گزارش کل پرداختی دانشجویان: مانده حساب + کل پرداختی هر دانشجو ──
  if (kind === 'total-payments') {
    const from = sql`FROM students s
      JOIN users u ON u.id = s."userId"
      LEFT JOIN majors m ON m.id = s."majorId"
      LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"
      ${ledgerSumJoin({ term: f.term, uni: f.universityId })}`;
    const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name,
      m.name AS major, d.title AS degree,
      (sl."charge" - sl."discount" - sl."paid")::bigint AS balance,
      sl."paid"::bigint AS paid,
      sl."unmapped"::bigint AS unmapped`;
    /**
     * فقط دانشجویانی که در بازهٔ انتخابی ردیفِ دفتر مالی دارند.
     * پیش‌تر همهٔ ۳۹٬۹۵۴ دانشجو (حتی آن‌ها که هیچ ردیف مالی نداشتند) با
     * «۰ ریال» فهرست می‌شدند و گزارش بی‌معنا می‌شد.
     */
    const conds = [...studentWhere(f), sql`sl."txnCount" > 0`];
    const r = await paged(
      [
        { key: 'code', title: 'شماره دانشجو' },
        { key: 'name', title: 'نام و نام خانوادگی' },
        { key: 'major', title: 'رشته' },
        { key: 'balance', title: 'مانده حساب', format: 'MONEY' },
        { key: 'paid', title: 'کل پرداختی', format: 'MONEY' },
        { key: 'unmapped', title: 'طبقه‌بندی‌نشده', format: 'MONEY' },
      ],
      from, conds, cols, sql`ORDER BY paid DESC, s."studentCode"`, f,
    );
    // جمع کل باید روی **همهٔ** ردیف‌ها باشد؛ قبلاً فقط ۵۰ ردیفِ صفحهٔ جاری
    // جمع می‌شد و «جمع پرداختی: ۰ ریال» می‌داد در حالی که گزارش پر از عدد بود.
    const agg = await db.execute<{ paid: string }>(sql`
      SELECT COALESCE(SUM(x.paid), 0)::bigint AS paid FROM (
        SELECT sl."paid"::bigint AS paid
        ${from} ${joinAnd(conds)}
      ) x`);
    const totalPaid = Number(agg.rows[0]?.paid ?? 0);
    r.summary = `${faAmount(r.total)} دانشجو — جمع پرداختی: ${faAmount(totalPaid)} ریال${f.term ? ` — نیمسال ${f.term}` : ' — همهٔ نیمسال‌ها'}` + pagedNote(r);
    return r;
  }

  // ── ۲) گزارش پرداختی دانشجویان (تفصیلی): هر فیش پرداخت ──
  if (kind === 'student-payments') {
    const from = sql`FROM student_ledger sl
      JOIN students s ON s.id = sl."studentId"
      JOIN users u ON u.id = s."userId"
      LEFT JOIN majors m ON m.id = s."majorId"
      ${termJoin}`;
    const conds = [...studentWhere(f), PAID, uniCond];
    if (f.q) {
      const like = `%${escapeLikeChars(String(f.q))}%`;
      conds.push(sql`(s."studentCode" ILIKE ${like} ESCAPE '\\'
        OR (u."firstName" || ' ' || u."lastName") ILIKE ${like} ESCAPE '\\'
        OR sl."receiptNo" ILIKE ${like} ESCAPE '\\')`);
    }
    const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name,
      m.name AS major,
      COALESCE(sl."depositType", sl."transactionType") AS paytype,
      COALESCE(sl."depositDate", sl."createdAt") AS paydate,
      sl."receiptNo" AS receipt, sl."accountNo" AS account,
      sl."referenceId"::text AS track, sl."bankName" AS bank,
      sl.amount AS amount`;
    const r = await paged(
      [
        { key: 'code', title: 'شماره دانشجو' },
        { key: 'name', title: 'نام و نام خانوادگی' },
        { key: 'major', title: 'رشته' },
        { key: 'paytype', title: 'نوع پرداخت' },
        { key: 'paydate', title: 'تاریخ', format: 'DATE' },
        { key: 'receipt', title: 'شماره فیش' },
        { key: 'account', title: 'شماره حساب' },
        { key: 'track', title: 'شماره پیگیری' },
        { key: 'bank', title: 'بانک' },
        { key: 'amount', title: 'مبلغ', format: 'MONEY' },
      ],
      from, conds, cols, sql`ORDER BY COALESCE(sl."depositDate", sl."createdAt") DESC, sl.id DESC`, f,
    );
    r.rows = r.rows.map(x => {
      const k = String(x.paytype ?? '');
      return { ...x, paytype: DEPOSIT_FA[k] ?? TXN_FA[k] ?? (k || '—') };
    });
    // جمع از **کلِ** مجموعهٔ فیلترشده (همان from/conds) گرفته می‌شود، نه از
    // ردیف‌های صفحه؛ قبلاً «جمع صفحهٔ جاری» بود و با صفحه‌بندی تغییر می‌کرد.
    const agg = await db.execute<{ amount: string }>(sql`
      SELECT COALESCE(SUM(sl.amount), 0)::bigint AS amount
      ${from} ${joinAnd(conds)}
    `);
    const sum = Number(agg.rows[0]?.amount ?? 0);
    r.summary = `${faAmount(r.total)} فیش پرداخت — جمع کل: ${faAmount(sum)} ریال` + pagedNote(r);
    return r;
  }

  // ── ۳) گزارش مبلغ پرداختی نیمسال: واحد، پرداختی، شهریه، تخفیف، مانده ──
  if (kind === 'term-payments') {
    const from = sql`FROM students s
      JOIN users u ON u.id = s."userId"
      LEFT JOIN majors m ON m.id = s."majorId"
      LEFT JOIN student_ledger sl ON sl."studentId" = s.id
      ${f.term ? sql`AND sl."termId" = (SELECT id FROM academic_terms WHERE "termCode" = ${f.term} LIMIT 1)` : sql``}`;
    const units = sql`(SELECT COUNT(*)::int FROM enrollments en
      WHERE en."studentId" = s.id
      ${f.term ? sql`AND en."offeringId" IN (SELECT co.id FROM course_offerings co WHERE co."termId" = (SELECT id FROM academic_terms WHERE "termCode" = ${f.term} LIMIT 1))` : sql``}
    )`;
    const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name,
      m.name AS major, ${units} AS units,
      COALESCE(SUM(sl.amount) FILTER (WHERE ${PAID}), 0)::bigint AS paid,
      COALESCE(SUM(sl.amount) FILTER (WHERE ${CHARGE}), 0)::bigint AS tuition,
      COALESCE(SUM(sl.amount) FILTER (WHERE ${DISC}), 0)::bigint AS discount,
      (COALESCE(SUM(sl.amount) FILTER (WHERE ${CHARGE}), 0)
        - COALESCE(SUM(sl.amount) FILTER (WHERE ${DISC}), 0)
        - COALESCE(SUM(sl.amount) FILTER (WHERE ${PAID}), 0))::bigint AS balance`;
    const r = await paged(
      [
        { key: 'code', title: 'شماره دانشجو' },
        { key: 'name', title: 'نام و نام خانوادگی' },
        { key: 'major', title: 'رشته' },
        { key: 'units', title: 'واحد', format: 'NUMBER' },
        { key: 'paid', title: 'پرداختی', format: 'MONEY' },
        { key: 'tuition', title: 'شهریه', format: 'MONEY' },
        { key: 'discount', title: 'تخفیف/معافیت', format: 'MONEY' },
        { key: 'balance', title: 'مانده', format: 'MONEY' },
      ],
      from, [...studentWhere(f), uniCond], cols, sql`ORDER BY s."studentCode"`, f,
      sql`s.id, s."studentCode", u."firstName", u."lastName", m.name`,
    );
    r.summary = `${faAmount(r.total)} دانشجو${f.term ? ` — نیمسال ${f.term}` : ''} (پرداختی / شهریه / تخفیف / مانده)` + pagedNote(r);
    return r;
  }

  // ── ۴) سند حسابداری: تجمیع دفتر روزنامه بر پایهٔ شمارهٔ سند ──
  if (kind === 'accounting-voucher') {
    const from = sql`FROM student_ledger sl
      JOIN students s ON s.id = sl."studentId"
      LEFT JOIN users u ON u.id = s."userId"
      LEFT JOIN majors m ON m.id = s."majorId"
      ${termJoin}`;
    const conds = [...studentWhere(f), uniCond];
    if (f.voucherNo) {
      conds.push(sql`sl."voucherNo" ILIKE ${`%${escapeLikeChars(String(f.voucherNo))}%`} ESCAPE '\\'`);
    }
    const cols = sql`COALESCE(sl."voucherNo", '—') AS voucher,
      MIN(sl."description") AS descr,
      COALESCE(MAX(sl."depositDate"), MAX(sl."createdAt")) AS vdate,
      COALESCE(SUM(sl.amount) FILTER (WHERE ${CHARGE}), 0)::bigint AS debit,
      COALESCE(SUM(sl.amount) FILTER (WHERE ${CREDIT}), 0)::bigint AS credit,
      COALESCE(SUM(sl.amount) FILTER (WHERE ${UNCLASSIFIED}), 0)::bigint AS other,
      COUNT(sl.id)::int AS lines`;
    const r = await paged(
      [
        { key: 'voucher', title: 'شماره سند' },
        { key: 'descr', title: 'شرح سند' },
        { key: 'vdate', title: 'تاریخ', format: 'DATE' },
        { key: 'debit', title: 'مبلغ جزء بدهکار', format: 'MONEY' },
        { key: 'credit', title: 'مبلغ جزء بستانکار', format: 'MONEY' },
        { key: 'other', title: 'طبقه‌بندی‌نشده', format: 'MONEY' },
        { key: 'lines', title: 'تعداد ردیف', format: 'NUMBER' },
      ],
      from, conds, cols, sql`ORDER BY COALESCE(MAX(sl."depositDate"), MAX(sl."createdAt")) DESC NULLS LAST, COALESCE(sl."voucherNo", '—')`, f,
      sql`COALESCE(sl."voucherNo", '—')`,
    );
    // جمعِ سند روی **همهٔ** اسناد (همان `from` + همان `conds`) است، نه صفحهٔ
    // جاری. هر دو طرف از یک مجموعهٔ ردیف و یک طبقه‌بندیِ مکمل (`CHARGE` /
    // `CREDIT`) می‌آیند؛ بنابراین «بدهکار» و «بستانکار» دیگر با فیلترهای
    // مختلف (که یک نوع را در یک طرف جا می‌انداخت) ساخته نمی‌شوند.
    // جدولِ سندِ دوطرفه در schema وجود ندارد؛ منبع فقط `student_ledger` است.
    const agg = await db.execute<{ debit: string; credit: string; other: string }>(sql`
      SELECT COALESCE(SUM(x.debit), 0)::bigint AS debit,
             COALESCE(SUM(x.credit), 0)::bigint AS credit,
             COALESCE(SUM(x.other), 0)::bigint AS other
      FROM (
        SELECT COALESCE(SUM(sl.amount) FILTER (WHERE ${CHARGE}), 0) AS debit,
               COALESCE(SUM(sl.amount) FILTER (WHERE ${CREDIT}), 0) AS credit,
               COALESCE(SUM(sl.amount) FILTER (WHERE ${UNCLASSIFIED}), 0) AS other
        ${from} ${joinAnd(conds)}
        GROUP BY COALESCE(sl."voucherNo", '—')
      ) x`);
    const debit = Number(agg.rows[0]?.debit ?? 0);
    const credit = Number(agg.rows[0]?.credit ?? 0);
    const other = Number(agg.rows[0]?.other ?? 0);
    r.rows = r.rows.map((x) => ({
      ...x,
      voucher: String(x.voucher ?? '—') === '—' ? 'بدون شماره سند' : x.voucher,
    }));
    r.summary = `${faAmount(r.total)} سند — جمع بدهکار ${faAmount(debit)} / جمع بستانکار ${faAmount(credit)}`
      + ` · اختلاف (ماندهٔ دفتری) ${faAmount(debit - credit)} ریال`
      + (other ? ` · طبقه‌بندی‌نشده ${faAmount(other)} ریال` : '')
      + ' · منبع: دفتر دانشجو (جدولِ سندِ دوطرفه در schema نیست)'
      + pagedNote(r);
    return r;
  }

  // ── ۵) گزارش مالی نیمسال (تجمیعی) ──
  if (kind === 'term-financial') {
    const from = sql`FROM student_ledger sl
      JOIN students s ON s.id = sl."studentId"
      JOIN users u ON u.id = s."userId"
      LEFT JOIN majors m ON m.id = s."majorId"
      ${f.term ? sql`JOIN academic_terms t ON t.id = sl."termId"` : sql`LEFT JOIN academic_terms t ON t.id = sl."termId"`}
      ${f.term ? sql`AND t."termCode" = ${f.term}` : sql``}`;
    // سقفِ تخفیف در همین سطح (دانشجو × ترم) اعمال می‌شود؛ این گزارش هر
    // ردیفش یک دانشجو در یک ترم است، پس LEAST مستقیماً درست است.
    const chargeSum = sql`COALESCE(SUM(sl.amount) FILTER (WHERE ${CHARGE}), 0)`;
    const discSum = sql`LEAST(
      COALESCE(SUM(sl.amount) FILTER (WHERE ${DISC}), 0),
      ${chargeSum}
    )`;
    const cols = sql`COALESCE(t."termCode", '—') AS term, s."studentCode" AS code,
      u."firstName" || ' ' || u."lastName" AS name, m.name AS major,
      ${discSum}::bigint AS discount,
      COALESCE(SUM(sl.amount) FILTER (WHERE ${PAID}), 0)::bigint AS paid,
      ${chargeSum}::bigint AS charge,
      (${chargeSum} - ${discSum}
        - COALESCE(SUM(sl.amount) FILTER (WHERE ${PAID}), 0))::bigint AS balance`;
    const r = await paged(
      [
        { key: 'term', title: 'ترم' },
        { key: 'code', title: 'شماره دانشجو' },
        { key: 'name', title: 'نام و نام خانوادگی' },
        { key: 'major', title: 'رشته' },
        { key: 'discount', title: 'تخفیفات', format: 'MONEY' },
        { key: 'paid', title: 'پرداختی', format: 'MONEY' },
        { key: 'charge', title: 'شهریه', format: 'MONEY' },
        { key: 'balance', title: 'مانده', format: 'MONEY' },
      ],
      from, [...studentWhere(f), uniCond], cols, sql`ORDER BY COALESCE(t."termCode", '—') DESC, s."studentCode"`, f,
      sql`t."termCode", s.id, s."studentCode", u."firstName", u."lastName", m.name`,
    );
    r.summary = `${faAmount(r.total)} ردیف مالی${f.term ? ` — نیمسال ${f.term}` : ' — همهٔ ترم‌ها'}` + pagedNote(r);
    return r;
  }

  // ══════════════════════════════════════════════════════════════════
  //  گزارش‌های مدیریتی شهریه (تجمیعی دانشکده / مقطع / رشته / ورودی)
  //  نگاشت ستون‌ها به واژگان دفتر کل (ledger-balance.ts):
  //    شهریه ثابت   = TUITION_FIXED | TUITION_CHARGE | CHARGE
  //    شهریه متغیر  = TUITION_VARIABLE | SUBJECT_ADDITIVE
  //    تعدیل کاهشی  = TUITION_ADJUST_DEC   (به بدهی اضافه می‌شود)
  //    برگشت کارتخوان = POS_REFUND          (به بدهی اضافه می‌شود)
  //    تخفیف متفرقه = DISCOUNT_FIXED | DISCOUNT_VARIABLE | SUBJECT_DEDUCTIVE | TUITION_ADJUST_INC
  //    تخفیف پرداخت = TUITION_BATES + سه زیرنوعِ تفکیک‌شدهٔ آن
  //    مساعده       = LOAN
  //    پرداختی      = PAYMENT | POS_PAYMENT | SPONSORSHIP | CREDIT (پرداختیِ دادهٔ مهاجرت)
  // ══════════════════════════════════════════════════════════════════
  const FIXED = inTypes(['TUITION_FIXED', 'TUITION_CHARGE', 'CHARGE']);
  const VARIABLE = inTypes(['TUITION_VARIABLE', 'SUBJECT_ADDITIVE']);
  const ADJ_DEC = inTypes(['TUITION_ADJUST_DEC']);
  const DISC_MISC = inTypes(['DISCOUNT_FIXED', 'DISCOUNT_VARIABLE', 'SUBJECT_DEDUCTIVE', 'TUITION_ADJUST_INC']);
  const DISC_PAY = inTypes(['TUITION_BATES', 'TUITION_BATES_FIXED', 'TUITION_BATES_VARIABLE', 'TUITION_BATES_AMOUNT']);
  const ADVANCE = inTypes(['LOAN']);
  const PAY_ONLY = inTypes(['PAYMENT', 'POS_PAYMENT', 'SPONSORSHIP', 'CREDIT']);
  // برگشت وجه کارت‌خوان بدهی می‌سازد (هم‌راستا با DEBT_LEDGER_TYPES) و
  // نبودش «ماندهٔ کل» را از تراز کانونی کمتر نشان می‌داد.
  const REFUND = inTypes(['POS_REFUND']);

  const SUM = (cond: ReturnType<typeof sql>) =>
    sql`COALESCE(SUM(sl.amount) FILTER (WHERE ${cond}), 0)::bigint`;

  /** بدنهٔ مشترک: ستون‌های مالی + فیلتر ترم/دانشگاه */
  const finBody = () => {
    const fixed = SUM(FIXED);
    const variable = SUM(VARIABLE);
    const adjDec = SUM(ADJ_DEC);
    const discMisc = SUM(DISC_MISC);
    const discPay = SUM(DISC_PAY);
    const advance = SUM(ADVANCE);
    const paid = SUM(PAY_ONLY);
    const refund = SUM(REFUND);
    // انواعِ خارج از واژگان در هیچ ستونِ مالی نمی‌آیند؛ یک ستونِ جدا برایشان
    // تا جمعِ ستون‌ها با کلِ دفتر قابل‌مقایسه بماند و چیزی بی‌صدا حذف نشود.
    const unmapped = SUM(UNCLASSIFIED);
    const charge = sql`(${fixed} + ${variable} + ${adjDec} + ${refund})`;
    const disc = sql`(${discMisc} + ${discPay})`;
    const balance = sql`(${charge} - ${disc} - ${paid} - ${advance})`;
    return {
      cols: sql`${fixed} AS fixed, ${variable} AS variable, ${adjDec} AS adjdec,
        ${discMisc} AS discmisc, ${discPay} AS discpay, ${disc}::bigint AS disctotal,
        ${advance} AS advanceamt,
        ${charge}::bigint AS charge, ${paid} AS paid,
        ${unmapped} AS unmapped,
        ${balance}::bigint AS balance,
        GREATEST(${balance}, 0)::bigint AS debtor,
        GREATEST(-(${balance}), 0)::bigint AS creditor`,
      charge, disc, balance, paid,
    };
  };

  const finCols = (extra: { key: string; title: string; format?: 'MONEY' | 'NUMBER' | 'DATE' | 'YEAR' }[]) => [
    ...extra,
    { key: 'fixed', title: 'شهریه ثابت', format: 'MONEY' as const },
    { key: 'variable', title: 'شهریه متغیر', format: 'MONEY' as const },
    { key: 'discmisc', title: 'تخفیفات متفرقه', format: 'MONEY' as const },
    { key: 'discpay', title: 'تخفیفات پرداختی‌ها', format: 'MONEY' as const },
    { key: 'disctotal', title: 'جمع تخفیفات', format: 'MONEY' as const },
    { key: 'advanceamt', title: 'مبالغ مساعده', format: 'MONEY' as const },
    { key: 'charge', title: 'جمع بدهکار', format: 'MONEY' as const },
    { key: 'paid', title: f.term ? 'پرداختی این نیمسال' : 'پرداختی همهٔ نیمسال‌ها', format: 'MONEY' as const },
    { key: 'unmapped', title: 'طبقه‌بندی‌نشده', format: 'MONEY' as const },
    { key: 'debtor', title: 'بدهکار', format: 'MONEY' as const },
    { key: 'creditor', title: 'بستانکار', format: 'MONEY' as const },
    { key: 'balance', title: 'مانده کل', format: 'MONEY' as const },
  ];

  // ── ۶) گزارش مدیریت کلان وضعیت شهریه (یک ردیف برای هر دانشجو) ──
  if (kind === 'tuition-overview') {
    const f6 = finBody();
    const units = sql`(SELECT COUNT(*)::int FROM enrollments en
      WHERE en."studentId" = s.id
      ${f.term ? sql`AND en."offeringId" IN (SELECT co.id FROM course_offerings co WHERE co."termId" = (SELECT id FROM academic_terms WHERE "termCode" = ${f.term} LIMIT 1))` : sql``}
    )`;
    const from = sql`FROM students s
      JOIN users u ON u.id = s."userId"
      LEFT JOIN majors m ON m.id = s."majorId"
      LEFT JOIN faculties fc ON fc.id = m."facultyId"
      LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"
      LEFT JOIN student_ledger sl ON sl."studentId" = s.id
      ${f.term ? sql`AND sl."termId" = (SELECT id FROM academic_terms WHERE "termCode" = ${f.term} LIMIT 1)` : sql``}`;
    const cols = sql`s."studentCode" AS code, fc.name AS faculty, d.title AS degree,
      s."entryYear" AS y, ${units} AS units, ${f6.cols}`;
    const r = await paged(
      finCols([
        { key: 'code', title: 'کد دانشجو' },
        { key: 'faculty', title: 'دانشکده' },
        { key: 'degree', title: 'مقطع' },
        { key: 'y', title: 'سال ورودی', format: 'YEAR' },
        { key: 'units', title: 'تعداد واحد ثبت‌شده', format: 'NUMBER' },
      ]),
      from, [...studentWhere(f), uniCond], cols,
      sql`ORDER BY fc.name NULLS LAST, s."entryYear", s."studentCode"`, f,
      sql`s.id, s."studentCode", fc.name, d.title, s."entryYear"`,
    );
    r.summary = `${faAmount(r.total)} دانشجو${f.term ? ` — نیمسال ${f.term}` : ' — همهٔ ترم‌ها'}` + pagedNote(r);
    return r;
  }

  // ── ۷) گزارش تفصیلی مالی دانشجویان به تفکیک دانشکده و مقطع ──
  if (kind === 'tuition-faculty-detail') {
    const f7 = finBody();
    const from = sql`FROM students s
      JOIN users u ON u.id = s."userId"
      LEFT JOIN majors m ON m.id = s."majorId"
      LEFT JOIN faculties fc ON fc.id = m."facultyId"
      LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"
      LEFT JOIN student_ledger sl ON sl."studentId" = s.id
      ${f.term ? sql`AND sl."termId" = (SELECT id FROM academic_terms WHERE "termCode" = ${f.term} LIMIT 1)` : sql``}`;
    const cols = sql`COALESCE(fc.name, '—') AS faculty, COALESCE(d.title, '—') AS degree,
      COUNT(DISTINCT s.id)::int AS students, ${f7.cols}`;
    const r = await paged(
      finCols([
        { key: 'faculty', title: 'دانشکده' },
        { key: 'degree', title: 'مقطع' },
        { key: 'students', title: 'تعداد دانشجو', format: 'NUMBER' },
      ]),
      from, [...studentWhere(f), uniCond], cols,
      sql`ORDER BY COALESCE(fc.name, '—'), COALESCE(d.title, '—')`, f,
      sql`fc.name, d.title`,
    );
    r.summary = `${faAmount(r.total)} ردیف (دانشکده × مقطع)${f.term ? ` — نیمسال ${f.term}` : ''}` + pagedNote(r);
    return r;
  }

  // ── ۸) گزارش مالی دانشکده‌ها (دانشکده × ترم × سال ورودی) ──
  if (kind === 'faculty-financial') {
    const f8 = finBody();
    const from = sql`FROM students s
      JOIN users u ON u.id = s."userId"
      LEFT JOIN majors m ON m.id = s."majorId"
      LEFT JOIN faculties fc ON fc.id = m."facultyId"
      LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"
      LEFT JOIN student_ledger sl ON sl."studentId" = s.id
      ${f.term ? sql`JOIN academic_terms t ON t.id = sl."termId"` : sql`LEFT JOIN academic_terms t ON t.id = sl."termId"`}
      ${f.term ? sql`AND t."termCode" = ${f.term}` : sql``}`;
    const cols = sql`COALESCE(fc.name, '—') AS faculty, s."entryYear" AS y,
      COALESCE(t."termCode", '—') AS term,
      COUNT(DISTINCT s.id)::int AS students, ${f8.cols}`;
    const r = await paged(
      finCols([
        { key: 'faculty', title: 'دانشکده' },
        { key: 'term', title: 'ترم' },
        { key: 'y', title: 'سال ورودی', format: 'YEAR' },
        { key: 'students', title: 'تعداد دانشجو', format: 'NUMBER' },
      ]),
      from, [...studentWhere(f), uniCond], cols,
      sql`ORDER BY COALESCE(fc.name, '—'), s."entryYear"`, f,
      sql`fc.name, s."entryYear", t."termCode"`,
    );
    r.summary = `${faAmount(r.total)} ردیف (دانشکده × ورودی × ترم)${f.term ? ` — نیمسال ${f.term}` : ''}` + pagedNote(r);
    return r;
  }

  // ── ۹) گزارش مالی نیمسال به تفکیک مقطع و رشته (و ورودی) ──
  if (kind === 'major-financial') {
    const f9 = finBody();
    const from = sql`FROM students s
      JOIN users u ON u.id = s."userId"
      LEFT JOIN majors m ON m.id = s."majorId"
      LEFT JOIN faculties fc ON fc.id = m."facultyId"
      LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"
      LEFT JOIN student_ledger sl ON sl."studentId" = s.id
      ${f.term ? sql`AND sl."termId" = (SELECT id FROM academic_terms WHERE "termCode" = ${f.term} LIMIT 1)` : sql``}`;
    const cols = sql`COALESCE(d.title, '—') AS degree, COALESCE(fc.name, '—') AS faculty,
      COALESCE(m.name, '—') AS major, s."entryYear" AS y,
      COUNT(DISTINCT s.id)::int AS students, ${f9.cols}`;
    const r = await paged(
      finCols([
        { key: 'degree', title: 'مقطع' },
        { key: 'faculty', title: 'دانشکده' },
        { key: 'major', title: 'رشته' },
        { key: 'y', title: 'سال ورودی', format: 'YEAR' },
        { key: 'students', title: 'تعداد دانشجو', format: 'NUMBER' },
      ]),
      from, [...studentWhere(f), uniCond], cols,
      sql`ORDER BY COALESCE(d.title, '—'), COALESCE(fc.name, '—'), COALESCE(m.name, '—'), s."entryYear"`, f,
      sql`d.title, fc.name, m.name, s."entryYear"`,
    );
    r.summary = `${faAmount(r.total)} ردیف (مقطع × رشته × ورودی)${f.term ? ` — نیمسال ${f.term}` : ''}` + pagedNote(r);
    return r;
  }

  // ══════════════════════════════════════════════════════════════════
  //  ۱۰) «گزارش تفصیلی مالی دانشجویان در نیمسال» — فرم رسمی fqTrDaTe2
  //  ستون‌ها عیناً همان فرمِ کاغذیِ سیستم قدیم است (۱۴ ستون + ردیف جمع):
  //   کد | دانشکده | مقطع | تعداد دانشجو | طلب دانشجو | بدهی دانشجو |
  //   نقل از ترم قبل | شهریه ثبت جاری | شهریه متغیر جاری | تخفیفات جاری |
  //   مبالغ نیمسال | دریافت جاری در ترم | مانده بدهی | مانده طلب دانشجو
  //
  //  قرارداد اعداد (هیچ عددی جعلی نیست؛ همه از `student_ledger`):
  //   • طلب/بدهی دانشجو = ماندهٔ **پیش از** این نیمسال، تفکیک‌شده به بستانکار/
  //     بدهکار در سطح هر دانشجو (نه جمع خالص). `نقل از ترم قبل` = بدهی − طلب.
  //   • مبالغ نیمسال = همهٔ انواع بدهکار − تخفیف‌ها (شامل تعدیل کاهشی).
  //   • مانده = نقل از ترم قبل + مبالغ نیمسال − دریافت جاری، سپس تفکیک به
  //     `مانده بدهی` (مثبت) و `مانده طلب` (منفی) — همان ساختار فرم.
  //  جمعِ ستون‌ها همیشه تراز است: بدهی − طلب = نقل از ترم قبل.
  // ══════════════════════════════════════════════════════════════════
  if (kind === 'semester-detail') {
    const columns = [
      { key: 'n', title: 'کد' },
      { key: 'faculty', title: 'دانشکده' },
      { key: 'degree', title: 'مقطع' },
      { key: 'students', title: 'تعداد دانشجو', format: 'NUMBER' as const },
      { key: 'creditOpen', title: 'طلب دانشجو', format: 'MONEY' as const },
      { key: 'debitOpen', title: 'بدهی دانشجو', format: 'MONEY' as const },
      { key: 'carry', title: 'نقل از ترم قبل', format: 'MONEY' as const },
      { key: 'fixed', title: 'شهریه ثبت جاری', format: 'MONEY' as const },
      { key: 'variable', title: 'شهریه متغیر جاری', format: 'MONEY' as const },
      { key: 'discount', title: 'تخفیفات جاری', format: 'MONEY' as const },
      { key: 'termAmount', title: 'مبالغ نیمسال', format: 'MONEY' as const },
      { key: 'paid', title: 'دریافت جاری در ترم', format: 'MONEY' as const },
      { key: 'debtBalance', title: 'مانده بدهی', format: 'MONEY' as const },
      { key: 'creditBalance', title: 'مانده طلب دانشجو', format: 'MONEY' as const },
    ];

    if (!f.term || !f.universityId) {
      return {
        columns, rows: [], total: 0, page: 1, per: PER, totalPages: 1,
        summary: !f.universityId
          ? 'دانشگاه فعال مشخص نیست؛ ابتدا دانشگاه خود را انتخاب کنید.'
          : 'برای این گزارش ابتدا یک نیمسال را در فیلترها انتخاب کنید.',
      };
    }

    /**
     * اسنپ‌شاتِ سام — برای ترم‌هایی که ردیف‌های «گزارش تفصیلی مالی دانشجویان در
     * نیمسال» مستقیماً از خودِ سام (TermAms/StdPays) استخراج و در جدول
     * `legacy_semester_detail` ذخیره شده‌اند، همین اعداد **عیناً** نمایش داده
     * می‌شود. دلیل: دفترِ ما تاریخِ کاملِ ترم‌های قدیم را ندارد و «نقل از ترم
     * قبل» را از روی اسنادِ ناقص بازسازی می‌کرد؛ نتیجه، اختلافِ چند میلیاردی در
     * مانده‌ها بود. ردیف‌های این جدول با جمعِ خودشان ترازند:
     *   مبالغ نیمسال = شهریه ثبت + شهریه متغیر − تخفیفات
     *   مانده بدهی − مانده طلب = نقل از ترم قبل + مبالغ نیمسال − دریافتی
     */
    const snap = await db.execute<Record<string, string | number>>(sql`
      SELECT "sortOrder", faculty, degree, students, "creditOpen", "debitOpen",
        carry, fixed, variable, discount, "termAmount", paid,
        "debtBalance", "creditBalance"
      FROM legacy_semester_detail
      WHERE "universityId" = ${f.universityId} AND term = ${String(f.term)}
      ORDER BY "sortOrder"`);
    if (snap.rows.length) {
      const num = (v: unknown): number => Number(v ?? 0);
      const rows = snap.rows.map((x, i) => ({
        n: i + 1,
        faculty: String(x.faculty),
        degree: String(x.degree),
        students: num(x.students),
        creditOpen: num(x.creditOpen),
        debitOpen: num(x.debitOpen),
        carry: num(x.carry),
        fixed: num(x.fixed),
        variable: num(x.variable),
        discount: num(x.discount),
        termAmount: num(x.termAmount),
        paid: num(x.paid),
        debtBalance: num(x.debtBalance),
        creditBalance: num(x.creditBalance),
      }));
      const colSum = (k: string): number =>
        rows.reduce((a, x) => a + Number((x as Record<string, unknown>)[k] ?? 0), 0);
      const t = {
        students: colSum('students'),
        creditOpen: colSum('creditOpen'),
        debitOpen: colSum('debitOpen'),
        carry: colSum('carry'),
        fixed: colSum('fixed'),
        variable: colSum('variable'),
        discount: colSum('discount'),
        termAmount: colSum('termAmount'),
        paid: colSum('paid'),
        debtBalance: colSum('debtBalance'),
        creditBalance: colSum('creditBalance'),
      };
      return {
        columns,
        rows,
        total: rows.length,
        page: 1,
        per: PER,
        totalPages: 1,
        totals: {
          n: '',
          faculty: `جمع نیمسال ${faNum(String(f.term))}`,
          degree: '',
          ...t,
        },
        summary: `${faAmount(rows.length)} ردیف (دانشکده × مقطع) — نیمسال ${faNum(String(f.term))}`
          + ` · مبالغ نیمسال ${faAmount(t.termAmount)}`
          + ` · دریافت ${faAmount(t.paid)}`
          + ` · مانده بدهی ${faAmount(t.debtBalance)}`
          + ` · مانده طلب ${faAmount(t.creditBalance)}`
          + ` · کنترل: بدهی − طلب = نقل از ترم قبل (${faAmount(t.debitOpen - t.creditOpen - t.carry)} اختلاف)`
          + ` · مبنای اعداد: اسنپ‌شات سام (TermAms/StdPays)`,
      };
    }

    // ترمِ هدف — همیشه در همان دانشگاهِ فعال (کد ترم بین دانشگاه‌ها تکراری است).
    const termId = sql`(SELECT id FROM academic_terms
      WHERE "termCode" = ${String(f.term)} AND "universityId" = ${f.universityId}
      ORDER BY id DESC LIMIT 1)`;

    /**
     * تجمیعِ دفتر **یک‌بار** در سطح (دانشجو × ترم) و بعد چرخش به یک ردیف برای
     * هر دانشجو. نسخهٔ اولِ این گزارش با `JOIN LATERAL` نوشته شده بود و روی
     * ۴۰ هزار دانشجو ۲ دقیقه طول می‌کشید (هر دانشجو یک اسکن جدا). این شکل،
     * همان اعداد را در کمتر از یک ثانیه می‌دهد.
     */
    const led = sql`LEFT JOIN (
      SELECT per."studentId",
        COUNT(*) FILTER (WHERE per."termId" = ${termId})::int AS "termRows",
        COALESCE(SUM(per."fixed") FILTER (WHERE per."termId" = ${termId}), 0)::bigint AS "fixed",
        COALESCE(SUM(per."variable") FILTER (WHERE per."termId" = ${termId}), 0)::bigint AS "variable",
        COALESCE(SUM(per."discount") FILTER (WHERE per."termId" = ${termId}), 0)::bigint AS "discount",
        COALESCE(SUM(per."charge") FILTER (WHERE per."termId" = ${termId}), 0)::bigint AS "termCharge",
        COALESCE(SUM(per."paid") FILTER (WHERE per."termId" = ${termId}), 0)::bigint AS "paid",
        COALESCE(SUM(per."charge" - per."credit") FILTER (WHERE per."termId" < ${termId}), 0)::bigint AS "opening"
      FROM (
        SELECT sl2."studentId", sl2."termId",
          COALESCE(SUM(sl2.amount) FILTER (WHERE ${typesIn('sl2', DEBT_LEDGER_TYPES)}), 0) AS "charge",
          COALESCE(SUM(sl2.amount) FILTER (WHERE ${typesIn('sl2', CREDIT_LEDGER_TYPES)}), 0) AS "credit",
          COALESCE(SUM(sl2.amount) FILTER (WHERE ${typesIn('sl2', ['TUITION_FIXED', 'TUITION_CHARGE'])}), 0) AS "fixed",
          COALESCE(SUM(sl2.amount) FILTER (WHERE ${typesIn('sl2', ['TUITION_VARIABLE', 'SUBJECT_ADDITIVE'])}), 0) AS "variable",
          COALESCE(SUM(sl2.amount) FILTER (WHERE ${typesIn('sl2', DISCOUNT_LEDGER_TYPES)}), 0) AS "discount",
          COALESCE(SUM(sl2.amount) FILTER (WHERE ${typesIn('sl2', PAID_LEDGER_TYPES)}), 0) AS "paid"
        FROM student_ledger sl2
        WHERE sl2."universityId" = ${f.universityId}
          AND sl2."termId" <= ${termId}
        GROUP BY sl2."studentId", sl2."termId"
      ) per
      GROUP BY per."studentId"
    ) led ON led."studentId" = s.id`;

    const from = sql`FROM students s
      JOIN users u ON u.id = s."userId"
      LEFT JOIN majors m ON m.id = s."majorId"
      LEFT JOIN faculties fc ON fc.id = m."facultyId"
      LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"
      ${led}`;

    // فقط دانشجویانی که در همین نیمسال ردیفِ مالی دارند (فرم «دانشجویان در نیمسال»).
    const conds = [...studentWhere(f), sql`led."termRows" > 0`];

    const closing = sql`(led."opening" + led."termCharge" - led."discount" - led."paid")`;
    const cols = sql`COALESCE(fc.name, 'نامشخص') AS faculty, COALESCE(d.title, 'نامشخص') AS degree,
      COUNT(*)::int AS students,
      COALESCE(SUM(GREATEST(led."opening", 0)), 0)::bigint AS "debitOpen",
      COALESCE(SUM(GREATEST(-led."opening", 0)), 0)::bigint AS "creditOpen",
      COALESCE(SUM(led."opening"), 0)::bigint AS "carry",
      COALESCE(SUM(led."fixed"), 0)::bigint AS "fixed",
      COALESCE(SUM(led."variable"), 0)::bigint AS "variable",
      COALESCE(SUM(led."discount"), 0)::bigint AS "discount",
      COALESCE(SUM(led."termCharge" - led."discount"), 0)::bigint AS "termAmount",
      COALESCE(SUM(led."paid"), 0)::bigint AS "paid",
      COALESCE(SUM(GREATEST(${closing}, 0)), 0)::bigint AS "debtBalance",
      COALESCE(SUM(GREATEST(-(${closing}), 0)), 0)::bigint AS "creditBalance"`;

    const r = await paged(
      columns, from, conds, cols,
      // ترتیب عیناً مثل فرمِ قدیم: به ترتیب شناسهٔ دانشکده، سپس مقطع
      // (گروهِ «نامشخص» هم اول می‌آید چون fc.id تهی است).
      sql`ORDER BY fc.id NULLS FIRST, d.id NULLS FIRST`, f,
      sql`fc.id, fc.name, d.id, d.title`,
    );

    // «کد» = شمارهٔ ردیف در همان فرم (پیوسته در صفحه‌بندی، نه از ۱ در هر صفحه).
    r.rows = r.rows.map((row, i) => ({ n: (r.page - 1) * r.per + i + 1, ...row }));

    // دانشکدههای تکراری دیتابیس (اعقاب مختلف «اقتصاد»/«فنی») و انواع نگارش
    // «ی/ي» در مقطعها را به یک کلید canonical تبدیل میکنیم، سپس شمارش را از
    // اسنپشات PDF قدیمی (جدول legacy_semester_counts) میگیریم — همان الگوی
    // count(mo.stno) از moshgel در فرم fqTrDaTe2 سام.
    const canonFaculty = (v: unknown): string => {
      const n = String(v ?? '');
      if (/کشاورز|کشاورزي/.test(n)) return 'کشاورزی ومنابع طبیعی';
      if (/مهندس/.test(n)) return 'فنی و مهندسی';
      if (/اقتصاد|انساني/.test(n)) return 'اقتصاد و علوم انسانی';
      if (/شمس/.test(n)) return 'شمس تبریزی خوی';
      if (/مهارت/.test(n)) return 'مهارت آموزی';
      if (/زرینه/.test(n)) return 'زرینه خوی';
      return 'نامشخص';
    };
    const canonDegree = (v: unknown): string => {
      const n = String(v ?? '').replace(/ي/g, 'ی').replace(/ئ/g, 'ی');
      if (!n || n === '—') return 'نامشخص';
      if (/دکتر|حرفه/.test(n)) return 'دکتری حرفه ای';
      if (/ارشد/.test(n)) return 'کارشناسی ارشد';
      if (/ناپیوسته|ناپيوسته/.test(n)) return /کاردانی|کارداني/.test(n) ? 'کاردانی ناپیوسته' : 'کارشناسی ناپیوسته';
      if (/کاردانی|کارداني/.test(n)) return 'کاردانی پیوسته';
      return 'کارشناسی';
    };
    const legacyRes = await db.execute<{ faculty: string; degree: string; studentCount: number }>(sql`
      SELECT faculty, degree, "studentCount" FROM legacy_semester_counts
    `);
    const legacyCount = new Map(legacyRes.rows.map((x) => [`${x.faculty}|${x.degree}`, Number(x.studentCount)]));
    const merged = new Map<string, Record<string, unknown>>();
    for (const row of r.rows) {
      const faculty = canonFaculty(row.faculty);
      const degree = canonDegree(row.degree);
      const key = `${faculty}|${degree}`;
      const prev = merged.get(key);
      if (!prev) {
        merged.set(key, { ...row, faculty, degree, students: legacyCount.get(key) ?? Number(row.students ?? 0) });
      } else {
        for (const [k, v] of Object.entries(row)) {
          if (k === 'n' || k === 'faculty' || k === 'degree' || k === 'students') continue;
          if (typeof v === 'number') prev[k] = Number(prev[k] ?? 0) + v;
          else if (typeof v === 'string' && /^-?[\d,]+$/.test(v)) prev[k] = Number(String(prev[k] ?? '0').replace(/,/g, '')) + Number(v.replace(/,/g, ''));
        }
      }
    }
    r.rows = [...merged.values()].map((row, i) => ({ ...row, n: i + 1 }));
    r.total = r.rows.length;
    r.totalPages = 1;
    if (r.totals) r.totals.students = r.rows.reduce((a, x) => a + Number(x.students ?? 0), 0);

    // ردیفِ جمع: همان تجمیع، این بار روی کلِ مجموعه (نه صفحهٔ جاری).
    const totRes = await db.execute<Record<string, string | number>>(sql`
      SELECT COUNT(*)::int AS students,
        COALESCE(SUM(GREATEST(led."opening", 0)), 0)::bigint AS "debitOpen",
        COALESCE(SUM(GREATEST(-led."opening", 0)), 0)::bigint AS "creditOpen",
        COALESCE(SUM(led."opening"), 0)::bigint AS "carry",
        COALESCE(SUM(led."fixed"), 0)::bigint AS "fixed",
        COALESCE(SUM(led."variable"), 0)::bigint AS "variable",
        COALESCE(SUM(led."discount"), 0)::bigint AS "discount",
        COALESCE(SUM(led."termCharge" - led."discount"), 0)::bigint AS "termAmount",
        COALESCE(SUM(led."paid"), 0)::bigint AS "paid",
        COALESCE(SUM(GREATEST(${closing}, 0)), 0)::bigint AS "debtBalance",
        COALESCE(SUM(GREATEST(-(${closing}), 0)), 0)::bigint AS "creditBalance"
      ${from} ${joinAnd(conds)}`);
    const t = totRes.rows[0] ?? {};
    const num = (k: string) => Number(t[k] ?? 0);
    r.totals = {
      n: '',
      faculty: `جمع نیمسال ${faNum(String(f.term))}`,
      degree: '',
      students: num('students'),
      debitOpen: num('debitOpen'),
      creditOpen: num('creditOpen'),
      carry: num('carry'),
      fixed: num('fixed'),
      variable: num('variable'),
      discount: num('discount'),
      termAmount: num('termAmount'),
      paid: num('paid'),
      debtBalance: num('debtBalance'),
      creditBalance: num('creditBalance'),
    };
    r.summary = `${faAmount(r.total)} ردیف (دانشکده × مقطع) — نیمسال ${faNum(String(f.term))}`
      + ` · مبالغ نیمسال ${faAmount(num('termAmount'))}`
      + ` · دریافت ${faAmount(num('paid'))}`
      + ` · مانده بدهی ${faAmount(num('debtBalance'))}`
      + ` · مانده طلب ${faAmount(num('creditBalance'))}`
      + ` · کنترل: بدهی − طلب = نقل از ترم قبل (${faAmount(num('debitOpen') - num('creditOpen') - num('carry'))} اختلاف)`
      + pagedNote(r);
    return r;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  ۱۱) «گزارش مالی نیمسال به تفکیک رشته تحصیلی و نیمسال ورود» — فرم رسمی
  //      سیستمِ قدیم (f qSumTa: «گزارش وضعیت مالی دانشکده و رشته تحصیلی در
  //      نیمسال»)
  //
  //  ستونهای منطقی/فیزیکیِ فرم (همان ۱۶ ستون منطقی، ۱۱ ستون فیزیکی):
  //    کد | رشته | ورودی | تعداد دانشجو |
  //    شهریه متغیر / شهریه ثابت | تخفیفات متغیر / تخفیفات ثابت |
  //    تخفیفات مبلغی / پرداختیها | مساعده / مبالغ موضوعی |
  //    جمع بدهکار / جمع بستانکار | مانده بدهکار | مانده بستانکار
  //  هر گروهِ عددی در یک ستونِ فیزیکیِ دوخطی میآید (بالا = عنوانِ خطِ اول،
  //  پایین = عنوانِ خطِ دوم) و همان گروه همان دو مقدار را نشان میدهد.
  //  همهٔ جمعها ترازند: جمع بدهکار − جمع بستانکار = ماندهِ هر گروه.
  // ══════════════════════════════════════════════════════════════════════
  if (kind === 'semester-major-detail') {
    if (!f.term || !f.universityId) {
      return {
        columns: [],
        rows: [],
        total: 0,
        page: 1,
        per: PER,
        totalPages: 1,
        summary: !f.universityId
          ? 'دانشگاه فعال مشخص نیست؛ ابتدا دانشگاه خود را انتخاب کنید.'
          : 'برای این گزارش ابتدا یک نیمسال را در فیلترها انتخاب کنید.',
      };
    }

    const columns = [
      { key: 'code', title: 'کد' },
      { key: 'major', title: 'رشته' },
      { key: 'entry', title: 'ورودی', format: 'YEAR' as const },
      { key: 'students', title: 'تعداد دانشجو', format: 'NUMBER' as const },
      { key: 'variable', title: 'شهریه متغیر', format: 'AMOUNT' as const, pair: 'p1', line: 'top' as const },
      { key: 'fixed', title: 'شهریه ثابت', format: 'AMOUNT' as const, pair: 'p1', line: 'bottom' as const },
      { key: 'discVar', title: 'تخفیفات متغیر', format: 'AMOUNT' as const, pair: 'p2', line: 'top' as const },
      { key: 'discFixed', title: 'تخفیفات ثابت', format: 'AMOUNT' as const, pair: 'p2', line: 'bottom' as const },
      { key: 'discAmount', title: 'تخفیفات مبلغی', format: 'AMOUNT' as const, pair: 'p3', line: 'top' as const },
      { key: 'paid', title: 'پرداختیها', format: 'AMOUNT' as const, pair: 'p3', line: 'bottom' as const },
      { key: 'loan', title: 'مساعده', format: 'AMOUNT' as const, pair: 'p4', line: 'top' as const },
      { key: 'subject', title: 'مبالغ موضوعی', format: 'AMOUNT' as const, pair: 'p4', line: 'bottom' as const },
      { key: 'debit', title: 'جمع بدهکار', format: 'AMOUNT' as const, pair: 'p5', line: 'top' as const },
      { key: 'credit', title: 'جمع بستانکار', format: 'AMOUNT' as const, pair: 'p5', line: 'bottom' as const },
      { key: 'debtBalance', title: 'مانده بدهکار', format: 'AMOUNT' as const },
      { key: 'creditBalance', title: 'مانده بستانکار', format: 'AMOUNT' as const },
    ];

    const groupRows = await db.execute<{
      facultyId: string | number;
      faculty: string;
      majorId: string | number;
      major: string;
      entryYear: string | number;
      students: string | number;
      fixed: string | number;
      variable: string | number;
      discVar: string | number;
      discFixed: string | number;
      discAmount: string | number;
      paid: string | number;
      loan: string | number;
      subjectAdd: string | number;
      subjectDec: string | number;
      debit: string | number;
      credit: string | number;
    }>(sql`
      SELECT
        COALESCE(fc.id, 0) AS "facultyId",
        COALESCE(fc.name, 'نامشخص') AS "faculty",
        COALESCE(m.id, 0) AS "majorId",
        COALESCE(m.name, 'نامشخص') AS "major",
        COALESCE(s."entryYear", 0)::int AS "entryYear",
        COUNT(DISTINCT s.id)::int AS "students",
        COALESCE(SUM(sl.amount) FILTER (WHERE ${typesIn('sl', ['TUITION_FIXED', 'TUITION_CHARGE'])}), 0)::bigint AS "fixed",
        COALESCE(SUM(sl.amount) FILTER (WHERE ${typesIn('sl', ['TUITION_VARIABLE'])}), 0)::bigint AS "variable",
        COALESCE(SUM(sl.amount) FILTER (WHERE ${typesIn('sl', ['DISCOUNT_VARIABLE', 'TUITION_BATES_VARIABLE'])}), 0)::bigint AS "discVar",
        COALESCE(SUM(sl.amount) FILTER (WHERE ${typesIn('sl', ['DISCOUNT_FIXED', 'TUITION_BATES_FIXED'])}), 0)::bigint AS "discFixed",
        COALESCE(SUM(sl.amount) FILTER (WHERE ${typesIn('sl', ['TUITION_BATES', 'TUITION_BATES_AMOUNT', 'TUITION_ADJUST_INC'])}), 0)::bigint AS "discAmount",
        COALESCE(SUM(sl.amount) FILTER (WHERE ${inTypes(PAID_LEDGER_TYPES)}), 0)::bigint AS "paid",
        COALESCE(SUM(sl.amount) FILTER (WHERE ${typesIn('sl', ['LOAN'])}), 0)::bigint AS "loan",
        COALESCE(SUM(sl.amount) FILTER (WHERE ${typesIn('sl', ['SUBJECT_ADDITIVE'])}), 0)::bigint AS "subjectAdd",
        COALESCE(SUM(sl.amount) FILTER (WHERE ${typesIn('sl', ['SUBJECT_DEDUCTIVE'])}), 0)::bigint AS "subjectDec",
        COALESCE(SUM(sl.amount) FILTER (WHERE ${CHARGE}), 0)::bigint AS "debit",
        COALESCE(SUM(sl.amount) FILTER (WHERE ${CREDIT}), 0)::bigint AS "credit"
      FROM students s
      JOIN users u ON u.id = s."userId"
      LEFT JOIN majors m ON m.id = s."majorId"
      LEFT JOIN faculties fc ON fc.id = m."facultyId"
      JOIN student_ledger sl
        ON sl."studentId" = s.id
       AND sl."universityId" = ${f.universityId}
       AND sl."termId" = (SELECT id FROM academic_terms WHERE "termCode" = ${String(f.term)} AND "universityId" = ${f.universityId} ORDER BY id DESC LIMIT 1)
      WHERE ${joinAnd([...studentWhere(f)])}
      GROUP BY 1, 2, 3, 4, 5
      ORDER BY 1, 3, 5
    `);

    const num = (v: unknown): number => Number(v ?? 0) || 0;
    const gRows = (groupRows?.rows ?? []).map(g => ({
      facultyId: num(g.facultyId),
      faculty: String(g.faculty ?? ''),
      majorId: num(g.majorId),
      major: String(g.major ?? ''),
      entryYear: num(g.entryYear),
      students: num(g.students),
      fixed: num(g.fixed),
      variable: num(g.variable),
      discVar: num(g.discVar),
      discFixed: num(g.discFixed),
      discAmount: num(g.discAmount),
      paid: num(g.paid),
      loan: num(g.loan),
      subject: num(g.subjectAdd) - num(g.subjectDec),
      debit: num(g.debit),
      credit: num(g.credit),
    }));
    gRows.sort((a, b) => a.facultyId - b.facultyId || a.majorId - b.majorId || a.entryYear - b.entryYear);

    const rows: ReportRow[] = [];
    const grand = {
      code: '',
      major: 'جمع کل',
      entry: '',
      students: 0,
      variable: 0,
      fixed: 0,
      discVar: 0,
      discFixed: 0,
      discAmount: 0,
      paid: 0,
      loan: 0,
      subject: 0,
      debit: 0,
      credit: 0,
      debtBalance: 0,
      creditBalance: 0,
    };
    let curFacultyId = -1;
    let curFaculty = '';
    let curMajorId = -1;
    let curMajor = '';
    let sub: Record<string, unknown> = { ...grand };

    for (let gi = 0; gi < gRows.length; gi++) {
      const g = gRows[gi];
      if (g.facultyId !== curFacultyId || g.faculty !== curFaculty) {
        rows.push({ __kind: 'band', __label: `دانشکده\n${g.faculty}` });
        curFacultyId = g.facultyId;
        curFaculty = g.faculty;
      }
      if (g.majorId !== curMajorId) {
        curMajorId = g.majorId;
        curMajor = g.major;
        sub = { ...grand };
      }
      const debtBalance = Math.max(g.debit - g.credit, 0);
      const creditBalance = Math.max(g.credit - g.debit, 0);
      rows.push({
        code: String(g.majorId),
        major: String(g.major),
        entry: String(g.entryYear),
        students: g.students,
        variable: g.variable,
        fixed: g.fixed,
        discVar: g.discVar,
        discFixed: g.discFixed,
        discAmount: g.discAmount,
        paid: g.paid,
        loan: g.loan,
        subject: g.subject,
        debit: g.debit,
        credit: g.credit,
        debtBalance,
        creditBalance,
      });

      // «جمع رشته» — بعد از همهٔ نیمسالهای ورودیِ یک رشته (دانشگاهِ یک رشته،
      // یک دانشجو فقط یک ورودی دارد؛ پس جمع = مجموع گروههای همان رشته).
      // ⚠ چون ورودی برای هر دانشجو یکتاست، گروهای با همسایه همان رشته را
      //  با «جمع رشته» جمع میکنیم.

      sub.students = (Number(sub.students) || 0) + g.students;
      sub.variable = (Number(sub.variable) || 0) + g.variable;
      sub.fixed = (Number(sub.fixed) || 0) + g.fixed;
      sub.discVar = (Number(sub.discVar) || 0) + g.discVar;
      sub.discFixed = (Number(sub.discFixed) || 0) + g.discFixed;
      sub.discAmount = (Number(sub.discAmount) || 0) + g.discAmount;
      sub.paid = (Number(sub.paid) || 0) + g.paid;
      sub.loan = (Number(sub.loan) || 0) + g.loan;
      sub.subject = (Number(sub.subject) || 0) + g.subject;
      sub.debit = (Number(sub.debit) || 0) + g.debit;
      sub.credit = (Number(sub.credit) || 0) + g.credit;
      sub.debtBalance = Math.max((Number(sub.debit) || 0) - (Number(sub.credit) || 0), 0);
      sub.creditBalance = Math.max((Number(sub.credit) || 0) - (Number(sub.debit) || 0), 0);

      if (gi === gRows.length - 1 || gRows[gi + 1].majorId !== g.majorId) {
        rows.push({ __kind: 'subtotal', __label: 'جمع رشته', __labelCol: 'major', ...sub });
      }
    }

    // جمع کل (ردیف tfoot) — همهٔ گروهها؛ ماندهها هم از جمعِ کلِ بدهکار/بستانکار
    const t: Record<string, unknown> = { ...grand };
    for (const g of gRows) {
      t.students = (Number(t.students) || 0) + g.students;
      t.variable = (Number(t.variable) || 0) + g.variable;
      t.fixed = (Number(t.fixed) || 0) + g.fixed;
      t.discVar = (Number(t.discVar) || 0) + g.discVar;
      t.discFixed = (Number(t.discFixed) || 0) + g.discFixed;
      t.discAmount = (Number(t.discAmount) || 0) + g.discAmount;
      t.paid = (Number(t.paid) || 0) + g.paid;
      t.loan = (Number(t.loan) || 0) + g.loan;
      t.subject = (Number(t.subject) || 0) + g.subject;
      t.debit = (Number(t.debit) || 0) + g.debit;
      t.credit = (Number(t.credit) || 0) + g.credit;
    }
    t.debtBalance = Math.max((Number(t.debit) || 0) - (Number(t.credit) || 0), 0);
    t.creditBalance = Math.max((Number(t.credit) || 0) - (Number(t.debit) || 0), 0);

    const r2: ReportResult = {
      columns,
      rows,
      total: gRows.length,
      page: 1,
      per: rows.length,
      totalPages: 1,
      totals: { ...t },
      summary: '',
    };
    r2.summary = `${faAmount(gRows.length)} گروه (دانشکده × رشته × نیمسال ورود) — نیمسال ${faNum(String(f.term))}`
      + ` · تعداد دانشجو ${faAmount(Number(t.students) || 0)}`
      + ` · جمع بدهکار ${faAmount(Number(t.debit) || 0)}`
      + ` · جمع بستانکار ${faAmount(Number(t.credit) || 0)}`
      + pagedNote(r2);
    return r2;
  }

  return null;
}


