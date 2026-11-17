import type { ReportFilters, ReportResult } from './report-helpers';
import { PER, studentCodeCond } from './report-helpers';
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { escapeLikeChars } from '@/lib/persian-search';
import { faDigits, toJalali } from '@/lib/calendar';
import { faNum } from '@/lib/report-format';
import {
  DEBT_LEDGER_TYPES,
  DISCOUNT_LEDGER_TYPES,
  PAID_LEDGER_TYPES,
  ledgerTypesCsv,
} from '@/lib/ledger-balance';
import {
  buildBalanceSheet,
  buildBudgetVariance,
  buildCashFlow,
  buildCosting,
  buildIncomeStatement,
  allocate,
  R,
} from '@/lib/finance-reports/statements';

// ══════════════════════════════════════════════════════════════════════
//  گزارش‌های مالیِ کلان — صورت‌های مالیِ دانشگاه
//
//  این ماژول پوششِ دسته‌هایی را می‌آورد که در سیستم نبودند:
//    B) فروش مالی (صورت‌حساب کالا/خدمات)
//    C) سود و زیان · بهای تمام‌شده · انحراف بودجه
//    D) ترازنامه / صورت وضعیت مالی
//    E) نقدینگی / دریافت و پرداخت
//    F) گزارشات پیمانکاری
//    G) بیمه · حقوقی · مالیات بر ارزش افزوده
//    H) روزانه · موجودی کالا · هزینهٔ شرکت · تخصیص
//    I) سهم · درآمد سلسله‌مراتبی
//
//  ⚠ قواعد مشترک:
//  ▸ اسکوپ دانشگاه همیشه fail-closed است (بدون دانشگاه ⇒ صفر ردیف).
//  ▸ «تخفیف» همیشه **سقف‌خورده** شمرده می‌شود، دقیقاً مثل موتور کارنامه:
//      تخفیف = LEAST(جمع تخفیف‌ها, جمع شهریه‌ها) در سطح (دانشجو × ترم).
//    بدون این سقف، جمعِ تخفیف‌های یک ترم می‌توانست از فروش بیشتر شود.
//  ▸ همهٔ مبالغ ریال‌اند.
// ══════════════════════════════════════════════════════════════════════

const ROLES = ['ADMIN', 'EDU_EXPERT', 'FINANCE_EXPERT', 'FINANCE', 'CASHIER'];

// ── برچسب فارسی «نوع» ردیفهای صورت مالی ──
// پیشتر کد خام انگلیسی (HEAD/ITEM/TOTAL) در ستون «نوع» چاپ میشد؛ همیشه
// معادل فارسی نشان داده شود و مقادیر انگلیسی به کاربر نرسد.
const STATEMENT_KIND_FA: Record<'HEAD' | 'ITEM' | 'TOTAL', string> = {
  HEAD: 'سرفصل',
  ITEM: 'قلم',
  TOTAL: 'جمع',
};

// ── واژگان فارسی وضعیتها و منبعها (مبنای CHECK constraintهای schema.ts) ──
// هر مقدار ناشناخته عیناً خام برنمیگردد؛ «—» میگیرد تا انگلیسی لو نرود.
const CONTRACT_STATUS_FA: Record<string, string> = {
  DRAFT: 'پیش‌نویس',
  ACTIVE: 'فعال',
  SETTLED: 'تسویه‌شده',
  TERMINATED: 'فسخ‌شده',
};
const PAYROLL_STATUS_FA: Record<string, string> = {
  DRAFT: 'پیش‌نویس',
  MID_TERM_PAID: 'میان‌ترم پرداخت‌شده',
  DEPT_HEAD_APPROVED: 'تأییدشدهٔ مدیر گروه',
  DEAN_APPROVED: 'تأییدشدهٔ مدیر دانشکده',
  FINAL_SETTLED: 'تسویهٔ نهایی',
  REJECTED: 'ردشده',
};
const LEGAL_STATUS_FA: Record<string, string> = {
  OPEN: 'در جریان',
  IN_PROGRESS: 'در دست پیگیری',
  CLOSED: 'مختومه',
  SUSPENDED: 'معلق',
};
const VAT_SOURCE_FA: Record<string, string> = {
  INVOICE: 'فاکتور فروش',
  CONTRACT: 'صورتحساب پیمانکار',
  EXPENSE: 'هزینهٔ شرکت',
};

/** خواندن امن برچسب فارسی از یک Map واژگان — مقدار ناشناخته «—» میگیرد */
const faEnum = (map: Record<string, string>, v: unknown): string =>
  map[String(v ?? '')] ?? '—';

/**
 * مبلغ/شمار فارسی با جداکنندهٔ هزارگان — هم‌تراز با خروجی formatReportCell.
 *
 * چرا به‌جای `toLocaleString('fa-IR')`؟ خروجی آن به ICU محیط اجرا گره خورده
 * و بین محیطها (سرور/بیلد) ناسازگار است؛ الگوی پروژه «عدد en-US + faNum»
 * است که در همهٔ محیطها یکسان رندر میشود.
 */
const faAmount = (n: number): string =>
  faNum(Math.round(Number(n) || 0).toLocaleString('en-US'));

/**
 * برچسبِ «نمایش N از M» برای گزارش‌های فهرستیِ صفحه‌بندی‌شده.
 *
 * چرا لازم است؟ جمع‌ها/درصدها روی کلِ مجموعه محاسبه می‌شوند، اما کاربر فقط
 * یک صفحه می‌بیند؛ بدون این برچسب، عددِ جمع با تعدادِ ردیف‌های دیده‌شده
 * ناسازگار به نظر می‌رسد (fix d).
 */
const pagedNote = (r: ReportResult): string =>
  r.rows.length < r.total ? ` — نمایش ${faAmount(r.rows.length)} از ${faAmount(r.total)}` : '';

export const CARDS = [
  // ── B) فروش مالی ──
  { kind: 'sales-report', icon: '🧾', title: 'فروش مالی (خدمات آموزشی)' },
  // ── C) سود و زیان / بهای تمام‌شده / بودجه ──
  { kind: 'income-statement', icon: '📈', title: 'صورت سود و زیان' },
  { kind: 'costing-report', icon: '🧮', title: 'بهای تمام‌شده و حاشیه' },
  { kind: 'budget-variance', icon: '🎯', title: 'انحراف بودجه' },
  // ── D) ترکیب مطالبات/تعهدات ──
  // عنوان عمداً «ترازنامه» نیست: این پایگاه‌داده حسابِ نقد/بانک/داراییِ ثابت/
  // سرمایه ندارد، پس ترازِ حسابداری (دارایی = بدهی + حقوق) قابل تولید نیست.
  { kind: 'balance-sheet', icon: '⚖️', title: 'ترکیب مطالبات و تعهدات (گزارش کمکی)' },
  // ── E) نقدینگی ──
  { kind: 'cash-flow', icon: '💧', title: 'صورت جریان نقدی (دریافت و پرداخت)' },
  // ── F) پیمانکاری ──
  { kind: 'contractor-report', icon: '🏗️', title: 'گزارش پیمانکاران و قراردادها' },
  { kind: 'contractor-settlement', icon: '🧮', title: 'ماه‌حساب پیمانکاران' },
  // ── G) بیمه / حقوقی / مالیات ──
  { kind: 'insurance-report', icon: '🛡️', title: 'بیمه و کسورات حق‌التدریس' },
  { kind: 'legal-report', icon: '⚖️', title: 'پرونده‌های حقوقی' },
  { kind: 'vat-report', icon: '🏷️', title: 'مالیات بر ارزش افزوده' },
  // ── H) روزانه / کالا / هزینه / تخصیص ──
  { kind: 'general-ledger', icon: '📚', title: 'ریز دفتر کل' },
  { kind: 'daily-journal', icon: '📅', title: 'دفتر روزنامه (روزانه)' },
  { kind: 'inventory-report', icon: '📦', title: 'موجودی کالا' },
  { kind: 'company-expenses', icon: '💸', title: 'هزینه‌های شرکت' },
  { kind: 'allocation-report', icon: '🔀', title: 'تخصیص هزینه‌های مشترک' },
  // ── I) سهم / درآمد به تفکیک سلسله‌مراتب ──
  { kind: 'revenue-hierarchy', icon: '🏛️', title: 'درآمد به تفکیک سلسله‌مراتب دانشکده/رشته' },
];

// ── واژگان نوع تراکنش (کانونی — ledger-balance.ts) ──
// فهرست‌ها مشتق می‌شوند تا هیچ نوعی (CREDIT، زیرنوع‌های بیتس، POS_REFUND) جا نیفتد.
const CHARGE_TYPES = ledgerTypesCsv(DEBT_LEDGER_TYPES);
const DISC_TYPES = ledgerTypesCsv(DISCOUNT_LEDGER_TYPES);
const PAY_TYPES = ledgerTypesCsv(PAID_LEDGER_TYPES.filter((t) => t !== 'LOAN' && t !== 'SPONSORSHIP' && t !== 'CREDIT'));
const SPON_TYPES = ledgerTypesCsv(['SPONSORSHIP']);
const LOAN_TYPES = ledgerTypesCsv(['LOAN']);
const CREDIT_TYPES = ledgerTypesCsv(['CREDIT']);

/**
 * نقشهٔ صریحِ «نوع تراکنش → سبدِ صورت مالی».
 *
 * منبعِ واژگان: `src/lib/ledger-balance.ts` = همان ۲۰ نوعِ مجازِ
 * `ck_student_ledger_txn_type` (DB). هیچ نوعی نباید بی‌صدا حذف شود؛ هر نوعی که
 * در سبدهای زیر نباشد در سبدِ «سایر/طبقه‌بندی‌نشده» ظاهر می‌شود و شمارش و
 * مبلغش در `unmappedTxnTypes()` گزارش می‌شود.
 *
 * | نوع | سبدِ صورت‌ها |
 * |---|---|
 * | TUITION_FIXED / TUITION_VARIABLE / TUITION_CHARGE / CHARGE / SUBJECT_ADDITIVE | شهریهٔ بدهکار (غیرنقدی) |
 * | TUITION_ADJUST_DEC | تعدیل کاهشیِ شهریه (بدهکار، غیرنقدی) |
 * | POS_REFUND | **خروج نقد**: برگشت وجه به دانشجو |
 * | DISCOUNT_FIXED / DISCOUNT_VARIABLE / SUBJECT_DEDUCTIVE | تخفیف (غیرنقدی) |
 * | TUITION_BATES + TUITION_BATES_FIXED/VARIABLE/AMOUNT | تخفیف/اعتبارِ بیتس (غیرنقدی) |
 * | TUITION_ADJUST_INC | تعدیل افزایشی (تخفیف، غیرنقدی) |
 * | PAYMENT / POS_PAYMENT | **ورود نقد**: شهریه |
 * | CREDIT | **ورود نقد**: پرداختیِ دادهٔ مهاجرت |
 * | SPONSORSHIP | **ورود نقد**: پوشش بنیاد/خیرین |
 * | LOAN | **ورود نقد**: وامِ تأمین‌شده برای شهریه |
 *
 * نکته: LOAN در `PAID_LEDGER_TYPES` است (کاهش بدهیِ دانشجو) و واژگان هیچ نوعِ
 * جداگانه‌ای برای «بازپرداخت وام» ندارد؛ بنابراین بازپرداخت در دفتر ثبت نمی‌شود
 * و در گزارش‌ها به‌عنوان صفر/بدون‌طبقه نمایش داده می‌شود، نه اختراعِ نوعِ تازه.
 */
