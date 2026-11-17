// ══════════════════════════════════════════════════════════════════════
//  گزارش‌های دفتر کلِ دوطرفه (gl_*) — تراز آزمایشی، ترازنامه، سود و زیان
//
//  ⚠ این ماژول عمداً جدول‌های gl_* را از `@/db/schema` ایمپورت نمی‌کند:
//    جدول‌ها هم‌زمان با همین گزارش‌ها ساخته می‌شوند و SQL خام تنها قراردادِ
//    پایدار است (نامِ جدول/ستون در همین فایل مرجع است).
//  ▸ همهٔ جمع‌ها با SQL (SUM(...) FILTER) گرفته می‌شوند؛ هیچ جمعی از
//    `rows.reduce` ساخته نمی‌شود، چون ردیف‌های نمایشیِ بریده‌شده نباید
//    «جمع» را تغییر دهند.
//  ▸ اسکوپ دانشگاه fail-closed است: بدونِ دانشگاهِ معتبر هیچ ردیفی برنمی‌گردد.
//  ▸ قبل از اجرای «بازسازی از دفتر دانشجو» جدولِ اسناد خالی است؛ در آن حالت
//    هر سه گزارش یک «حالتِ خالیِ صادق» نشان می‌دهند، نه صفرهای شبیه صورت مالی.
//  ▸ مبالغ ریالِ صحیح‌اند (numeric(18,0)).
// ══════════════════════════════════════════════════════════════════════
import type { ReportColumn, ReportFilters, ReportResult } from './report-helpers';
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { faNum, jalaliSmart } from '@/lib/report-format';
import { isRealUniversityId } from '@/lib/university-scope';

const ROLES = ['ADMIN', 'EDU_EXPERT', 'FINANCE_EXPERT', 'FINANCE', 'CASHIER'];

/** عدد فارسی با جداکنندهٔ هزارگان — هم‌تراز با formatReportCell (بدون ICU) */
const faAmount = (n: number): string =>
  faNum(Math.round(Number(n) || 0).toLocaleString('en-US'));
const money = (n: number): string => `${faAmount(n)} ریال`;
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const LEDGER_EMPTY_SUMMARY =
  'هنوز سندی در دفتر کل ثبت نشده است؛ ابتدا از پنل حسابداری «بازسازی از دفتر دانشجو» را اجرا کنید.';

/** برچسب فارسی نوع حساب — مقدار ناشناخته «سایر» می‌شود، نه کد خام انگلیسی */
const ACCOUNT_TYPE_FA: Record<string, string> = {
  ASSET: 'دارایی',
  LIABILITY: 'بدهی',
  EQUITY: 'حقوق صاحبان سهام',
  REVENUE: 'درآمد',
  EXPENSE: 'هزینه',
};
const typeFa = (t: unknown): string => ACCOUNT_TYPE_FA[String(t ?? '')] ?? 'سایر';

const KIND_FA = { HEAD: 'سرفصل', ITEM: 'قلم', TOTAL: 'جمع' } as const;
type StatementRow = {
  label: string;
  value: number | null;
  kind: keyof typeof KIND_FA;
  note?: string;
};

/** سقفِ ردیف‌های نمایشی — جمع‌ها از SQL و روی کلِ مجموعه است، نه این ردیف‌ها */
const TB_CAP = 500;
const SECTION_CAP = 60;
const BAD_VOUCHER_CAP = 20;

/** «نمایش N از M» برای هر فهرستِ بریده‌شده */
const cappedNote = (shown: number, total: number): string =>
  total > shown ? ` — نمایش ${faAmount(shown)} از ${faAmount(total)}` : '';

// ── بازهٔ تاریخِ نیمسال ──────────────────────────────────────────────
type TermRange =
  | { kind: 'all'; label: string }
  | { kind: 'range'; start: string; end: string; label: string }
  | { kind: 'missing'; label: string; reason: 'no-term' | 'no-dates' };

/**
 * بازهٔ تاریخِ نیمسال از `academic_terms`.
 *
 * `term` خالی ⇒ `all` (کلِ دورهٔ دفتر کل). اگر ترم پیدا نشود یا تاریخِ
 * شروع/پایانش ثبت نشده باشد ⇒ `missing`؛ گزارش با پیامِ صادقانه خالی
 * می‌ماند، چون حدسِ بازه یعنی نسبت‌دادنِ اسنادِ ترمِ دیگر به این ترم.
 */