const TUITION_RECEIPT_TYPES = ['PAYMENT', 'POS_PAYMENT', 'CREDIT'] as const;
const REFUND_OUTFLOW_TYPES = ['POS_REFUND'] as const;
/** سبدهای نقدی — بقیهٔ انواعِ بدهکار/تخفیف عمداً «غیرنقدی» هستند. */
const NONCASH_CHARGE_TYPES = DEBT_LEDGER_TYPES.filter((t) => t !== 'POS_REFUND');

const TUITION_RECEIPT_CSV = ledgerTypesCsv(TUITION_RECEIPT_TYPES);
const REFUND_OUTFLOW_CSV = ledgerTypesCsv(REFUND_OUTFLOW_TYPES);

/** همهٔ انواعِ شناخته‌شده — مبنای تشخیصِ «طبقه‌بندی‌نشده» (بدون تکرار). */
const ALL_KNOWN_TXN_TYPES = [
  ...new Set<string>([
    ...DEBT_LEDGER_TYPES,
    ...DISCOUNT_LEDGER_TYPES,
    ...PAID_LEDGER_TYPES,
  ]),
];
const ALL_KNOWN_TXN_CSV = ledgerTypesCsv(ALL_KNOWN_TXN_TYPES);

const isCharge = sql.raw(`sl."transactionType" IN (${CHARGE_TYPES})`);
const isDisc = sql.raw(`sl."transactionType" IN (${DISC_TYPES})`);
const isSpon = sql.raw(`sl."transactionType" IN (${SPON_TYPES})`);
/** دریافتِ واقعی = پرداخت/کارت‌خوان + بستانکاریِ دادهٔ مهاجرت */
const isReceived = sql.raw(`sl."transactionType" IN (${PAY_TYPES},${CREDIT_TYPES})`);
/** نوعی که در واژگانِ کانونی نیست (یا NULL است) — باید «سایر» شود، نه حذف. */
const isUnmapped = sql.raw(
  `(sl."transactionType" IS NULL OR sl."transactionType" NOT IN (${ALL_KNOWN_TXN_CSV}))`,
);
/** طرفِ بستانکارِ دفتر = تخفیف‌ها + پرداخت‌ها (همان تعریفِ CREDIT_LEDGER_TYPES). */
const STATEMENT_CREDIT_TYPES = ledgerTypesCsv([
  ...DISCOUNT_LEDGER_TYPES,
  ...PAID_LEDGER_TYPES,
]);
const isStatementCredit = sql.raw(`sl."transactionType" IN (${STATEMENT_CREDIT_TYPES})`);
/** طرفِ حسابِ هر ردیف — یک CASE انحصاری با سبدِ سوم برای انواعِ ناشناخته. */
const LEDGER_SIDE_EXPR = sql`CASE
  WHEN ${isCharge} THEN 'بدهکار (بدهی دانشجو)'
  WHEN ${isStatementCredit} THEN 'بستانکار (کاهش بدهی)'
  ELSE 'طبقه‌بندی‌نشده (خارج از واژگان)'
END`;

/**
 * سبدِ نقدیِ هر ردیف — **یک** CASE با ترتیبِ انحصاری، تا هر ردیف دقیقاً در یک
 * سبد بیفتد. سبدهای بدهکار/تخفیف عمداً «غیرنقدی» هستند و در جمع دریافت/پرداخت
 * نمی‌آیند (فقط در یادداشتِ صورت نمایش داده می‌شوند).
 */
const CASH_BUCKET = sql.raw(`CASE
  WHEN sl."transactionType" IN (${TUITION_RECEIPT_CSV}) THEN 'TUITION'
  WHEN sl."transactionType" = 'SPONSORSHIP' THEN 'SPONSOR'
  WHEN sl."transactionType" = 'LOAN' THEN 'LOAN'
  WHEN sl."transactionType" IN (${REFUND_OUTFLOW_CSV}) THEN 'REFUND'
  WHEN sl."transactionType" IN (${ledgerTypesCsv(NONCASH_CHARGE_TYPES)}) THEN 'NONCASH_CHARGE'
  WHEN sl."transactionType" IN (${DISC_TYPES}) THEN 'NONCASH_DISCOUNT'
  ELSE 'OTHER'
END`);

/**
 * عبارتِ «نوع تراکنش» برای یک نامِ مستعارِ دلخواه.
 *
 * ⚠ نامِ مستعار همیشه از کدِ همین ماژول می‌آید (نه از ورودی کاربر) ⇒
 * امکان تزریق SQL وجود ندارد. لازم است چون در CTEها نامِ مستعار عوض می‌شود
 * (`sl` در دفتر خام، `led` در خروجیِ آن) و یک عبارتِ ثابت جواب نمی‌دهد.
 */
const txType = (alias: string, list: string) =>
  sql.raw(`"${alias}"."transactionType" IN (${list})`);

/**
 * CTE پایه: دفتر مالی با «سقفِ تخفیف» در سطح (دانشجو × ترم).
 *
 * چرا پنجره (window)؟ چون سقف باید **برای هر دانشجو در هر ترم** جدا اعمال
 * شود و بعد جمع گرفته شود. اگر مستقیم روی کلِ ترم `LEAST` بگذاریم،
 * تخفیفِ یک دانشجو می‌تواند شهریهٔ دانشجوی دیگر را خنثی کند — که همان
 * اشتباهی است که در کارنامهٔ تک‌دانشجویی هم رخ می‌داد.
 */
function ledgerCte(uni: number, termCode?: string) {
  const termFilter = termCode
    ? sql`AND sl."termId" = (SELECT id FROM academic_terms WHERE "termCode" = ${termCode} LIMIT 1)`
    : sql``;
  return sql`WITH led AS (
    SELECT
      sl."studentId", sl."termId", sl."transactionType", sl.amount,
      COALESCE(sl."depositDate", sl."createdAt") AS paid_at,
      sl."depositType",
      SUM(CASE WHEN ${isCharge} THEN sl.amount ELSE 0 END)
        OVER (PARTITION BY sl."studentId", sl."termId") AS t_charges,
      SUM(CASE WHEN ${isDisc} THEN sl.amount ELSE 0 END)
        OVER (PARTITION BY sl."studentId", sl."termId") AS t_discs
    FROM student_ledger sl
    WHERE sl."universityId" = ${uni} ${termFilter}
  )`;
}

/** شرطِ دانشگاه + ترم روی جدولِ student_ledger */
function ledgerConds(f: ReportFilters, alias = 'sl') {
  const a = sql.identifier(alias);
  const c = [sql`${a}."universityId" = ${f.universityId}`];
  if (f.term) {
    c.push(sql`${a}."termId" = (SELECT id FROM academic_terms WHERE "termCode" = ${f.term} LIMIT 1)`);
  }
  return c;
}

/**
 * انواعِ تراکنشی که در واژگانِ کانونی نیستند — با تعداد و جمعِ مبلغ.
 *
 * چرا لازم است؟ اگر دادهٔ مهاجرت/قدیمی نوعی خارج از ۲۰ نوعِ مجاز داشته باشد،
 * جمع‌های SQL (که با `IN (...)` فیلتر می‌شوند) آن را بی‌صدا دور می‌ریزند و
 * «صورت» تراز نمی‌شود. این تابع همان ردیف‌ها را برای نمایش در سبدِ «سایر»
 * برمی‌گرداند؛ هیچ مبلغی حذف نمی‌شود.
 */
async function unmappedTxnTypes(uni: number, f: ReportFilters) {
  const termFilter = f.term
    ? sql`AND sl."termId" = (SELECT id FROM academic_terms WHERE "termCode" = ${f.term} LIMIT 1)`
    : sql``;
  const data = await db.execute<{ type: string | null; cnt: string; amount: string }>(sql`
    SELECT COALESCE(sl."transactionType", '—') AS type,
      COUNT(*)::int AS cnt,
      COALESCE(SUM(sl.amount), 0)::text AS amount
    FROM student_ledger sl
    WHERE sl."universityId" = ${uni} ${termFilter}
      AND ${isUnmapped}
    GROUP BY 1
    ORDER BY 3 DESC, 1
  `).catch((e: unknown) => { console.error('[finance-statements] query failed', e); throw e; });
  return data.rows.map((r) => ({
    type: String(r.type ?? '—'),
    count: R(r.cnt),
    amount: R(r.amount),
  }));
}

/** ساختِ خروجیِ یک گزارشِ «صورت» (سطرهای قلم/مبلغ) */
function statement(
  title: string,
  rows: { label: string; value: number; kind?: 'HEAD' | 'ITEM' | 'TOTAL'; note?: string }[],
  summary?: string,
): ReportResult {
  return {
    columns: [
      { key: 'label', title: 'قلم' },
      { key: 'value', title: 'مبلغ (ریال)', format: 'MONEY' },
      { key: 'kind', title: 'نوع' },
      { key: 'note', title: 'توضیح' },
    ],
    rows: rows.map((r) => ({
      label: r.label,
      value: r.value,
      // «نوع» همیشه فارسی است — کد خام (HEAD/ITEM/TOTAL) به خروجی نمیرود
      kind: STATEMENT_KIND_FA[r.kind ?? 'ITEM'] ?? STATEMENT_KIND_FA.ITEM,
      note: r.note ?? '',
    })),
    total: rows.length,
    page: 1,
    per: PER,
    totalPages: 1,
    summary: summary ?? title,
  };
}

// ══════════════════════════════════════════════════════════════════════

export async function run(kind: string, f: ReportFilters): Promise<ReportResult | null> {
  await requireRole(ROLES);
  const uni = Number(f.universityId);

  // ══════════════════════════════════════════════════════════════════
  //  B) فروش مالی — صورت‌حساب کالا/خدمات (شهریه به‌عنوان «فروش خدمات»)
  // ══════════════════════════════════════════════════════════════════
  if (kind === 'sales-report') {
    const from = sql`FROM students s
      JOIN users u ON u.id = s."userId"
      LEFT JOIN majors m ON m.id = s."majorId"
      LEFT JOIN faculties fc ON fc.id = m."facultyId"
      LEFT JOIN student_ledger sl ON sl."studentId" = s.id
      ${f.term ? sql`AND sl."termId" = (SELECT id FROM academic_terms WHERE "termCode" = ${f.term} LIMIT 1)` : sql``}`;
    const conds = [
      sql`s."universityId" = ${uni}`,
      ...(studentCodeCond(f) ? [studentCodeCond(f)!] : []),
      ...(f.facultyId ? [sql`fc.id = ${f.facultyId}`] : []),
      ...(f.majorId ? [sql`m.id = ${f.majorId}`] : []),
      ...(f.degreeId
        ? [sql`s."degreeLevelId" IN (SELECT id FROM degree_level_configs WHERE title = (SELECT title FROM degree_level_configs WHERE id = ${f.degreeId}))`]
        : []),
    ];
    const cols = sql`COALESCE(at."termCode", '—') AS term,
      COALESCE(fc.name, 'بدون دانشکده') AS faculty,
      COALESCE(m.name, '—') AS major,
      COUNT(DISTINCT s.id) AS students,
      COALESCE(SUM(sl.amount) FILTER (WHERE ${isCharge}), 0)::bigint AS gross,
      COALESCE(SUM(sl.amount) FILTER (WHERE ${isDisc}), 0)::bigint AS discount,
      COALESCE(SUM(sl.amount) FILTER (WHERE ${isSpon}), 0)::bigint AS sponsor,
      COALESCE(SUM(sl.amount) FILTER (WHERE ${isReceived}), 0)::bigint AS received`;
    const r = await runPaged(
      [
        { key: 'term', title: 'نیمسال' },
        { key: 'faculty', title: 'دانشکده' },
        { key: 'major', title: 'رشته' },
        { key: 'students', title: 'دانشجو', format: 'NUMBER' },
        { key: 'gross', title: 'فروش ناخالص', format: 'MONEY' },
        { key: 'discount', title: 'تخفیف', format: 'MONEY' },
        { key: 'net', title: 'فروش خالص', format: 'MONEY' },
        { key: 'sponsor', title: 'پوشش بنیاد/خیرین', format: 'MONEY' },
        { key: 'received', title: 'دریافت‌شده', format: 'MONEY' },
        { key: 'avg', title: 'سرانهٔ فروش خالص', format: 'MONEY' },
      ],
      sql`${from}
        LEFT JOIN academic_terms at ON at.id = sl."termId"`,
      conds,
      cols,
      sql`ORDER BY at."sortOrder" NULLS LAST, fc.name, m.name`,
      f,
      // GROUP BY فروش: گروه‌بندی با کلیدهای اصلی (at/fc/m) — وابستگی تابعیِ PK
      // اجازهٔ SELECTِ COALESCEها و ORDER BY روی ستونهای خام را میدهد. نبودِ
      // این پارامتر خطای «column "at.termCode" must appear in the GROUP BY»
      // و بنر سرخ React #441 در مرورگر میداد.
      sql`at."id", fc."id", m."id"`,
    );
    r.rows = r.rows.map((x) => {
      const gross = R(x.gross);
      const discount = R(x.discount);
      const students = R(x.students) || 1;
      return {
        ...x,
        net: gross - discount,
        avg: Math.round((gross - discount) / students),
      };
    });
    r.summary = 'فروش خالص = فروش ناخالص − تخفیف‌ها (به ریال)' + pagedNote(r);
    return r;
  }

  // ══════════════════════════════════════════════════════════════════
  //  C-1) صورت سود و زیان
  // ══════════════════════════════════════════════════════════════════
  if (kind === 'income-statement') {
    const periods = await ledgerPeriods(uni, f);
    const payroll = await payrollByTerm(uni, f);
    const otherExp = await expenseByTerm(uni, f);

    const rows: ReportResult['rows'] = [];
    let sumRev = 0;
    let sumCost = 0;

    for (const p of periods) {
      const st = buildIncomeStatement({
        period: p.label,
        tuitionGross: p.gross,
        discountTotal: p.discount,
        sponsorshipIncome: p.sponsor,
        otherIncome: p.other,
        teachingCost: payroll.get(p.key) ?? 0,
        payrollDeductions: 0,
        otherExpenses: otherExp.get(p.key) ?? 0,
      });
      sumRev += st.revenue.total;
      sumCost += st.costs.total;

      rows.push(
        { label: `── ${p.label} ──`, value: 0, kind: 'HEAD', note: '' },
        { label: 'فروش خدمات آموزشی (ناخالص)', value: st.revenue.tuitionGross, kind: 'ITEM', note: '' },
        { label: 'کسر: تخفیف‌ها', value: -st.revenue.discount, kind: 'ITEM', note: '' },
        { label: 'فروش خالص', value: st.revenue.tuitionNet, kind: 'ITEM', note: 'جمع دو ردیف بالا' },
        { label: 'درآمد پوشش بنیاد/خیرین', value: st.revenue.sponsorship, kind: 'ITEM', note: '' },
        { label: 'سایر درآمد', value: st.revenue.other, kind: 'ITEM', note: 'بستانکاری و سایر واریزها' },
        { label: 'جمع درآمدها', value: st.revenue.total, kind: 'TOTAL', note: '' },
        { label: 'هزینهٔ حق‌التدریس', value: -st.costs.teaching, kind: 'ITEM', note: '' },
        { label: 'سایر هزینه‌ها (شرکت/پیمانکاری)', value: -st.costs.other, kind: 'ITEM', note: '' },
        { label: 'جمع هزینه‌ها', value: -st.costs.total, kind: 'TOTAL', note: '' },
        {
          label: st.operatingResult >= 0 ? 'سود عملیاتی' : 'زیان عملیاتی',
          value: st.operatingResult,
          kind: 'TOTAL',
          note: 'درآمد − هزینه',
        },
      );
    }

    rows.push(
      { label: '══ جمع کل دوره ══', value: 0, kind: 'HEAD', note: '' },
      { label: 'جمع درآمدها', value: sumRev, kind: 'TOTAL', note: '' },
      { label: 'جمع هزینه‌ها', value: -sumCost, kind: 'TOTAL', note: '' },
      { label: sumRev - sumCost >= 0 ? 'سود خالص دوره' : 'زیان خالص دوره', value: sumRev - sumCost, kind: 'TOTAL', note: '' },
    );

    return statement('صورت سود و زیان', rows as never, `درآمد: ${faAmount(sumRev)} — هزینه: ${faAmount(sumCost)} ریال`);
  }

  // ══════════════════════════════════════════════════════════════════
  //  C-2) بهای تمام‌شده و حاشیه
  // ══════════════════════════════════════════════════════════════════
  if (kind === 'costing-report') {
    const periods = await ledgerPeriods(uni, f);
    const payroll = await payrollByTerm(uni, f);
    const alloc = await allocationPoolByTerm(uni, f);
    const units = await unitsByTerm(uni, f);

    const rows: ReportResult['rows'] = [];
    for (const p of periods) {
      const c = buildCosting({
        period: p.label,
        revenue: p.gross - p.discount,
        directCost: payroll.get(p.key) ?? 0,
        allocatedCost: alloc.get(p.key) ?? 0,
        units: units.get(p.key) ?? 0,
        students: p.students,
      });
      rows.push(
        { label: `── ${p.label} ──`, value: 0, kind: 'HEAD', note: '' },
        { label: 'درآمد خالص آموزشی', value: c.revenue, kind: 'ITEM', note: '' },
        { label: 'بهای مستقیم (حق‌التدریس)', value: c.directCost, kind: 'ITEM', note: '' },
        { label: 'هزینهٔ تخصیص‌یافته (سربار)', value: c.allocatedCost, kind: 'ITEM', note: '' },
        { label: 'بهای تمام‌شده', value: c.totalCost, kind: 'TOTAL', note: '' },
        { label: 'حاشیهٔ ناخالص', value: c.grossMargin, kind: 'TOTAL', note: c.grossMarginPercent === null ? '' : `${c.grossMarginPercent.toFixed(1)}٪` },
        { label: 'بهای هر واحد (ریال)', value: Math.round(c.costPerUnit ?? 0), kind: 'ITEM', note: `${faAmount(c.units)} واحد` },
        { label: 'درآمد هر واحد (ریال)', value: Math.round(c.revenuePerUnit ?? 0), kind: 'ITEM', note: '' },
        { label: 'بهای هر دانشجو (ریال)', value: Math.round(c.costPerStudent ?? 0), kind: 'ITEM', note: `${faAmount(c.students)} دانشجو` },
      );
    }
    return statement('بهای تمام‌شده و حاشیه', rows as never, 'بهای تمام‌شده = حق‌التدریس + هزینهٔ تخصیص‌یافته');
  }

  // ══════════════════════════════════════════════════════════════════
  //  C-3) انحراف بودجه (نیازمند جدول financial_budgets)
  // ══════════════════════════════════════════════════════════════════
  if (kind === 'budget-variance') {
    const data = await db.execute<{
      line: string; category: string; direction: string; budget: string; actual: string; period: string;
    }>(sql`
      SELECT b."lineItem" AS line, b.category, b.direction, b.amount::text AS budget,
             b."termCode" AS period, COALESCE(a.actual, 0)::text AS actual
      FROM financial_budgets b
      LEFT JOIN LATERAL (
        SELECT
          CASE WHEN b.direction = 'REVENUE' THEN
            COALESCE((SELECT SUM(sl.amount) FROM student_ledger sl
              WHERE sl."universityId" = b."universityId"
                AND ${isCharge}
                AND (b."termCode" IS NULL OR sl."termId" = (SELECT id FROM academic_terms WHERE "termCode" = b."termCode" LIMIT 1))), 0)
          ELSE
            COALESCE((SELECT SUM(ps."grossAmount") FROM payroll_statements ps
              JOIN professor_term_contracts c ON c.id = ps."contractId"
              WHERE ps."universityId" = b."universityId"
                AND (b."termCode" IS NULL OR c."termId" = (SELECT id FROM academic_terms WHERE "termCode" = b."termCode" LIMIT 1))), 0)
          END AS actual
      ) a ON TRUE
      WHERE b."universityId" = ${uni}
      ${f.term ? sql`AND (b."termCode" IS NULL OR b."termCode" = ${f.term})` : sql``}
      ORDER BY b.category, b."lineItem"
    `);

    const rows: ReportResult['rows'] = [];
    for (const d of data.rows) {
      const v = buildBudgetVariance({
        line: d.line,
        budget: R(d.budget),
        actual: R(d.actual),
        direction: d.direction === 'REVENUE' ? 'REVENUE' : 'EXPENSE',
      });
      rows.push({
        label: `${d.category} — ${d.line}`,
        value: v.variance,
        kind: 'ITEM',
        note: `بودجه ${faAmount(v.budget)} · واقعی ${faAmount(v.actual)} · ${
          v.variancePercent === null ? '—' : `${v.variancePercent.toFixed(1)}٪`
        } · ${
          v.status === 'UNDER' ? 'کمتر از بودجه' : v.status === 'OVER' ? 'بیشتر از بودجه' : 'مطابق بودجه'
        }`,
      });
    }
    if (!rows.length) {
      return statement('انحراف بودجه', [{
        label: 'بودجه‌ای ثبت نشده است',
        value: 0,
        kind: 'ITEM',
        note: 'برای محاسبهٔ انحراف، ردیف بودجه (مبلغ مصوب، دوره و جهت) ثبت کنید.',
      }]);
    }
    return statement('انحراف بودجه', rows as never);
  }

  // ══════════════════════════════════════════════════════════════════
  //  D) ترکیب مطالبات و تعهدات (ترازنامهٔ صادق)
  // ══════════════════════════════════════════════════════════════════
  if (kind === 'balance-sheet') {
    const b = await balanceSheetData(uni, f);
    const bs = buildBalanceSheet(b);
    const unmapped = await unmappedTxnTypes(uni, f);
    const netBook = bs.assets.receivables - bs.liabilities.studentPayables;
    const rows: ReportResult['rows'] = [
      { label: '── مطالبات ──', value: 0, kind: 'HEAD', note: '' },
      { label: 'مطالبات از دانشجویان (ماندهٔ بدهی)', value: bs.assets.receivables, kind: 'ITEM', note: 'جمعِ ماندهٔ مثبتِ هر دانشجو در دفتر' },
      { label: 'جمع مطالبات', value: bs.assets.receivables, kind: 'TOTAL', note: '' },
      { label: '── وام‌ها (اطلاعاتی) ──', value: 0, kind: 'HEAD', note: '' },
      { label: 'وامِ ثبت‌شده در دفتر دانشجو (کل)', value: bs.assets.loansReceivable, kind: 'ITEM', note: 'نوع LOAN — در ماندهٔ دانشجو لحاظ شده، نه داراییِ جدا' },
      { label: 'بازپرداخت وام', value: 0, kind: 'ITEM', note: 'واژگان دفتر نوعِ بازپرداخت وام ندارد؛ بازپرداخت در این schema ثبت نمی‌شود' },
      { label: '── تعهدات ──', value: 0, kind: 'HEAD', note: '' },
      { label: 'بستانکاری دانشجویان (ماندهٔ اعتبار)', value: bs.liabilities.studentPayables, kind: 'ITEM', note: 'جمعِ ماندهٔ منفیِ هر دانشجو' },
      { label: 'تعهداتِ حق‌التدریسِ پرداخت‌نشده', value: bs.liabilities.payrollPayable, kind: 'ITEM', note: '' },
      { label: 'بدهی به پیمانکاران/تأمین‌کنندگان', value: bs.liabilities.supplierPayable, kind: 'ITEM', note: '' },
      { label: 'جمع تعهدات', value: bs.liabilities.total, kind: 'TOTAL', note: '' },
      { label: '── یادآوری ──', value: 0, kind: 'HEAD', note: '' },
      { label: 'ماندهٔ خالص دفتری (مطالبات − بستانکاری دانشجو)', value: netBook, kind: 'TOTAL', note: 'برابر با جمعِ خالصِ ردیف‌های دفتر؛ نه یک معادلهٔ ترازنامه' },
      { label: 'سود/زیان عملیاتیِ انباشته (یادآوری)', value: bs.equity.retainedSurplus, kind: 'ITEM', note: 'درآمد − هزینهٔ ثبت‌شده؛ جزءِ حقوق/سرمایهٔ حسابداری نیست' },
    ];
    if (unmapped.length) {
      rows.push({ label: '── سایر (طبقه‌بندی‌نشده) ──', value: 0, kind: 'HEAD', note: 'خارج از واژگان کانونیِ دفتر' });
      for (const u of unmapped) {
        rows.push({
          label: 'سایر (طبقه‌بندی‌نشده)',
          value: u.amount,
          kind: 'ITEM',
          note: `کد نوع: ${u.type} · ${faAmount(u.count)} ردیف — در هیچ سبدِ نام‌دارِ صورت نیامده است`,
        });
      }
    }
    // «پیش‌دریافت بابتِ نیمسال‌های آینده» حذف شد: مقدارش همیشه صفرِ هاردکد
    // بود (پایگاه داده مفهوم deferred را ثبت نمیکند) و ردیفِ همیشه‌صفر فقط
    // ترازنامه را شلوغ میکرد. جمع بدهی‌ها در lib با deferredRevenue=0 دقیق میماند.
    // ⚠ عمداً ردیفِ «اختلاف تراز» چاپ نمی‌شود. `difference` در lib از
    //   دارایی − بدهی − حقوق ساخته می‌شد، اما schema حساب‌های نقد/بانک/
    //   داراییِ ثابت/سرمایه را ندارد؛ عددِ حاصل یک «اختلاف» واقعی نبود و
    //   کاربر را به اشتباه می‌انداخت. اجزای واقعی + یادداشتِ صادق جای آن را
    //   گرفته‌اند.
    return statement(
      'ترکیب مطالبات و تعهدات',
      rows as never,
      `تا پایان ${b.period} — این گزارش ترازنامهٔ حسابداری نیست: schema فقط دفتر یک‌طرفهٔ دانشجو دارد `
        + '(بدون حساب نقد/بانک، دارایی ثابت و سرمایه)؛ بنابراین «دارایی = بدهی + حقوق» قابل محاسبه نیست.',
    );
  }

  // ══════════════════════════════════════════════════════════════════
  //  E) صورت جریان نقدی (نقدینگی)
  // ══════════════════════════════════════════════════════════════════
  if (kind === 'cash-flow') {
    const { rows, unmapped } = await cashFlowRows(uni, f);
    if (!rows.length) {
      return statement('صورت جریان نقدی', [{
        label: 'گردش نقدی ثبت نشده است',
        value: 0,
        kind: 'ITEM',
        note: 'واریزها باید تاریخِ واریز (depositDate) داشته باشند.',
      }]);
    }
    const unmappedNote = unmapped.length
      ? ` — ${faAmount(unmapped.length)} نوعِ خارج از واژگان (${unmapped
          .slice(0, 5)
          .map((u) => u.type)
          .join('، ')}${unmapped.length > 5 ? '، …' : ''}) در «سایر دریافت‌های طبقه‌بندی‌نشده» آمده است.`
      : '';
    return statement(
      'صورت جریان نقدی',
      rows as never,
      'بر پایهٔ تاریخِ واقعیِ دریافت/پرداخت؛ اقلام غیرنقدی (شهریه و تخفیف) در گردش نقد نیامده‌اند' + unmappedNote,
    );
  }

  // ══════════════════════════════════════════════════════════════════
  //  F-1) گزارش پیمانکاران و قراردادها
  // ══════════════════════════════════════════════════════════════════
  if (kind === 'contractor-report') {
    const r = await runPaged(
      [
        { key: 'name', title: 'پیمانکار' },
        { key: 'contractNo', title: 'شمارهٔ قرارداد' },
        { key: 'subject', title: 'موضوع' },
        { key: 'term', title: 'نیمسال' },
        { key: 'signedAt', title: 'تاریخ عقد', format: 'DATE' },
        { key: 'amount', title: 'مبلغ قرارداد', format: 'MONEY' },
        { key: 'paid', title: 'پرداخت‌شده', format: 'MONEY' },
        { key: 'balance', title: 'مانده', format: 'MONEY' },
        { key: 'status', title: 'وضعیت' },
      ],
      sql`FROM financial_contracts c
        LEFT JOIN financial_contractors pc ON pc.id = c."contractorId"
        LEFT JOIN academic_terms at ON at.id = c."termId"`,
      [
        sql`c."universityId" = ${uni}`,
        ...(f.term ? [sql`(c."termId" IS NULL OR at."termCode" = ${f.term})`] : []),
        ...(f.q ? [sql`pc.name ILIKE ${'%' + escapeLikeChars(String(f.q)) + '%'} ESCAPE '\\'`] : []),
      ],
      sql`pc.name, c."contractNo", c.subject, at."termCode" AS term, c."signedAt",
        c.amount, COALESCE(c."paidAmount", 0)::bigint AS paid,
        (c.amount - COALESCE(c."paidAmount", 0))::bigint AS balance, c.status`,
      sql`ORDER BY c."signedAt" DESC NULLS LAST, pc.name`,
      f,
    );
    // وضعیتِ خام انگلیسی (DRAFT/ACTIVE/SETTLED/TERMINATED) فارسی میشود
    r.rows = r.rows.map((x) => ({ ...x, status: faEnum(CONTRACT_STATUS_FA, x.status) }));
    r.summary = 'مانده = مبلغ قرارداد − پرداخت‌شده' + pagedNote(r);
    return r;
  }

  // ══════════════════════════════════════════════════════════════════
  //  F-2) ماه‌حساب پیمانکاران
  // ══════════════════════════════════════════════════════════════════
  if (kind === 'contractor-settlement') {
    const r = await runPaged(
      [
        { key: 'name', title: 'پیمانکار' },
        { key: 'invoiceNo', title: 'شمارهٔ صورتحساب' },
        { key: 'date', title: 'تاریخ', format: 'DATE' },
        { key: 'term', title: 'نیمسال' },
        { key: 'gross', title: 'مبلغ ناخالص', format: 'MONEY' },
        { key: 'vat', title: 'مالیات ارزش افزوده', format: 'MONEY' },
        { key: 'net', title: 'قابل پرداخت', format: 'MONEY' },
        { key: 'paid', title: 'پرداخت‌شده', format: 'MONEY' },
        { key: 'balance', title: 'مانده', format: 'MONEY' },
      ],
      sql`FROM financial_contract_invoices i
        JOIN financial_contracts c ON c.id = i."contractId"
        LEFT JOIN financial_contractors pc ON pc.id = c."contractorId"
        LEFT JOIN academic_terms at ON at.id = c."termId"`,
      [
        sql`i."universityId" = ${uni}`,
        ...(f.term ? [sql`(c."termId" IS NULL OR at."termCode" = ${f.term})`] : []),
      ],
      sql`pc.name, i."invoiceNo", i."invoiceDate" AS date, at."termCode" AS term,
        i."grossAmount" AS gross, COALESCE(i."vatAmount", 0)::bigint AS vat,
        (i."grossAmount" + COALESCE(i."vatAmount", 0))::bigint AS net,
        COALESCE(i."paidAmount", 0)::bigint AS paid,
        (i."grossAmount" + COALESCE(i."vatAmount", 0) - COALESCE(i."paidAmount", 0))::bigint AS balance`,
      sql`ORDER BY i."invoiceDate" DESC NULLS LAST`,
      f,
    );
    r.summary = 'ماه‌حساب = صورتحساب − پرداخت‌شده (با احتساب مالیات ارزش افزوده)' + pagedNote(r);
    return r;
  }

  // ══════════════════════════════════════════════════════════════════
  //  G-1) بیمه و کسورات حق‌التدریس
  // ══════════════════════════════════════════════════════════════════
  if (kind === 'insurance-report') {
    const r = await runPaged(
      [
        { key: 'term', title: 'نیمسال' },
        { key: 'staff', title: 'استاد' },
        { key: 'gross', title: 'حق‌التدریس ناخالص', format: 'MONEY' },
        { key: 'deductions', title: 'کسورات (بیمه و …)', format: 'MONEY' },
        { key: 'net', title: 'خالص پرداختی', format: 'MONEY' },
        { key: 'status', title: 'وضعیت' },
      ],
      sql`FROM payroll_statements ps
        JOIN professor_term_contracts c ON c.id = ps."contractId"
        JOIN staff st ON st.id = c."staffId"
        JOIN users u ON u.id = st."userId"
        LEFT JOIN academic_terms at ON at.id = c."termId"`,
      [
        sql`ps."universityId" = ${uni}`,
        ...(f.term ? [sql`at."termCode" = ${f.term}`] : []),
      ],
      sql`at."termCode" AS term, u."firstName" || ' ' || u."lastName" AS staff,
        ps."grossAmount" AS gross, ps.deductions, ps."netAmount" AS net, ps.status`,
      sql`ORDER BY at."sortOrder" NULLS LAST, staff`,
      f,
    );
    // وضعیتِ خام انگلیسی (DRAFT/MID_TERM_PAID/…) فارسی میشود
    r.rows = r.rows.map((x) => ({ ...x, status: faEnum(PAYROLL_STATUS_FA, x.status) }));
    r.summary = 'کسورات = بیمهٔ پیش‌پرداخت و کسوراتِ قانونیِ حق‌التدریس' + pagedNote(r);
    return r;
  }

  // ══════════════════════════════════════════════════════════════════
  //  G-2) پرونده‌های حقوقی
  // ══════════════════════════════════════════════════════════════════
  if (kind === 'legal-report') {
    const r = await runPaged(
      [
        { key: 'caseNo', title: 'شمارهٔ پرونده' },
        { key: 'subject', title: 'موضوع' },
        { key: 'type', title: 'نوع' },
        { key: 'party', title: 'طرف پرونده' },
        { key: 'status', title: 'وضعیت' },
        { key: 'amount', title: 'مبلغ', format: 'MONEY' },
        { key: 'openedAt', title: 'تاریخ ثبت', format: 'DATE' },
        { key: 'closedAt', title: 'تاریخ خاتمه', format: 'DATE' },
      ],
      sql`FROM legal_cases lc`,
      [
        sql`lc."universityId" = ${uni}`,
        ...(f.q ? [sql`lc.subject ILIKE ${'%' + escapeLikeChars(String(f.q)) + '%'} ESCAPE '\\'`] : []),
      ],
      sql`lc."caseNo", lc.subject, lc."caseType" AS type, lc."partyName" AS party,
        lc.status, lc.amount, lc."openedAt", lc."closedAt"`,
      sql`ORDER BY lc."openedAt" DESC NULLS LAST`,
      f,
    );
    // وضعیتِ خام انگلیسی (OPEN/IN_PROGRESS/CLOSED/SUSPENDED) فارسی میشود؛
    // «نوع» (caseType) متنِ آزاد است و ممکن است از قبل فارسی باشد — دست نمیخورد.
    r.rows = r.rows.map((x) => ({ ...x, status: faEnum(LEGAL_STATUS_FA, x.status) }));
    r.summary = 'پرونده‌های حقوقیِ در جریان و مختومه' + pagedNote(r);
    return r;
  }

  // ══════════════════════════════════════════════════════════════════
  //  G-3) مالیات بر ارزش افزوده
  // ══════════════════════════════════════════════════════════════════
  if (kind === 'vat-report') {
    const r = await runPaged(
      [
        { key: 'source', title: 'منبع' },
        { key: 'docNo', title: 'شمارهٔ سند' },
        { key: 'date', title: 'تاریخ', format: 'DATE' },
        { key: 'term', title: 'نیمسال' },
        { key: 'net', title: 'مبلغ بدون مالیات', format: 'MONEY' },
        { key: 'rate', title: 'نرخ (٪)', format: 'NUMBER' },
        { key: 'vat', title: 'مالیات ارزش افزوده', format: 'MONEY' },
        { key: 'gross', title: 'مبلغ با مالیات', format: 'MONEY' },
      ],
      sql`FROM financial_vat_entries v
        LEFT JOIN academic_terms at ON at.id = v."termId"`,
      [
        sql`v."universityId" = ${uni}`,
        ...(f.term ? [sql`at."termCode" = ${f.term}`] : []),
      ],
      sql`v.source, v."documentNo" AS "docNo", v."entryDate" AS date, at."termCode" AS term,
        v."netAmount" AS net, v.rate, v."vatAmount" AS vat,
        (v."netAmount" + v."vatAmount")::bigint AS gross`,
      sql`ORDER BY v."entryDate" DESC NULLS LAST`,
      f,
    );
    // منبعِ خام انگلیسی (INVOICE/CONTRACT/EXPENSE) فارسی میشود
    r.rows = r.rows.map((x) => ({ ...x, source: faEnum(VAT_SOURCE_FA, x.source) }));
    r.summary = 'مالیات بر ارزش افزودهٔ اسناد (فاکتورها و صورتحساب پیمانکاران)' + pagedNote(r);
    return r;
  }

  // ══════════════════════════════════════════════════════════════════
  //  H-1) ریز دفتر کل
  // ══════════════════════════════════════════════════════════════════
  if (kind === 'general-ledger') {
    const r = await runPaged(
      [
        { key: 'type', title: 'نوع تراکنش' },
        { key: 'side', title: 'طرف حساب' },
        { key: 'count', title: 'تعداد', format: 'NUMBER' },
        { key: 'amount', title: 'مبلغ', format: 'MONEY' },
      ],
      sql`FROM student_ledger sl`,
      ledgerConds(f),
      sql`sl."transactionType" AS type,
        ${LEDGER_SIDE_EXPR} AS side,
        COUNT(*)::int AS count,
        COALESCE(SUM(sl.amount), 0)::bigint AS amount`,
      sql`ORDER BY side, SUM(sl.amount) DESC`,
      f,
      sql`sl."transactionType", ${LEDGER_SIDE_EXPR}`,
    );
    r.rows = r.rows.map((x) => ({ ...x, type: LEDGER_TYPE_FA[String(x.type)] ?? String(x.type) }));
    // برچسب جمعِ پیشتر ناخوانا بود («جمع دو طرف باید برابر باشد (دفتر دوطرفه)»)
    // و شبهه ایجاد میکرد که ستون «تعداد» هم در جمع مبلغ نقش دارد؛ متنِ صریح:
    r.summary = 'جمعِ ستون «مبلغ» در دو طرف باید برابر باشد (ترازِ دفتر دوطرفه) — ستون «تعداد» فقط شمارش ردیفهاست، نه مبلغ.';
    // جمعِ هر طرف از **کلِ مجموعهٔ فیلترشده** (همان WHERE) گرفته می‌شود، نه
    // از ردیف‌های صفحه. دفتر یک‌طرفه است؛ برابریِ دو طرف الزامی نیست و
    // اختلاف همان ماندهٔ دفتری است (fix c/d).
    const gc = await db.execute<{ debit: string; credit: string; other: string }>(sql`
      SELECT
        COALESCE(SUM(sl.amount) FILTER (WHERE ${isCharge}), 0)::text AS debit,
        COALESCE(SUM(sl.amount) FILTER (WHERE ${isStatementCredit}), 0)::text AS credit,
        COALESCE(SUM(sl.amount) FILTER (WHERE NOT (${isCharge}) AND NOT (${isStatementCredit})), 0)::text AS other
      FROM student_ledger sl
      WHERE ${sql.join(ledgerConds(f), sql` AND `)}
    `).catch((e: unknown) => { console.error('[finance-statements] query failed', e); throw e; });
    const debit = R(gc.rows[0]?.debit);
    const credit = R(gc.rows[0]?.credit);
    const other = R(gc.rows[0]?.other);
    r.summary = `جمع بدهکار ${faAmount(debit)} / جمع بستانکار ${faAmount(credit)} — ماندهٔ دفتری `
      + `${faAmount(debit - credit)} ریال (دفتر یک‌طرفه است؛ برابریِ دو طرف الزامی نیست)`
      + (other ? ` · طبقه‌بندی‌نشده: ${faAmount(other)} ریال` : '')
      + pagedNote(r);
    return r;
  }

  // ══════════════════════════════════════════════════════════════════
  //  H-2) دفتر روزنامه روزانه
  // ══════════════════════════════════════════════════════════════════
  if (kind === 'daily-journal') {
    const r = await runPaged(
      [
        // تاریخ بدون format، خامِ میلادی (2026-11-21) چاپ میشد؛ DATE ⇒ jalaliSmart
        { key: 'day', title: 'تاریخ', format: 'DATE' },
        { key: 'type', title: 'نوع تراکنش' },
        { key: 'count', title: 'تعداد', format: 'NUMBER' },
        { key: 'debit', title: 'بدهکار', format: 'MONEY' },
        { key: 'credit', title: 'بستانکار', format: 'MONEY' },
        { key: 'other', title: 'طبقه‌بندی‌نشده', format: 'MONEY' },
        // «خالص» نام گمراه‌کننده بود؛ این ستون جمعِ گردش (بدهکار + بستانکار) است
        { key: 'net', title: 'جمع گردش', format: 'MONEY' },
      ],
      sql`FROM student_ledger sl`,
      ledgerConds(f),
      sql`TO_CHAR(COALESCE(sl."depositDate", sl."createdAt")::date, 'YYYY-MM-DD') AS day,
        sl."transactionType" AS type,
        COUNT(*)::int AS count,
        COALESCE(SUM(sl.amount) FILTER (WHERE ${isCharge}), 0)::bigint AS debit,
        COALESCE(SUM(sl.amount) FILTER (WHERE ${isStatementCredit}), 0)::bigint AS credit,
        COALESCE(SUM(sl.amount) FILTER (WHERE NOT (${isCharge}) AND NOT (${isStatementCredit})), 0)::bigint AS other,
        COALESCE(SUM(sl.amount), 0)::bigint AS net`,
      sql`ORDER BY day DESC, SUM(sl.amount) DESC`,
      f,
      sql`TO_CHAR(COALESCE(sl."depositDate", sl."createdAt")::date, 'YYYY-MM-DD'), sl."transactionType"`,
    );
    r.rows = r.rows.map((x) => ({ ...x, type: LEDGER_TYPE_FA[String(x.type)] ?? String(x.type) }));
    r.summary = 'دفتر روزنامه به تفکیک روز و نوع تراکنش — هر ردیف دقیقاً در یک طرف؛ انواعِ خارج از واژگان در ستون «طبقه‌بندی‌نشده»' + pagedNote(r);
    return r;
  }

  // ══════════════════════════════════════════════════════════════════
  //  H-3) موجودی کالا
  // ══════════════════════════════════════════════════════════════════
  if (kind === 'inventory-report') {
    const r = await runPaged(
      [
        { key: 'code', title: 'کد کالا' },
        { key: 'name', title: 'نام کالا' },
        { key: 'category', title: 'گروه' },
        { key: 'unit', title: 'واحد' },
        { key: 'inQty', title: 'ورودی', format: 'NUMBER' },
        { key: 'outQty', title: 'خروجی', format: 'NUMBER' },
        { key: 'balance', title: 'موجودی', format: 'NUMBER' },
        { key: 'value', title: 'ارزش (ریال)', format: 'MONEY' },
      ],
      sql`FROM inventory_items it`,
      [
        sql`it."universityId" = ${uni}`,
        ...(f.q ? [sql`it.name ILIKE ${'%' + escapeLikeChars(String(f.q)) + '%'} ESCAPE '\\'`] : []),
      ],
      sql`it.code, it.name, it.category, it."unitName" AS unit,
        COALESCE((SELECT SUM(m.quantity) FROM inventory_movements m WHERE m."itemId" = it.id AND m.direction = 'IN'), 0)::bigint AS "inQty",
        COALESCE((SELECT SUM(m.quantity) FROM inventory_movements m WHERE m."itemId" = it.id AND m.direction = 'OUT'), 0)::bigint AS "outQty",
        COALESCE((SELECT SUM(CASE WHEN m.direction = 'IN' THEN m.quantity ELSE -m.quantity END) FROM inventory_movements m WHERE m."itemId" = it.id), 0)::bigint AS balance,
        COALESCE((SELECT SUM(CASE WHEN m.direction = 'IN' THEN m.quantity ELSE -m.quantity END) * it."unitPrice" FROM inventory_movements m WHERE m."itemId" = it.id), 0)::bigint AS value`,
      sql`ORDER BY it.name`,
      f,
    );
    r.summary = 'موجودی = ورودی − خروجی · ارزش = موجودی × بهای واحد' + pagedNote(r);
    return r;
  }

  // ══════════════════════════════════════════════════════════════════
  //  H-4) هزینه‌های شرکت
  // ══════════════════════════════════════════════════════════════════
  if (kind === 'company-expenses') {
    const r = await runPaged(
      [
        { key: 'date', title: 'تاریخ', format: 'DATE' },
        { key: 'category', title: 'گروه هزینه' },
        { key: 'title', title: 'شرح' },
        { key: 'term', title: 'نیمسال' },
        { key: 'net', title: 'مبلغ بدون مالیات', format: 'MONEY' },
        { key: 'vat', title: 'مالیات ارزش افزوده', format: 'MONEY' },
        { key: 'gross', title: 'مبلغ کل', format: 'MONEY' },
        { key: 'paid', title: 'پرداخت‌شده', format: 'MONEY' },
      ],
      sql`FROM financial_expenses e
        LEFT JOIN academic_terms at ON at.id = e."termId"`,
      [
        sql`e."universityId" = ${uni}`,
        ...(f.term ? [sql`at."termCode" = ${f.term}`] : []),
      ],
      sql`e."expenseDate" AS date, e.category, e.title, at."termCode" AS term,
        e."netAmount" AS net, COALESCE(e."vatAmount", 0)::bigint AS vat,
        (e."netAmount" + COALESCE(e."vatAmount", 0))::bigint AS gross,
        COALESCE(e."paidAmount", 0)::bigint AS paid`,
      sql`ORDER BY e."expenseDate" DESC NULLS LAST`,
      f,
    );
    r.summary = 'هزینه‌های عمومی/شرکتی به تفکیک گروه و نیمسال' + pagedNote(r);
    return r;
  }

  // ══════════════════════════════════════════════════════════════════
  //  H-5) تخصیص هزینه‌های مشترک
  // ══════════════════════════════════════════════════════════════════
  if (kind === 'allocation-report') {
    const periods = await ledgerPeriods(uni, f);
    const pool = await allocationPoolByTerm(uni, f);
    const weights = await allocationWeightsByTerm(uni, f);

    const rows: ReportResult['rows'] = [];
    for (const p of periods) {
      const amount = pool.get(p.key) ?? 0;
      const items = weights.get(p.key) ?? [];
      if (!items.length) continue;
      const shares = allocate(amount, items);
      rows.push({ label: `── ${p.label} ──`, value: 0, kind: 'HEAD', note: `استخر هزینه: ${faAmount(amount)} ریال` });
      for (const s of shares) {
        rows.push({
          label: s.unit,
          value: s.share,
          kind: 'ITEM',
          note: `وزن ${faAmount(s.weight)} · ${s.percent.toFixed(1)}٪`,
        });
      }
      const total = shares.reduce((a, x) => a + x.share, 0);
      rows.push({ label: 'جمع تخصیص‌یافته', value: total, kind: 'TOTAL', note: '' });
    }
    if (!rows.length) {
      return statement('تخصیص هزینه‌های مشترک', [{
        label: 'دادهٔ تخصیص موجود نیست',
        value: 0,
        kind: 'ITEM',
        note: 'مبنای تخصیص: واحدهای اخذشده به تفکیک دانشکده؛ استخر هزینه: هزینه‌های شرکت و پیمانکاری.',
      }]);
    }
    return statement('تخصیص هزینه‌های مشترک', rows as never, 'تخصیص به نسبت واحدهای اخذشده');
  }

  // ══════════════════════════════════════════════════════════════════
  //  I) درآمد به تفکیک سلسله‌مراتب
  // ══════════════════════════════════════════════════════════════════
  if (kind === 'revenue-hierarchy') {
    // from/conds یک‌بار ساخته می‌شوند تا هم صفحهٔ نمایش و هم جمعِ کاملِ
    // مخرجِ «سهم (٪)» دقیقاً روی همان مجموعهٔ فیلترشده اجرا شوند (fix d).
    const from = sql`FROM students s
        JOIN users u ON u.id = s."userId"
        LEFT JOIN majors m ON m.id = s."majorId"
        LEFT JOIN faculties fc ON fc.id = m."facultyId"
        LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"
        LEFT JOIN student_ledger sl ON sl."studentId" = s.id
        ${f.term ? sql`AND sl."termId" = (SELECT id FROM academic_terms WHERE "termCode" = ${f.term} LIMIT 1)` : sql``}
        LEFT JOIN academic_terms at ON at.id = sl."termId"`;
    const conds = [
      sql`s."universityId" = ${uni}`,
      ...(studentCodeCond(f) ? [studentCodeCond(f)!] : []),
      ...(f.facultyId ? [sql`fc.id = ${f.facultyId}`] : []),
      ...(f.majorId ? [sql`m.id = ${f.majorId}`] : []),
    ];
    const r = await runPaged(
      [
        { key: 'level', title: 'سطح' },
        { key: 'name', title: 'نام' },
        { key: 'term', title: 'نیمسال' },
        { key: 'students', title: 'دانشجو', format: 'NUMBER' },
        { key: 'gross', title: 'درآمد ناخالص', format: 'MONEY' },
        { key: 'discount', title: 'تخفیف', format: 'MONEY' },
        { key: 'net', title: 'درآمد خالص', format: 'MONEY' },
        { key: 'received', title: 'وصول‌شده', format: 'MONEY' },
        { key: 'balance', title: 'مانده', format: 'MONEY' },
        { key: 'percent', title: 'سهم (٪)', format: 'NUMBER' },
      ],
      from,
      conds,
      sql`CASE WHEN fc.id IS NULL THEN 'بدون دانشکده' ELSE 'دانشکده' END AS level,
        COALESCE(fc.name, m.name, d.title, '—') AS name,
        COALESCE(at."termCode", '—') AS term,
        COUNT(DISTINCT s.id) AS students,
        COALESCE(SUM(sl.amount) FILTER (WHERE ${isCharge}), 0)::bigint AS gross,
        COALESCE(SUM(sl.amount) FILTER (WHERE ${isDisc}), 0)::bigint AS discount,
        COALESCE(SUM(sl.amount) FILTER (WHERE ${isReceived}), 0)::bigint AS received`,
      sql`ORDER BY level, name, at."sortOrder" NULLS LAST`,
      f,
      sql`CASE WHEN fc.id IS NULL THEN 'بدون دانشکده' ELSE 'دانشکده' END,
        COALESCE(fc.name, m.name, d.title, '—'), COALESCE(at."termCode", '—'), at."id"`,
    );
    // مخرجِ «سهم» از **کلِ مجموعهٔ فیلترشده** می‌آید، نه از ردیف‌های صفحه؛
    // پیش‌تر جمعِ همین ۵۰ ردیف بود و درصدها با صفحه‌بندی/جابه‌جایی می‌شکست.
    const agg = await db.execute<{ net: string }>(sql`
      SELECT (
        COALESCE(SUM(sl.amount) FILTER (WHERE ${isCharge}), 0)
        - COALESCE(SUM(sl.amount) FILTER (WHERE ${isDisc}), 0)
      )::text AS net
      ${from}
      WHERE ${sql.join(conds, sql` AND `)}
    `).catch((e: unknown) => { console.error('[finance-statements] query failed', e); throw e; });
    const totalNet = R(agg.rows[0]?.net);
    r.rows = r.rows.map((x) => {
      const net = R(x.gross) - R(x.discount);
      return {
        ...x,
        net,
        balance: net - R(x.received),
        percent: totalNet === 0 ? 0 : Number(((net / totalNet) * 100).toFixed(2)),
      };
    });
    r.summary = `درآمد خالص = ناخالص − تخفیف · سهم بر پایهٔ درآمد خالصِ کلِ مجموعهٔ فیلترشده (${faAmount(totalNet)} ریال)`
      + (r.rows.length < r.total ? ` — نمایش ${faAmount(r.rows.length)} از ${faAmount(r.total)}` : '');
    return r;
  }

  return null;
}