async function resolveTerm(uni: number, term?: string): Promise<TermRange> {
  const code = String(term ?? '').trim();
  if (!code) return { kind: 'all', label: 'کل دورهٔ دفتر کل' };
  // ترمِ همین دانشگاه اولویت دارد؛ ترمِ سراسری (universityId NULL) هم پذیرفته می‌شود.
  const r = await db.execute<{ start_date: string | null; end_date: string | null }>(sql`
    SELECT TO_CHAR("startDate", 'YYYY-MM-DD') AS start_date,
           TO_CHAR("endDate", 'YYYY-MM-DD') AS end_date
    FROM academic_terms
    WHERE "termCode" = ${code}
    ORDER BY ("universityId" = ${uni}) DESC NULLS LAST, id DESC
    LIMIT 1
  `);
  const row = r.rows[0];
  if (!row) return { kind: 'missing', label: `نیمسال ${faNum(code)}`, reason: 'no-term' };
  if (!row.start_date || !row.end_date) {
    return { kind: 'missing', label: `نیمسال ${faNum(code)}`, reason: 'no-dates' };
  }
  return { kind: 'range', start: row.start_date, end: row.end_date, label: `نیمسال ${faNum(code)}` };
}

/** شرطِ «اسنادِ ثبت‌شده (POSTED)ِ همین دانشگاه» + بازهٔ نیمسال در صورت وجود */
function postedWhere(uni: number, range: TermRange) {
  const dateCond = range.kind === 'range'
    ? sql`AND v."voucherDate" >= ${range.start}::date
        AND v."voucherDate" < (${range.end}::date + INTERVAL '1 day')`
    : sql``;
  return sql`v."universityId" = ${uni} AND v.status = 'POSTED' ${dateCond}`;
}

/** شرطِ «تا تاریخِ مشخص» — ترازنامه، برخلاف تراز آزمایشی، بازه‌ای نیست */
function postedUpTo(uni: number, asOf: string | null) {
  const dateCond = asOf
    ? sql`AND v."voucherDate"::date <= ${asOf}::date`
    : sql`AND v."voucherDate"::date <= CURRENT_DATE`;
  return sql`v."universityId" = ${uni} AND v.status = 'POSTED' ${dateCond}`;
}

/** آیا اصلاً سندی در دفتر کلِ این دانشگاه ثبت شده است؟ (برای حالتِ خالی) */
async function ledgerHasVouchers(uni: number): Promise<boolean> {
  const r = await db.execute<{ ok: boolean }>(sql`
    SELECT EXISTS (SELECT 1 FROM gl_vouchers v WHERE v."universityId" = ${uni}) AS ok
  `);
  return Boolean(r.rows[0]?.ok);
}

/**
 * اسنادِ POSTEDِ بدونِ تاریخ — در بازه/تا-تاریخ نمی‌گنجند و کنار می‌روند.
 * شمردنشان مانعِ «حذفِ بی‌صدا» است: عدد در خلاصهٔ گزارش اعلام می‌شود.
 */
async function undatedPosted(uni: number): Promise<number> {
  const r = await db.execute<{ n: number }>(sql`
    SELECT COUNT(*)::int AS n FROM gl_vouchers v
    WHERE v."universityId" = ${uni} AND v.status = 'POSTED' AND v."voucherDate" IS NULL
  `);
  return num(r.rows[0]?.n);
}

/**
 * سمتِ نرمالِ هر حساب: `normalSide` اگر مقدارِ معتبر داشته باشد، وگرنه از روی
 * نوع حساب. (اگر `normalSide` خالی باشد نباید حساب بی‌صدا از جمع بیفتد.)
 */
const SIDE_EXPR = sql`(CASE
  WHEN a."normalSide" IN ('DEBIT', 'CREDIT') THEN a."normalSide"
  WHEN a.type IN ('LIABILITY', 'EQUITY', 'REVENUE') THEN 'CREDIT'
  ELSE 'DEBIT'
END)`;

/** مبلغِ علامت‌دارِ هر ردیف: مثبت = در جهتِ سمتِ نرمالِ حساب */
const SIGNED = sql`(CASE WHEN ${SIDE_EXPR} = 'CREDIT' THEN l.credit - l.debit ELSE l.debit - l.credit END)`;

/** ساختِ خروجیِ صورت‌های مالی (قلم/مبلغ/نوع/توضیح) — هم‌ریختِ r-finance-statements */
function statement(rows: StatementRow[], summary: string): ReportResult {
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
      kind: KIND_FA[r.kind],
      note: r.note ?? '',
    })),
    total: rows.length,
    page: 1,
    per: rows.length || 1,
    totalPages: 1,
    summary,
  };
}