// ══════════════════════════════════════════════════════════════════════
//  برچسب فارسی انواع تراکنش دفتر مالی
// ══════════════════════════════════════════════════════════════════════
const LEDGER_TYPE_FA: Record<string, string> = {
  TUITION_FIXED: 'شهریهٔ ثابت',
  TUITION_VARIABLE: 'شهریهٔ متغیر',
  TUITION_CHARGE: 'شهریه (موتور یکپارچه)',
  CHARGE: 'شارژ دستی',
  SUBJECT_ADDITIVE: 'افزایش موضوعی',
  SUBJECT_DEDUCTIVE: 'کاهش موضوعی',
  TUITION_ADJUST_DEC: 'تعدیل کاهشی',
  TUITION_ADJUST_INC: 'تعدیل افزایشی',
  TUITION_BATES: 'تخفیف سما',
  TUITION_BATES_FIXED: 'تخفیف شهریهٔ ثابت',
  TUITION_BATES_VARIABLE: 'تخفیف شهریهٔ متغیر',
  TUITION_BATES_AMOUNT: 'تخفیف مبلغی',
  DISCOUNT_FIXED: 'تخفیف ثابت',
  DISCOUNT_VARIABLE: 'تخفیف متغیر',
  SPONSORSHIP: 'پوشش بنیاد',
  PAYMENT: 'پرداخت',
  POS_PAYMENT: 'پرداخت کارت‌خوان',
  POS_REFUND: 'برگشت کارت‌خوان',
  LOAN: 'وام',
  CREDIT: 'بستانکاری',
};

// ══════════════════════════════════════════════════════════════════════
//  کمکی‌های محاسباتی
// ══════════════════════════════════════════════════════════════════════

/** اجرای یک گزارشِ صفحه‌بندی‌شده */
async function runPaged(
  columns: ReportResult['columns'],
  from: ReturnType<typeof sql>,
  conds: ReturnType<typeof sql>[],
  cols: ReturnType<typeof sql>,
  orderBy: ReturnType<typeof sql>,
  f: ReportFilters,
  groupBy?: ReturnType<typeof sql>,
): Promise<ReportResult> {
  const page = Math.max(1, f.page || 1);
  const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
  const grp = groupBy ? sql`GROUP BY ${groupBy}` : sql``;
  const cnt = await db.execute<{ n: string }>(
    sql`SELECT COUNT(*)::int AS n FROM (SELECT 1 ${from} ${where} ${grp}) t`,
  );
  const total = Number(cnt.rows[0]?.n ?? 0);
  // 🔒 اندازهٔ صفحه را از درخواست بگیر (مثل `paged()`)، نه ۵۰ ثابت.
  //    پیش‌تر مسیر چاپ/CSV که pageSize=500 می‌خواست، در عمل ۵۰ می‌گرفت و
  //    روی ۱۰۰۰ ردیف متوقف می‌شد، در حالی که سند «سقف ۱۰٬۰۰۰» می‌گفت.
  const per = Math.min(Math.max(1, Number(f.pageSize) || PER), 1000);
  const totalPages = Math.max(1, Math.ceil(total / per));
  const safe = Math.min(page, totalPages);
  const data = await db.execute<Record<string, unknown>>(
    sql`SELECT ${cols} ${from} ${where} ${grp} ${orderBy} LIMIT ${per} OFFSET ${(safe - 1) * per}`,
  );
  return { columns, rows: data.rows, total, page: safe, per, totalPages };
}