/** حالتِ خالیِ صادق — یک ردیفِ توضیحی، بدونِ صفرهای شبیه صورت مالی */
function emptyLedgerReport(title: string): ReportResult {
  return statement(
    [{
      label: `${title} — دفتر کل خالی است`,
      value: null,
      kind: 'ITEM',
      note: LEDGER_EMPTY_SUMMARY,
    }],
    LEDGER_EMPTY_SUMMARY,
  );
}

/** متنِ «نیمسال بدون بازهٔ تاریخ» — گزارش تولید نمی‌شود */
function missingTermMessage(range: TermRange): string {
  if (range.kind !== 'missing') return '';
  return range.reason === 'no-term'
    ? `${range.label} در academic_terms پیدا نشد؛ بازهٔ تاریخ نامشخص است و گزارشی تولید نشد.`
    : `تاریخِ شروع/پایانِ ${range.label} در academic_terms ثبت نشده است؛ `
      + 'برای این گزارش بازهٔ تاریخ لازم است و گزارشی تولید نشد.';
}

/** پیامِ «نیمسال بدون بازهٔ تاریخ» برای صورت‌های مالی */
function missingTermReport(title: string, range: TermRange): ReportResult {
  const msg = missingTermMessage(range);
  return statement([{ label: `${title} — بازهٔ تاریخ نامشخص`, value: null, kind: 'ITEM', note: msg }], msg);
}

/** پیامِ «در این بازه سندِ POSTED نیست» — دفتر کل پر است، ولی دوره خالی است */
function noMovementReport(title: string, label: string): ReportResult {
  const msg = `در ${label} هیچ سندِ ثبت‌شده (POSTED) وجود ندارد؛ گزارشی برای نمایش نیست.`;
  return statement([{ label: `${title} — بدون گردش`, value: null, kind: 'ITEM', note: msg }], msg);
}

// ══════════════════════════════════════════════════════════════════════
//  ۱) تراز آزمایشیِ دفتر کل
// ══════════════════════════════════════════════════════════════════════
async function trialBalance(uni: number, f: ReportFilters): Promise<ReportResult> {
  const columns: ReportColumn[] = [
    { key: 'code', title: 'کد حساب' },
    { key: 'name', title: 'نام حساب' },
    { key: 'type', title: 'نوع' },
    { key: 'debit', title: 'بدهکار', format: 'MONEY' },
    { key: 'credit', title: 'بستانکار', format: 'MONEY' },
    { key: 'balance', title: 'مانده (بدهکار/بستانکار)' },
  ];
  /** ردیفِ توضیحی با همان ستون‌های تراز آزمایشی */
  const notice = (label: string, summary: string): ReportResult => ({
    columns,
    rows: [{ code: '—', name: label, type: '—', debit: null, credit: null, balance: '—' }],
    total: 1,
    page: 1,
    per: 1,
    totalPages: 1,
    summary,
  });

  const range = await resolveTerm(uni, f.term);
  if (range.kind === 'missing') {
    const msg = missingTermMessage(range);
    return notice('تراز آزمایشی دفتر کل — بازهٔ تاریخ نامشخص', msg);
  }
  if (!(await ledgerHasVouchers(uni))) {
    return notice(LEDGER_EMPTY_SUMMARY, LEDGER_EMPTY_SUMMARY);
  }

  const where = postedWhere(uni, range);
  const [data, totals, bad] = await Promise.all([
    // یک ردیف برای هر حسابِ دارای گردش (گردش خالصِ صفر هم حسابِ دارای حرکت است)
    db.execute<{
      code: string | null; name: string | null; type: string | null;
      debit: string; credit: string; net: string; total_rows: number;
    }>(sql`
      WITH mv AS (
        SELECT l."accountId" AS account_id,
               COALESCE(SUM(l.debit), 0) AS debit,
               COALESCE(SUM(l.credit), 0) AS credit
        FROM gl_voucher_lines l
        JOIN gl_vouchers v ON v.id = l."voucherId"
        WHERE ${where}
        GROUP BY l."accountId"
      )
      SELECT a.code AS code, a.name AS name, a.type AS type,
             m.debit::bigint AS debit,
             m.credit::bigint AS credit,
             (m.debit - m.credit)::bigint AS net,
             (COUNT(*) OVER ())::int AS total_rows
      FROM mv m
      JOIN gl_accounts a ON a.id = m.account_id
      WHERE m.debit <> 0 OR m.credit <> 0
      ORDER BY a.code, a.id
      LIMIT ${TB_CAP}
    `),
    // جمعِ کل از خودِ ردیف‌های اسناد (نه از ردیف‌های نمایشی)
    db.execute<{ debit: string; credit: string; lines: number; vouchers: number }>(sql`
      SELECT COALESCE(SUM(l.debit), 0)::bigint AS debit,
             COALESCE(SUM(l.credit), 0)::bigint AS credit,
             COUNT(*)::int AS lines,
             COUNT(DISTINCT v.id)::int AS vouchers
      FROM gl_voucher_lines l
      JOIN gl_vouchers v ON v.id = l."voucherId"
      WHERE ${where}
    `),
    // اسنادی که سرجمعِ خودشان ناتراز است — نباید بی‌صدا حذف شوند
    db.execute<{
      voucher_no: string | null; voucher_date: string | null;
      diff: string; bad_count: number;
    }>(sql`
      SELECT v."voucherNo" AS voucher_no,
             TO_CHAR(v."voucherDate", 'YYYY-MM-DD') AS voucher_date,
             (COALESCE(v."totalDebit", 0) - COALESCE(v."totalCredit", 0))::bigint AS diff,
             (COUNT(*) OVER ())::int AS bad_count
      FROM gl_vouchers v
      WHERE ${where}
        AND COALESCE(v."totalDebit", 0) <> COALESCE(v."totalCredit", 0)
      ORDER BY v."voucherDate", v."voucherNo"
      LIMIT ${BAD_VOUCHER_CAP}
    `),
  ]);

  const totalDebit = num(totals.rows[0]?.debit);
  const totalCredit = num(totals.rows[0]?.credit);
  const diff = totalDebit - totalCredit;
  const accountCount = num(data.rows[0]?.total_rows ?? 0);
  const badCount = num(bad.rows[0]?.bad_count ?? 0);
  const undated = await undatedPosted(uni);

  const rows: Record<string, unknown>[] = data.rows.map((a) => {
    const net = num(a.net);
    return {
      code: String(a.code ?? ''),
      name: String(a.name ?? '—'),
      type: typeFa(a.type),
      debit: num(a.debit),
      credit: num(a.credit),
      // ستونِ «مانده» همیشه سمت را می‌گوید؛ عددِ خالص بدون سمت گمراه‌کننده است.
      balance: net === 0 ? money(0) : `${money(Math.abs(net))} ${net > 0 ? 'بدهکار' : 'بستانکار'}`,
    };
  });

  rows.push({
    code: '',
    name: 'جمع کل',
    type: '',
    debit: totalDebit,
    credit: totalCredit,
    balance: diff === 0
      ? `${money(0)} (تراز)`
      : `${money(Math.abs(diff))} ${diff > 0 ? 'بدهکار' : 'بستانکار'} (ناتراز)`,
  });

  if (badCount > 0) {
    rows.push({
      code: '⚠',
      name: `سندهای ناتراز: ${faNum(badCount)}`,
      type: '—',
      debit: null,
      credit: null,
      balance: 'بدهکار ≠ بستانکار',
    });
    for (const b of bad.rows) {
      const d = num(b.diff);
      rows.push({
        code: '',
        name: `سند شمارهٔ ${faNum(String(b.voucher_no ?? '—'))}`
          + (b.voucher_date ? ` — ${jalaliSmart(b.voucher_date)}` : ''),
        type: '—',
        debit: null,
        credit: null,
        balance: `اختلاف ${money(Math.abs(d))} ${d > 0 ? 'بدهکار' : 'بستانکار'}`,
      });
    }
    if (badCount > bad.rows.length) {
      rows.push({
        code: '…',
        name: `نمایش ${faNum(bad.rows.length)} از ${faNum(badCount)} سند ناتراز`,
        type: '—',
        debit: null,
        credit: null,
        balance: '—',
      });
    }
  } else if (diff !== 0) {
    // سرجمعِ سندها تراز است ولی ردیف‌ها نه — این هم ناترازی است و پنهان نمی‌شود.
    rows.push({
      code: '⚠',
      name: 'جمع ردیف‌های اسناد با جمع سندها هم‌خوان نیست',
      type: '—',
      debit: null,
      credit: null,
      balance: `اختلاف ${money(Math.abs(diff))} ${diff > 0 ? 'بدهکار' : 'بستانکار'}`,
    });
  }

  if (!data.rows.length && totalDebit === 0 && totalCredit === 0) {
    const msg = `در ${range.label} هیچ سندِ ثبت‌شده (POSTED) وجود ندارد؛ گزارشی برای نمایش نیست.`;
    return notice('تراز آزمایشی دفتر کل — بدون گردش', msg);
  }

  const summary =
    `${faAmount(accountCount)} حسابِ دارای گردش — ${range.label} — `
    + `جمع بدهکار ${faAmount(totalDebit)} / جمع بستانکار ${faAmount(totalCredit)} ریال`
    + (diff === 0
      ? ' · تراز است'
      : ` · ⚠ اختلاف ${faAmount(Math.abs(diff))} ریال (${diff > 0 ? 'بدهکار' : 'بستانکار'})`)
    + (badCount > 0 ? ` · سندهای ناتراز: ${faNum(badCount)}` : '')
    + (undated > 0 ? ` · ${faNum(undated)} سند بدون تاریخ کنار گذاشته شد` : '')
    + cappedNote(data.rows.length, accountCount);

  return {
    columns,
    rows,
    total: rows.length,
    page: 1,
    per: rows.length || 1,
    totalPages: 1,
    summary,
  };
}