/** دوره‌های (ترم) به‌همراه تجمیع مالی — پایهٔ سود و زیان و بهای تمام‌شده */
async function ledgerPeriods(uni: number, f: ReportFilters) {
  const termFilter = f.term
    ? sql`AND sl."termId" = (SELECT id FROM academic_terms WHERE "termCode" = ${f.term} LIMIT 1)`
    : sql``;
  const data = await db.execute<{
    term: string | null; label: string; gross: string; discount: string;
    sponsor: string; other: string; paid: string; students: string;
  }>(sql`
    WITH led AS (
      SELECT sl."studentId", sl."termId", sl."transactionType", sl.amount,
        SUM(CASE WHEN ${isCharge} THEN sl.amount ELSE 0 END)
          OVER (PARTITION BY sl."studentId", sl."termId") AS t_charges,
        SUM(CASE WHEN ${isDisc} THEN sl.amount ELSE 0 END)
          OVER (PARTITION BY sl."studentId", sl."termId") AS t_discs
      FROM student_ledger sl
      WHERE sl."universityId" = ${uni} ${termFilter}
    ), st AS (
      SELECT "studentId", "termId",
        SUM(amount) FILTER (WHERE ${txType('led', CHARGE_TYPES)}) AS chg,
        LEAST(
          COALESCE(SUM(amount) FILTER (WHERE ${txType('led', DISC_TYPES)}), 0),
          COALESCE(SUM(amount) FILTER (WHERE ${txType('led', CHARGE_TYPES)}), 0)
        ) AS dsc,
        SUM(amount) FILTER (WHERE ${txType('led', SPON_TYPES)}) AS spo,
        SUM(amount) FILTER (WHERE ${txType('led', PAY_TYPES)}) AS pay,
        SUM(amount) FILTER (WHERE ${txType('led', LOAN_TYPES)}) AS ln,
        SUM(amount) FILTER (WHERE ${txType('led', CREDIT_TYPES)}) AS cr
      FROM led GROUP BY "studentId", "termId"
    )
    SELECT at."termCode" AS term, at.title AS label,
      COALESCE(SUM(st.chg), 0)::text AS gross,
      COALESCE(SUM(st.dsc), 0)::text AS discount,
      COALESCE(SUM(st.spo), 0)::text AS sponsor,
      -- CREDIT «پرداختیِ دادهٔ مهاجرت» است نه درآمد؛ قبلاً به‌عنوان «سایر
      -- درآمد» جمع می‌شد و سود را کاذب بالا می‌برد. حالا به وصولی می‌رود.
      0::text AS other,
      COALESCE(SUM(COALESCE(st.pay, 0) + COALESCE(st.cr, 0)), 0)::text AS paid,
      COUNT(DISTINCT st."studentId")::text AS students
    FROM st
    LEFT JOIN academic_terms at ON at.id = st."termId"
    GROUP BY at."termCode", at.title, at."sortOrder"
    ORDER BY at."sortOrder" NULLS LAST, at."termCode"
  `).catch((e: unknown) => { console.error('[finance-statements] query failed', e); throw e; });

  if (!data.rows.length) {
    return [{ key: 'ALL', label: f.term ? `نیمسال ${f.term}` : 'کل دوره', gross: 0, discount: 0, sponsor: 0, other: 0, paid: 0, students: 0 }];
  }
  return data.rows.map((r) => ({
    key: r.term ?? 'ALL',
    label: r.term ? `${r.label}` : 'بدون ترم',
    gross: R(r.gross),
    discount: R(r.discount),
    sponsor: R(r.sponsor),
    other: R(r.other),
    paid: R(r.paid),
    students: R(r.students),
  }));
}