// ══════════════════════════════════════════════════════════════════════
//  ۲) ترازنامهٔ واقعی — دارایی = بدهی + حقوق صاحبان سهام + سود/زیان دوره
// ══════════════════════════════════════════════════════════════════════
async function balanceSheet(uni: number, f: ReportFilters): Promise<ReportResult> {
  const title = 'ترازنامه';
  if (!(await ledgerHasVouchers(uni))) return emptyLedgerReport(title);

  const range = await resolveTerm(uni, f.term);
  const asOf = range.kind === 'range' ? range.end : null;
  const asOfLabel = asOf ? jalaliSmart(asOf) : `امروز (${jalaliSmart(new Date().toISOString().slice(0, 10))})`;
  const asOfNote = range.kind === 'missing'
    ? ` — ${range.reason === 'no-term' ? `${range.label} پیدا نشد` : `تاریخِ پایانِ ${range.label} ثبت نشده است`}؛ تاریخِ امروز مبنا قرار گرفت`
    : '';
  const where = postedUpTo(uni, asOf);

  const [data, totals] = await Promise.all([
    db.execute<{
      type: string | null; code: string | null; name: string | null; amount: string;
    }>(sql`
      SELECT a.type AS type, a.code AS code, a.name AS name,
             COALESCE(SUM(${SIGNED}), 0)::bigint AS amount
      FROM gl_voucher_lines l
      JOIN gl_vouchers v ON v.id = l."voucherId"
      JOIN gl_accounts a ON a.id = l."accountId"
      WHERE ${where} AND a.type IN ('ASSET', 'LIABILITY', 'EQUITY')
      GROUP BY a.id, a.type, a.code, a.name, ${SIDE_EXPR}
      HAVING COALESCE(SUM(l.debit), 0) <> 0 OR COALESCE(SUM(l.credit), 0) <> 0
      ORDER BY a.type, a.code, a.id
    `),
    db.execute<{
      assets: string; liabilities: string; equity: string;
      revenue: string; expense: string;
    }>(sql`
      SELECT
        COALESCE(SUM(${SIGNED}) FILTER (WHERE a.type = 'ASSET'), 0)::bigint AS assets,
        COALESCE(SUM(${SIGNED}) FILTER (WHERE a.type = 'LIABILITY'), 0)::bigint AS liabilities,
        COALESCE(SUM(${SIGNED}) FILTER (WHERE a.type = 'EQUITY'), 0)::bigint AS equity,
        COALESCE(SUM(${SIGNED}) FILTER (WHERE a.type = 'REVENUE'), 0)::bigint AS revenue,
        COALESCE(SUM(${SIGNED}) FILTER (WHERE a.type = 'EXPENSE'), 0)::bigint AS expense
      FROM gl_voucher_lines l
      JOIN gl_vouchers v ON v.id = l."voucherId"
      JOIN gl_accounts a ON a.id = l."accountId"
      WHERE ${where}
    `),
  ]);

  const t = totals.rows[0];
  const assets = num(t?.assets);
  const liabilities = num(t?.liabilities);
  const equity = num(t?.equity);
  const revenue = num(t?.revenue);
  const expense = num(t?.expense);
  const result = revenue - expense; // سود/زیان انباشتهٔ دوره (normalSide-aware)
  const equityWithResult = equity + result;
  const rhs = liabilities + equityWithResult;
  const identityDiff = assets - rhs;

  const undated = await undatedPosted(uni);
  if (!data.rows.length && assets === 0 && liabilities === 0 && equity === 0
    && revenue === 0 && expense === 0) {
    return noMovementReport(title, `بازهٔ منتهی به ${asOfLabel}`);
  }

  const byType = new Map<string, { code: string; name: string; amount: number }[]>();
  for (const a of data.rows) {
    const key = String(a.type ?? '');
    const list = byType.get(key) ?? [];
    list.push({ code: String(a.code ?? ''), name: String(a.name ?? '—'), amount: num(a.amount) });
    byType.set(key, list);
  }
  const rows: StatementRow[] = [];
  const pushSection = (head: string, type: string, totalLabel: string, total: number) => {
    rows.push({ label: `── ${head} ──`, value: null, kind: 'HEAD' });
    const list = byType.get(type) ?? [];
    for (const a of list.slice(0, SECTION_CAP)) {
      rows.push({
        label: a.name,
        value: a.amount,
        kind: 'ITEM',
        note: a.code ? `کد حساب: ${faNum(a.code)}` : '',
      });
    }
    if (list.length > SECTION_CAP) {
      rows.push({
        label: '… حساب‌های دیگر این بخش',
        value: null,
        kind: 'ITEM',
        note: `نمایش ${faAmount(SECTION_CAP)} از ${faAmount(list.length)}`,
      });
    }
    rows.push({
      label: totalLabel,
      value: total,
      kind: 'TOTAL',
      note: list.length ? cappedNote(Math.min(list.length, SECTION_CAP), list.length) : '',
    });
  };

  pushSection('دارایی‌ها', 'ASSET', 'جمع دارایی‌ها', assets);
  pushSection('بدهی‌ها', 'LIABILITY', 'جمع بدهی‌ها', liabilities);

  rows.push({ label: '── حقوق صاحبان سهام/سرمایه ──', value: null, kind: 'HEAD' });
  const equityList = byType.get('EQUITY') ?? [];
  for (const a of equityList.slice(0, SECTION_CAP)) {
    rows.push({
      label: a.name,
      value: a.amount,
      kind: 'ITEM',
      note: a.code ? `کد حساب: ${faNum(a.code)}` : '',
    });
  }
  if (equityList.length > SECTION_CAP) {
    rows.push({
      label: '… حساب‌های دیگر این بخش',
      value: null,
      kind: 'ITEM',
      note: `نمایش ${faAmount(SECTION_CAP)} از ${faAmount(equityList.length)}`,
    });
  }
  rows.push({
    label: 'سود/زیان انباشتهٔ دوره (درآمد − هزینه)',
    value: result,
    kind: 'ITEM',
    note: `درآمد ${money(revenue)} − هزینه ${money(expense)}`,
  });
  rows.push({
    label: 'جمع حقوق صاحبان سهام (با سود/زیان دوره)',
    value: equityWithResult,
    kind: 'TOTAL',
    note: `سرمایه ${money(equity)} + سود/زیان دوره ${money(result)}`,
  });

  rows.push({ label: 'جمع بدهی‌ها و حقوق صاحبان سهام', value: rhs, kind: 'TOTAL' });
  rows.push({ label: '── کنترل این‌همانی ──', value: null, kind: 'HEAD' });

  if (identityDiff === 0) {
    rows.push({
      label: '✓ این‌همانی برقرار است: دارایی = بدهی + حقوق صاحبان سهام + سود/زیان دوره',
      value: identityDiff,
      kind: 'TOTAL',
      note: 'اختلاف صفر است',
    });
  } else {
    rows.push({
      label: '✗ اختلاف این‌همانی ترازنامه',
      value: identityDiff,
      kind: 'TOTAL',
      note: 'دارایی − (بدهی + حقوق صاحبان سهام + سود/زیان دوره)؛ باید صفر باشد',
    });
  }

  const summary =
    `تا پایان ${asOfLabel} — دارایی ${faAmount(assets)} · بدهی ${faAmount(liabilities)} · `
    + `حقوق صاحبان سهام ${faAmount(equity)} · سود/زیان دوره ${faAmount(result)} ریال`
    + (identityDiff === 0
      ? ' · ✓ تراز است'
      : ` · ✗ اختلاف ${faAmount(Math.abs(identityDiff))} ریال (${identityDiff > 0 ? 'دارایی بیشتر' : 'بدهی و سرمایه بیشتر'})`)
    + (undated > 0 ? ` · ${faNum(undated)} سند بدون تاریخ کنار گذاشته شد` : '')
    + asOfNote;

  return statement(rows, summary);
}

// ══════════════════════════════════════════════════════════════════════
//  ۳) صورت سود و زیان — درآمدها، کاهنده‌ها، هزینه‌ها، سود/زیان دوره
// ══════════════════════════════════════════════════════════════════════
async function incomeStatement(uni: number, f: ReportFilters): Promise<ReportResult> {
  const title = 'صورت سود و زیان';
  if (!(await ledgerHasVouchers(uni))) return emptyLedgerReport(title);

  const range = await resolveTerm(uni, f.term);
  if (range.kind === 'missing') return missingTermReport(title, range);
  const where = postedWhere(uni, range);

  const [data, totals] = await Promise.all([
    db.execute<{
      type: string | null; side: string; code: string | null; name: string | null;
      amount: string;
    }>(sql`
      SELECT a.type AS type, ${SIDE_EXPR} AS side, a.code AS code, a.name AS name,
             COALESCE(SUM(${SIGNED}), 0)::bigint AS amount
      FROM gl_voucher_lines l
      JOIN gl_vouchers v ON v.id = l."voucherId"
      JOIN gl_accounts a ON a.id = l."accountId"
      WHERE ${where} AND a.type IN ('REVENUE', 'EXPENSE')
      GROUP BY a.id, a.type, a.code, a.name, ${SIDE_EXPR}
      HAVING COALESCE(SUM(l.debit), 0) <> 0 OR COALESCE(SUM(l.credit), 0) <> 0
      ORDER BY a.type, a.code, a.id
    `),
    db.execute<{ revenue: string; contra: string; expense: string }>(sql`
      SELECT
        COALESCE(SUM(${SIGNED}) FILTER (WHERE a.type = 'REVENUE' AND ${SIDE_EXPR} = 'CREDIT'), 0)::bigint AS revenue,
        COALESCE(SUM(${SIGNED}) FILTER (WHERE a.type = 'REVENUE' AND ${SIDE_EXPR} = 'DEBIT'), 0)::bigint AS contra,
        COALESCE(SUM(${SIGNED}) FILTER (WHERE a.type = 'EXPENSE'), 0)::bigint AS expense
      FROM gl_voucher_lines l
      JOIN gl_vouchers v ON v.id = l."voucherId"
      JOIN gl_accounts a ON a.id = l."accountId"
      WHERE ${where}
    `),
  ]);

  const revenue = num(totals.rows[0]?.revenue);
  const contra = num(totals.rows[0]?.contra);
  const expense = num(totals.rows[0]?.expense);
  const result = revenue - contra - expense;

  if (!data.rows.length && revenue === 0 && contra === 0 && expense === 0) {
    return noMovementReport(title, range.label);
  }

  const revenueAccounts = data.rows.filter((a) => a.type === 'REVENUE' && a.side === 'CREDIT');
  const contraAccounts = data.rows.filter((a) => a.type === 'REVENUE' && a.side !== 'CREDIT');
  const expenseAccounts = data.rows.filter((a) => a.type === 'EXPENSE');

  const rows: StatementRow[] = [];

  rows.push({ label: '── درآمدها ──', value: null, kind: 'HEAD' });
  if (!revenueAccounts.length) {
    rows.push({ label: 'درآمدی در این دوره ثبت نشده است', value: null, kind: 'ITEM' });
  }
  for (const a of revenueAccounts.slice(0, SECTION_CAP)) {
    rows.push({
      label: String(a.name ?? '—'),
      value: num(a.amount),
      kind: 'ITEM',
      note: a.code ? `کد حساب: ${faNum(String(a.code))}` : '',
    });
  }
  if (revenueAccounts.length > SECTION_CAP) {
    rows.push({
      label: '… حساب‌های درآمدی دیگر',
      value: null,
      kind: 'ITEM',
      note: `نمایش ${faAmount(SECTION_CAP)} از ${faAmount(revenueAccounts.length)}`,
    });
  }
  rows.push({
    label: 'جمع درآمدها',
    value: revenue,
    kind: 'TOTAL',
    note: cappedNote(Math.min(revenueAccounts.length, SECTION_CAP), revenueAccounts.length),
  });

  rows.push({ label: '── کاهنده‌ها (حساب‌های بدهکارِ درآمد) ──', value: null, kind: 'HEAD' });
  if (!contraAccounts.length) {
    rows.push({
      label: 'حساب کاهندهٔ درآمد گردشی ندارد',
      value: null,
      kind: 'ITEM',
      note: 'حساب‌های درآمدیِ بدهکار (مانند ۴۱۰۱) در این دوره ردیفی ندارند.',
    });
  }
  for (const a of contraAccounts.slice(0, SECTION_CAP)) {
    rows.push({
      label: String(a.name ?? '—'),
      value: -num(a.amount), // کاهنده ⇒ با علامت منفی نمایش داده می‌شود
      kind: 'ITEM',
      note: `${a.code ? `کد حساب: ${faNum(String(a.code))} · ` : ''}بدهکار در برابر درآمد`,
    });
  }
  if (contraAccounts.length > SECTION_CAP) {
    rows.push({
      label: '… حساب‌های کاهندهٔ دیگر',
      value: null,
      kind: 'ITEM',
      note: `نمایش ${faAmount(SECTION_CAP)} از ${faAmount(contraAccounts.length)}`,
    });
  }
  rows.push({
    label: 'جمع کاهنده‌ها',
    value: -contra,
    kind: 'TOTAL',
    note: cappedNote(Math.min(contraAccounts.length, SECTION_CAP), contraAccounts.length),
  });

  rows.push({ label: '── هزینه‌ها ──', value: null, kind: 'HEAD' });
  if (!expenseAccounts.length) {
    rows.push({ label: 'هزینه‌ای در این دوره ثبت نشده است', value: null, kind: 'ITEM' });
  }
  for (const a of expenseAccounts.slice(0, SECTION_CAP)) {
    rows.push({
      label: String(a.name ?? '—'),
      value: -num(a.amount), // هزینه ⇒ کاهندهٔ سود، با علامت منفی
      kind: 'ITEM',
      note: a.code ? `کد حساب: ${faNum(String(a.code))}` : '',
    });
  }
  if (expenseAccounts.length > SECTION_CAP) {
    rows.push({
      label: '… حساب‌های هزینه‌ای دیگر',
      value: null,
      kind: 'ITEM',
      note: `نمایش ${faAmount(SECTION_CAP)} از ${faAmount(expenseAccounts.length)}`,
    });
  }
  rows.push({
    label: 'جمع هزینه‌ها',
    value: -expense,
    kind: 'TOTAL',
    note: cappedNote(Math.min(expenseAccounts.length, SECTION_CAP), expenseAccounts.length),
  });

  rows.push({
    label: result >= 0 ? 'سود دوره' : 'زیان دوره',
    value: result,
    kind: 'TOTAL',
    note: `درآمد ${money(revenue)} − کاهنده ${money(contra)} − هزینه ${money(expense)}`,
  });

  const summary =
    `دورهٔ ${range.label} — درآمد ${faAmount(revenue)} · کاهنده ${faAmount(contra)} · `
    + `هزینه ${faAmount(expense)} ریال · ${result >= 0 ? 'سود' : 'زیان'} دوره ${faAmount(Math.abs(result))} ریال`
    + cappedNote(
      Math.min(revenueAccounts.length, SECTION_CAP) + Math.min(contraAccounts.length, SECTION_CAP)
        + Math.min(expenseAccounts.length, SECTION_CAP),
      revenueAccounts.length + contraAccounts.length + expenseAccounts.length,
    );

  return statement(rows, summary);
}