/** حق‌التدریس ناخالص به تفکیک ترم */
async function payrollByTerm(uni: number, f: ReportFilters) {
  const m = new Map<string, number>();
  const data = await db.execute<{ term: string | null; amount: string }>(sql`
    SELECT c."termId", at."termCode" AS term,
      COALESCE(SUM(ps."grossAmount"), 0)::text AS amount
    FROM payroll_statements ps
    JOIN professor_term_contracts c ON c.id = ps."contractId"
    LEFT JOIN academic_terms at ON at.id = c."termId"
    WHERE ps."universityId" = ${uni}
      ${f.term ? sql`AND at."termCode" = ${f.term}` : sql``}
    GROUP BY c."termId", at."termCode"
  `).catch((e: unknown) => { console.error('[finance-statements] query failed', e); throw e; });
  for (const r of data.rows) m.set(r.term ?? 'ALL', R(r.amount));
  return m;
}

/** هزینه‌های شرکت/عمومی به تفکیک ترم (مبنای هزینهٔ سود و زیان و تخصیص) */
async function expenseByTerm(uni: number, f: ReportFilters) {
  const m = new Map<string, number>();
  const data = await db.execute<{ term: string | null; amount: string }>(sql`
    SELECT e."termId", at."termCode" AS term,
      COALESCE(SUM(e."netAmount" + COALESCE(e."vatAmount", 0)), 0)::text AS amount
    FROM financial_expenses e
    LEFT JOIN academic_terms at ON at.id = e."termId"
    WHERE e."universityId" = ${uni}
      ${f.term ? sql`AND at."termCode" = ${f.term}` : sql``}
    GROUP BY e."termId", at."termCode"
  `).catch((e: unknown) => { console.error('[finance-statements] query failed', e); throw e; });
  for (const r of data.rows) m.set(r.term ?? 'ALL', R(r.amount));
  return m;
}

/** استخر هزینهٔ قابل تخصیص (هزینه‌های شرکت + پیمانکاران) به تفکیک ترم */
async function allocationPoolByTerm(uni: number, f: ReportFilters) {
  const m = new Map<string, number>();
  const data = await db.execute<{ term: string | null; amount: string }>(sql`
    SELECT x."termId", at."termCode" AS term, COALESCE(SUM(x.amount), 0)::text AS amount
    FROM (
      SELECT e."termId", (e."netAmount" + COALESCE(e."vatAmount", 0)) AS amount
      FROM financial_expenses e WHERE e."universityId" = ${uni}
      UNION ALL
      SELECT c."termId", (i."grossAmount" + COALESCE(i."vatAmount", 0)) AS amount
      FROM financial_contract_invoices i
      JOIN financial_contracts c ON c.id = i."contractId"
      WHERE i."universityId" = ${uni}
    ) x
    LEFT JOIN academic_terms at ON at.id = x."termId"
    GROUP BY x."termId", at."termCode"
  `).catch((e: unknown) => { console.error('[finance-statements] query failed', e); throw e; });
  for (const r of data.rows) m.set(r.term ?? 'ALL', R(r.amount));
  return m;
}

/** وزنِ تخصیص: واحدهای اخذشده به تفکیک دانشکده در هر ترم */
async function allocationWeightsByTerm(uni: number, f: ReportFilters) {
  const m = new Map<string, { unit: string; weight: number }[]>();
  const data = await db.execute<{ term: string | null; unit: string; weight: string }>(sql`
    SELECT co."termId", at."termCode" AS term,
      COALESCE(fc.name, 'بدون دانشکده') AS unit,
      COALESCE(SUM(cr.units), 0)::text AS weight
    FROM course_offerings co
    JOIN courses cr ON cr.id = co."courseId"
    LEFT JOIN academic_terms at ON at.id = co."termId"
    LEFT JOIN majors m ON m.id = co."targetMajorId"
    LEFT JOIN faculties fc ON fc.id = m."facultyId"
    WHERE co."universityId" = ${uni} AND co."isActive" = 1
      ${f.term ? sql`AND at."termCode" = ${f.term}` : sql``}
    GROUP BY co."termId", at."termCode", fc.name
    ORDER BY at."sortOrder" NULLS LAST
  `).catch((e: unknown) => { console.error('[finance-statements] query failed', e); throw e; });
  for (const r of data.rows) {
    const key = r.term ?? 'ALL';
    const arr = m.get(key) || [];
    arr.push({ unit: r.unit, weight: R(r.weight) });
    m.set(key, arr);
  }
  return m;
}

/** واحدهای ارائه‌شده (اخذشده) به تفکیک ترم */
async function unitsByTerm(uni: number, f: ReportFilters) {
  const m = new Map<string, number>();
  const data = await db.execute<{ term: string | null; units: string }>(sql`
    SELECT co."termId", at."termCode" AS term,
      COALESCE(SUM(cr.units), 0)::text AS units
    FROM course_offerings co
    JOIN courses cr ON cr.id = co."courseId"
    LEFT JOIN academic_terms at ON at.id = co."termId"
    WHERE co."universityId" = ${uni} AND co."isActive" = 1
      ${f.term ? sql`AND at."termCode" = ${f.term}` : sql``}
    GROUP BY co."termId", at."termCode"
  `).catch((e: unknown) => { console.error('[finance-statements] query failed', e); throw e; });
  for (const r of data.rows) m.set(r.term ?? 'ALL', R(r.units));
  return m;
}

/**
 * اجزای «ترکیب مطالبات و تعهدات» در پایان دورهٔ انتخابی.
 *
 * ⚠ این تابع ترازنامهٔ حسابداری نمی‌سازد: فقط ماندهٔ دفترِ یک‌طرفهٔ دانشجو،
 * تعهداتِ حق‌التدریس و بدهیِ پیمانکاران را جمع می‌زند. داراییِ نقد/ثابت و
 * سرمایه در schema وجود ندارند (به همین دلیل کارت هم «ترازنامه» نام ندارد).
 */
async function balanceSheetData(uni: number, f: ReportFilters) {
  const period = f.term || 'همهٔ دوره';
  const termFilter = f.term
    ? sql`AND sl."termId" = (SELECT id FROM academic_terms WHERE "termCode" = ${f.term} LIMIT 1)`
    : sql``;

  const data = await db.execute<{
    recv: string; loans: string; payables: string;
  }>(sql`
    WITH led AS (
      SELECT sl."studentId", sl."termId", sl."transactionType", sl.amount,
        sl."depositDate",
        SUM(CASE WHEN ${isCharge} THEN sl.amount ELSE 0 END)
          OVER (PARTITION BY sl."studentId", sl."termId") AS t_charges,
        SUM(CASE WHEN ${isDisc} THEN sl.amount ELSE 0 END)
          OVER (PARTITION BY sl."studentId", sl."termId") AS t_discs
      FROM student_ledger sl
      WHERE sl."universityId" = ${uni} ${termFilter}
    ), st AS (
      SELECT "studentId", "termId",
        SUM(amount) FILTER (WHERE ${txType('led', CHARGE_TYPES)}) AS chg,
        LEAST(
          COALESCE(SUM(amount) FILTER (WHERE ${txType('led', DISC_TYPES)}), 0),
          COALESCE(SUM(amount) FILTER (WHERE ${txType('led', CHARGE_TYPES)}), 0)
        ) AS dsc,
        SUM(amount) FILTER (WHERE ${txType('led', SPON_TYPES)}) AS spo,
        SUM(amount) FILTER (WHERE ${txType('led', PAY_TYPES)}) AS pay,
        SUM(amount) FILTER (WHERE ${txType('led', LOAN_TYPES)}) AS ln,
        SUM(amount) FILTER (WHERE ${txType('led', CREDIT_TYPES)}) AS cr
      FROM led GROUP BY "studentId", "termId"
    ), per_student AS (
      SELECT "studentId",
        SUM(chg) AS chg, SUM(dsc) AS dsc, SUM(spo) AS spo,
        SUM(pay) AS pay, SUM(ln) AS ln, SUM(cr) AS cr
      FROM st GROUP BY "studentId"
    )
    SELECT
      COALESCE(SUM(GREATEST(chg - dsc - spo - pay - ln - cr, 0)), 0)::text AS recv,
      -- ⚠ پیش‌تر «وام» = GREATEST(ln - pay, 0) بود: تمام پرداخت‌های دانشجو از
      -- وام کم می‌شد، در حالی که این دو مقولهٔ جدا هستند و نتیجه بی‌معنا می‌شد.
      -- اکنون فقط جمعِ ردیف‌های نوع LOAN (وامِ ثبت‌شده در دفتر) است.
      COALESCE(SUM(ln), 0)::text AS loans,
      COALESCE(SUM(GREATEST(-(chg - dsc - spo - pay - ln - cr), 0)), 0)::text AS payables
    FROM per_student
  `).catch((e: unknown) => { console.error('[finance-statements] query failed', e); throw e; });

  // «deferred» (پیش‌دریافت نیمسالهای آینده) حذف شد: همیشه 0::text هاردکد بود
  // و پایگاه داده مفهومِ آن را ثبت نمیکند؛ lib برای سازگاریِ قرارداد همان ۰ را میگیرد.
  const r = data.rows[0] as { recv: string; loans: string; payables: string } | undefined;

  // تعهداتِ حق‌التدریسِ پرداخت‌نشده
  const payroll = await db.execute<{ payable: string }>(sql`
    SELECT COALESCE(SUM(GREATEST(ps."grossAmount" - COALESCE(ps."midtermPaidAmount", 0) - COALESCE(ps."finalPaidAmount", 0), 0)), 0)::text AS payable
    FROM payroll_statements ps
    JOIN professor_term_contracts c ON c.id = ps."contractId"
    WHERE ps."universityId" = ${uni}
      ${f.term ? sql`AND c."termId" = (SELECT id FROM academic_terms WHERE "termCode" = ${f.term} LIMIT 1)` : sql``}
  `).catch((e: unknown) => { console.error('[finance-statements] query failed', e); throw e; });

  // بدهی به پیمانکاران (صورتحساب − پرداخت) — هم‌ترازِ فیلتر ترمِ بقیهٔ اجزای
  // ترازنامه: با پیوند به قرارداد، فقط صورتحسابهای همان نیمسال شمرده میشود
  // (الگوی همان فیلترِ تعهداتِ حق‌التدریس).
  const supplier = await db.execute<{ payable: string }>(sql`
    SELECT COALESCE(SUM(GREATEST(i."grossAmount" + COALESCE(i."vatAmount", 0) - COALESCE(i."paidAmount", 0), 0)), 0)::text AS payable
    FROM financial_contract_invoices i
    JOIN financial_contracts c ON c.id = i."contractId"
    WHERE i."universityId" = ${uni}
      ${f.term ? sql`AND c."termId" = (SELECT id FROM academic_terms WHERE "termCode" = ${f.term} LIMIT 1)` : sql``}
  `).catch((e: unknown) => { console.error('[finance-statements] query failed', e); throw e; });

  // سود/زیان انباشته = درآمد − هزینه تا همین تاریخ
  const periods = await ledgerPeriods(uni, f);
  const payrollByT = await payrollByTerm(uni, f);
  const expenseByT = await expenseByTerm(uni, f);
  let revenue = 0;
  let cost = 0;
  for (const p of periods) {
    revenue += p.gross - p.discount + p.sponsor;
    cost += (payrollByT.get(p.key) ?? 0) + (expenseByT.get(p.key) ?? 0);
  }

  return {
    period,
    studentReceivables: R(r?.recv),
    studentLoansReceivable: R(r?.loans),
    studentPayables: R(r?.payables),
    deferredRevenue: 0,
    payrollPayable: R(payroll.rows[0]?.payable),
    supplierPayable: R(supplier.rows[0]?.payable),
    retainedSurplus: revenue - cost,
  };
}