// ══════════════════════════════════════════════════════════════════════

export async function run(kind: string, f: ReportFilters): Promise<ReportResult | null> {
  if (kind !== 'gl-trial-balance' && kind !== 'gl-balance-sheet' && kind !== 'gl-income-statement') {
    return null;
  }
  await requireRole(ROLES);

  const uni = Number(f.universityId);
  // 🔒 fail-closed: بدونِ دانشگاهِ معتبر شرطِ دانشگاه حذف نمی‌شود، بلکه «هیچ»
  //    برمی‌گردد. هیچ‌کدام از کوئری‌های این فایل شرطِ دانشگاهِ اختیاری ندارند.
  if (!isRealUniversityId(uni)) {
    return statement(
      [{
        label: 'دانشگاه فعال مشخص نیست',
        value: null,
        kind: 'ITEM',
        note: 'گزارش‌های دفتر کل فقط با دانشگاهِ فعالِ معتبر اجرا می‌شوند.',
      }],
      'دانشگاه فعال شما مشخص نیست؛ اجرای گزارش ممکن نیست.',
    );
  }

  if (kind === 'gl-trial-balance') return trialBalance(uni, f);
  if (kind === 'gl-balance-sheet') return balanceSheet(uni, f);
  return incomeStatement(uni, f);
}