/** برچسب فارسی ماههای شمسی — برای سربرگِ ماههای صورت جریان نقدی */
const JALALI_MONTH_FA = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
] as const;

/**
 * برچسب شمسیِ ماه از کلیدِ میلادیِ 'YYYY-MM' — مثلاً «فروردین ۱۴۰۴».
 *
 * چرا کلیدِ گروه‌بندی میلادی میماند و فقط نمایش شمسی میشود؟ هر دو کوئریِ
 * (دریافتهای دانشجو و پرداختِ حق‌التدریس) با **همان** کلیدِ 'YYYY-MM'
 * گروه‌بندی/ JOIN میشوند، پس ترازِ دریافت/پرداختِ هر ماه حفظ میشود؛ تبدیل
 * جلالی فقط در آخرین مرحله و فقط برای نمایش انجام میشود. ترتیب ماهها هم
 * دستنخورده میماند چون تبدیل یکبهیک و صعودی است.
 *
 * روزِ ۱۵ عمدی است: همیشه میانهٔ ماه میلادی است و ماهِ جلالیِ متناظر را
 * بدون خطای مرزِ سال قطعی میکند.
 */
function jalaliMonthLabel(gregKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(gregKey);
  if (!m) return gregKey;
  const { jy, jm } = toJalali(Number(m[1]), Number(m[2]), 15);
  return `${JALALI_MONTH_FA[jm - 1] ?? ''} ${faDigits(jy)}`;
}

/** ردیف‌های صورت جریان نقدی — به تفکیک ماه */
async function cashFlowRows(
  uni: number,
  f: ReportFilters,
): Promise<{ rows: ReportResult['rows']; unmapped: { type: string; count: number; amount: number }[] }> {
  const termFilter = f.term
    ? sql`AND sl."termId" = (SELECT id FROM academic_terms WHERE "termCode" = ${f.term} LIMIT 1)`
    : sql``;
  const termIdFilter = f.term
    ? sql`(SELECT id FROM academic_terms WHERE "termCode" = ${f.term} LIMIT 1)`
    : null;
  const data = await db.execute<{
    month: string; tuition: string; sponsor: string; loan: string; other: string;
    refund: string; noncash_charge: string; noncash_discount: string;
  }>(sql`
    WITH b AS (
      SELECT TO_CHAR(COALESCE(sl."depositDate", sl."createdAt")::date, 'YYYY-MM') AS month,
        ${CASH_BUCKET} AS bucket,
        sl.amount
      FROM student_ledger sl
      WHERE sl."universityId" = ${uni} ${termFilter}
        AND COALESCE(sl."depositDate", sl."createdAt") IS NOT NULL
    )
    SELECT month,
      COALESCE(SUM(amount) FILTER (WHERE bucket = 'TUITION'), 0)::text AS tuition,
      COALESCE(SUM(amount) FILTER (WHERE bucket = 'SPONSOR'), 0)::text AS sponsor,
      COALESCE(SUM(amount) FILTER (WHERE bucket = 'LOAN'), 0)::text AS loan,
      COALESCE(SUM(amount) FILTER (WHERE bucket = 'OTHER'), 0)::text AS other,
      COALESCE(SUM(amount) FILTER (WHERE bucket = 'REFUND'), 0)::text AS refund,
      COALESCE(SUM(amount) FILTER (WHERE bucket = 'NONCASH_CHARGE'), 0)::text AS noncash_charge,
      COALESCE(SUM(amount) FILTER (WHERE bucket = 'NONCASH_DISCOUNT'), 0)::text AS noncash_discount
    FROM b
    GROUP BY month
    ORDER BY month DESC
  `).catch((e: unknown) => { console.error('[finance-statements] query failed', e); throw e; });

  // پرداختِ حق‌التدریس — عمداً با همان کلیدِ 'YYYY-MM'ِ کوئریِ دریافتها
  // گروه‌بندی میشود تا joinِ دریافت/پرداختِ هر ماه دقیق بماند؛ برچسب شمسی
  // فقط در jalaliMonthLabel() (لایهٔ نمایش) ساخته میشود.
  const pay = await db.execute<{ month: string; amount: string }>(sql`
    SELECT TO_CHAR(x.paid_at, 'YYYY-MM') AS month,
      COALESCE(SUM(x.amount), 0)::text AS amount
    FROM (
      SELECT ps."midtermPaidAmount" AS amount, ps."midtermPaidAt" AS paid_at
      FROM payroll_statements ps
      JOIN professor_term_contracts c ON c.id = ps."contractId"
      WHERE ps."universityId" = ${uni}
        ${termIdFilter ? sql`AND c."termId" = ${termIdFilter}` : sql``}
      UNION ALL
      SELECT ps."finalPaidAmount", ps."finalPaidAt"
      FROM payroll_statements ps
      JOIN professor_term_contracts c ON c.id = ps."contractId"
      WHERE ps."universityId" = ${uni}
        ${termIdFilter ? sql`AND c."termId" = ${termIdFilter}` : sql``}
    ) x
    WHERE x.paid_at IS NOT NULL AND COALESCE(x.amount, 0) <> 0
    GROUP BY 1
  `).catch((e: unknown) => { console.error('[finance-statements] query failed', e); throw e; });

  const exp = await db.execute<{ month: string; amount: string }>(sql`
    SELECT TO_CHAR(e."expenseDate", 'YYYY-MM') AS month,
      COALESCE(SUM(e."paidAmount"), 0)::text AS amount
    FROM financial_expenses e
    WHERE e."universityId" = ${uni}
      ${termIdFilter ? sql`AND e."termId" = ${termIdFilter}` : sql``}
      AND e."expenseDate" IS NOT NULL
    GROUP BY 1
  `).catch((e: unknown) => { console.error('[finance-statements] query failed', e); throw e; });

  const invoicePay = await db.execute<{ month: string; amount: string }>(sql`
    SELECT TO_CHAR(i."invoiceDate", 'YYYY-MM') AS month,
      COALESCE(SUM(i."paidAmount"), 0)::text AS amount
    FROM financial_contract_invoices i
    JOIN financial_contracts c ON c.id = i."contractId"
    WHERE i."universityId" = ${uni}
      ${termIdFilter ? sql`AND c."termId" = ${termIdFilter}` : sql``}
      AND i."invoiceDate" IS NOT NULL
    GROUP BY 1
  `).catch((e: unknown) => { console.error('[finance-statements] query failed', e); throw e; });

  const unmapped = await unmappedTxnTypes(uni, f);
  const unmappedAmount = unmapped.reduce((a, x) => a + x.amount, 0);

  const byMonth = new Map(data.rows.map((x) => [x.month, x]));
  const payMap = new Map(pay.rows.map((x) => [x.month, R(x.amount)]));
  const expMap = new Map(exp.rows.map((x) => [x.month, R(x.amount)]));
  const invMap = new Map(invoicePay.rows.map((x) => [x.month, R(x.amount)]));
  const rows: ReportResult['rows'] = [];
  let cumulative = 0;
  // کلیدِ هر دو منبع داده 'YYYY-MM' میلادی است (join امن) — فقط برچسبِ نمایشی
  // شمسی میشود. ترتیب: قدیم به جدید تا «ماندهٔ انباشته» درست جمع بخورد.
  const keys = new Set<string>([
    ...data.rows.map((x) => x.month).filter(Boolean),
    ...payMap.keys(),
    ...expMap.keys(),
    ...invMap.keys(),
  ]);
  const months = [...keys].sort();
  for (const m of months) {
    const d = byMonth.get(m);
    const faMonth = jalaliMonthLabel(m);
    const tuition = R(d?.tuition);
    const sponsor = R(d?.sponsor);
    const loan = R(d?.loan);
    const other = R(d?.other);
    const refund = R(d?.refund);
    const teaching = payMap.get(m) ?? 0;
    const expenses = expMap.get(m) ?? 0;
    const contractors = invMap.get(m) ?? 0;
    const noncash = R(d?.noncash_charge) + R(d?.noncash_discount);

    const cf = buildCashFlow({
      period: faMonth,
      tuitionReceipts: tuition,
      sponsorshipReceipts: sponsor,
      // `buildCashFlow` فیلدِ جداگانهٔ وام ندارد؛ وام در نمایش ردیفِ نام‌دارِ
      // مستقل دارد و اینجا فقط برای اینکه «جمع دریافت‌ها» و «خالص حرکت نقد»
      // کامل بمانند به otherReceipts اضافه می‌شود. `other` هم دقیقاً
      // باقی‌ماندهٔ سبدِ OTHER (انواعِ خارج از واژگان) است.
      otherReceipts: loan + other,
      teachingPayments: teaching,
      otherPayments: expenses + contractors + refund,
    });
    cumulative += cf.netMovement;

    const otherNote = other === 0 && unmappedAmount === 0
      ? ''
      : 'شامل انواعِ خارج از واژگانِ دفتر (بدون حذف)';
    rows.push(
      { label: `── ${faMonth} ──`, value: 0, kind: 'HEAD', note: '' },
      { label: 'دریافت از شهریه', value: cf.receipts.tuition, kind: 'ITEM', note: 'پرداخت/کارت‌خوان + بستانکاریِ مهاجرت' },
      { label: 'دریافت از بنیاد/خیرین', value: cf.receipts.sponsorship, kind: 'ITEM', note: '' },
      { label: 'دریافت وام', value: loan, kind: 'ITEM', note: 'وامِ تأمین‌شده برای شهریه (نوع LOAN)' },
      { label: 'سایر دریافت‌های طبقه‌بندی‌نشده', value: other, kind: 'ITEM', note: otherNote },
      { label: 'جمع دریافت‌ها', value: cf.receipts.total, kind: 'TOTAL', note: '' },
      { label: 'پرداخت حق‌التدریس (واقعی)', value: -cf.payments.teaching, kind: 'ITEM', note: 'میان‌ترم + پایان‌ترمِ پرداخت‌شده' },
      { label: 'پرداخت هزینه‌های شرکت', value: -expenses, kind: 'ITEM', note: 'بر پایهٔ مبلغ پرداخت‌شده' },
      { label: 'پرداخت به پیمانکاران', value: -contractors, kind: 'ITEM', note: 'بر پایهٔ مبلغ پرداخت‌شدهٔ صورت‌حساب' },
      { label: 'برگشت وجه به دانشجو', value: -refund, kind: 'ITEM', note: 'نوع POS_REFUND — خروج نقد' },
      { label: 'جمع پرداخت‌ها', value: -cf.payments.total, kind: 'TOTAL', note: '' },
      { label: 'خالص حرکت نقد', value: cf.netMovement, kind: 'TOTAL', note: 'جمع دریافت‌ها − جمع پرداخت‌ها' },
      { label: 'ماندهٔ انباشتهٔ نقد', value: cumulative, kind: 'TOTAL', note: '' },
    );
    if (noncash !== 0) {
      rows.push({
        label: 'یادآوری: اقلام غیرنقدی (شهریه/تخفیف)',
        value: noncash,
        kind: 'ITEM',
        note: 'در جمع دریافت/پرداخت نیامده است — فقط برای شفافیتِ پوششِ واژگان',
      });
    }
  }
  return { rows, unmapped };
}
