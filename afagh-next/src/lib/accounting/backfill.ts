import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════
 *  پرکردنِ تاریخچه‌ایِ دفترِ کل از student_ledger + تطبیقِ (reconciliation)
 *
 *  چرا این ماژول؟
 *  ▸ ۶۹۲٬۹۲۷ ردیف در student_ledger داریم و هیچ سندِ حسابداریِ دوبلی برای
 *    آن‌ها وجود ندارد. برای این‌که «ترازنامه» واقعی باشد باید از همان تاریخچه
 *    یک دفترِ کلِ متوازن بسازیم: **یک سند به‌ازای هر ردیفِ دفتر**، بدهکار/
 *    بستانکار از gl_posting_rules.
 *
 *  قراردادهای سخت:
 *  ▸ idempotent: کلیدِ یکتایی همان sourceRef = 'ledger:' || id است
 *    (uq_gl_vouchers_source_ref). اجرای دوباره → DUPLICATE → no-op.
 *  ▸ هیچ‌وقت OFFSET: صفحه‌بندی keyset روی student_ledger.id؛ حافظه ثابت
 *    حتی برای میلیون‌ها ردیف.
 *  ▸ هیچ‌وقت DELETE/UPDATE روی student_ledger — این ماژول فقط می‌خواند.
 *  ▸ همهٔ کوئری‌ها universityId-محور هستند و هیچ شرطِ NULL-پسندی ندارند
 *    (ردیف‌های بدونِ دانشگاه از دامنه خارج‌اند — عمداً).
 *  ▸ منطقِ بدهکار/بستانکار این‌جا **تکرار نمی‌شود**؛ ثبتِ واقعی با
 *    postLedgerRow انجام می‌شود. فقط مسیرِ dryRun قاعده و کدینگ را
 *    می‌خواند و جمعِ دو طرف را مقایسه می‌کند (بدونِ هیچ نوشتنی).
 *  ▸ پول همیشه ریال و numeric(18,0) — همین قرارداد در اسکیما ۰۱۴۲.
 * ══════════════════════════════════════════════════════════════════════
 */
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { createLogger } from '@/lib/logger';
import { ensureDefaultChart } from '@/lib/accounting/accounts';
import { postLedgerRow } from '@/lib/accounting/posting';

const log = createLogger({ mod: 'gl-backfill' });

// ── پیش‌فرض‌ها و سقف‌های ایمنی ─────────────────────────────────────────
const DEFAULT_BATCH_SIZE = 1_000;
const MAX_BATCH_SIZE = 5_000;
const DEFAULT_MAX_ROWS = 200_000;
const HARD_MAX_ROWS = 5_000_000;
/** حداکثر نمونهٔ خطا در خروجی — برای تشخیصِ الگو کافی است، برای لاگ سنگین نه. */
const SAMPLE_LIMIT = 20;
/** هر چند بچ یک خط پیشرفت لاگ شود (۶۹۲ هزار ردیف = ~۷۰۰ خط، نه ۷۰۰ هزار). */
const PROGRESS_EVERY_BATCHES = 10;
/**
 * سقفِ هم‌زمانیِ فراخوانیِ postLedgerRow در هر بچ.
 * پیش‌فرض ۱ (ترتیبی) است چون تخصیصِ voucherNo در لایهٔ ثبت ممکن است
 * وابسته به ترتیب باشد؛ اگر آن لایه اتمیک/قابل‌هم‌زمانی بود، با
 * GL_BACKFILL_CONCURRENCY می‌توان تا ۸ بالا برد (بازاجرا همیشه امن است).
 */
const MAX_CONCURRENCY = 8;

export type BackfillOptions = {
  universityId: number;
  /** 'YYYY-MM-DD' شامل — روی student_ledger."createdAt"::date */
  fromVoucherDate?: string;
  toVoucherDate?: string;
  /** فیلترِ نیمسال از راه student_ledger."termId" → academic_terms."termCode" */
  termCode?: string;
  /** پیش‌فرض true — هیچ نوشتنی انجام نمی‌شود */
  dryRun?: boolean;
  /** پیش‌فرض ۱۰۰۰ */
  batchSize?: number;
  /** سقفِ ایمنیِ تعداد ردیفِ اسکن‌شده — پیش‌فرض ۲۰۰٬۰۰۰ */
  maxRows?: number;
};

export type BackfillResult = {
  scanned: number;
  posted: number;
  skipped: number;
  failed: number;
  unmatchedTypes: Array<{ transactionType: string; rows: number }>;
  /** حداکثر ۲۰ مورد */
  samples: Array<{ ledgerId: number; error: string }>;
  durationMs: number;
};

export type Reconciliation = {
  ledgerRows: number;
  postedVouchers: number;
  unmatchedLedgerRows: number;
  unbalancedVouchers: number;
  closedPeriodViolations: number;
  duplicateSourceRefs: number;
};

// ══════════════════════════════════════════════════════════════════════
//  انواعِ داخلی
// ══════════════════════════════════════════════════════════════════════

/** همان ستون‌هایی که postLedgerRow لازم دارد (به‌علاوهٔ description). */
type LedgerRow = {
  id: number;
  studentId: number | null;
  termId: number | null;
  transactionType: string;
  amount: string | number | null;
  createdAt: Date | string;
  description: string | null;
};

type PostingRule = { debitAccountCode: string; creditAccountCode: string };
type AccountInfo = { id: number; isActive: boolean; isPostable: boolean };

type BatchFilters = {
  from: string | null;
  to: string | null;
  termCode: string | null;
};

type Stats = {
  scanned: number;
  posted: number;
  skipped: number;
  failed: number;
  /** تفکیکِ داخلیِ skipped (در خروجی یک عدد است، در لاگ جدا می‌آید) */
  zeroAmount: number;
  duplicates: number;
  closedPeriods: number;
  unbalanced: number;
  /** جمعِ دو طرف — فقط برای dryRun و گزارشِ توازن */
  debitSum: number;
  creditSum: number;
};

// ══════════════════════════════════════════════════════════════════════
//  کمکی‌ها (خالص، بدونِ DB)
// ══════════════════════════════════════════════════════════════════════

/** شناسهٔ دانشگاه را نرمال می‌کند تا هرگز با NaN به دیتابیس نرویم. */
function requireUniversityId(universityId: number): number {
  const uid = Number(universityId);
  if (!Number.isInteger(uid) || uid <= 0) {
    throw new Error('شناسهٔ دانشگاه نامعتبر است.');
  }
  return uid;
}

/** عددِ مثبتِ صحیح با سقف؛ مقدارِ خالی/صفر/منفی → پیش‌فرض. */
function clampPositive(value: unknown, max: number, fallback: number): number {
  if (value == null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.trunc(n), max);
}

/** 'YYYY-MM-DD' را اعتبارسنجی می‌کند و عیناً برمی‌گرداند (خطای فارسی). */
function normalizeIsoDate(value: string, label: string): string {
  const s = String(value ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`${label} باید به شکل YYYY-MM-DD باشد.`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== mo - 1 ||
    probe.getUTCDate() !== d
  ) {
    throw new Error(`${label} یک تاریخِ معتبر نیست.`);
  }
  return s;
}

/**
 * تاریخ را YYYY-MM-DD می‌کند.
 * برای Date از تقویمِ محلیِ سرور استفاده می‌کنیم (نه UTC) تا با
 * toIsoDate در accounts.ts و تاریخِ سندِ لایهٔ ثبت یکسان بماند.
 */
function toIsoDate(input: Date | string): string {
  if (typeof input === 'string') {
    const s = input.trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const parsed = new Date(s);
    if (!Number.isFinite(parsed.getTime())) throw new Error('تاریخ نامعتبر است.');
    return toIsoDate(parsed);
  }
  if (!(input instanceof Date) || !Number.isFinite(input.getTime())) {
    throw new Error('تاریخ نامعتبر است.');
  }
  const y = input.getFullYear();
  const mo = String(input.getMonth() + 1).padStart(2, '0');
  const d = String(input.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/** عنوانِ دورهٔ مالی = YYYY-MM میلادی (همان قالبِ ensurePeriod). */
function monthTitle(input: Date | string): string | null {
  try {
    return toIsoDate(input).slice(0, 7);
  } catch {
    return null;
  }
}

/** numeric(18,0) از pg به‌صورت رشته می‌آید؛ null/نامعتبر → null. */
function toAmount(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** نامِ نوعِ تراکنش برای گزارشِ unmatchedTypes — هرگز تهی نمی‌ماند. */
function typeLabel(transactionType: unknown): string {
  const s = String(transactionType ?? '').trim();
  return s || '(بدون نوع)';
}

function pushSample(
  samples: Array<{ ledgerId: number; error: string }>,
  ledgerId: number,
  error: string,
): void {
  if (samples.length >= SAMPLE_LIMIT) return;
  samples.push({ ledgerId, error: error || 'خطای نامشخص در ثبت سند.' });
}

function countOf(res: any): number {
  const v = Number((res?.rows ?? [])[0]?.c ?? 0);
  return Number.isFinite(v) ? v : 0;
}

/** شمارندهٔ هم‌زمانی — پیش‌فرض ۱ (ترتیبی) و سقفِ سختِ ۸. */
function resolveConcurrency(): number {
  const raw = Number(process.env.GL_BACKFILL_CONCURRENCY);
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.min(Math.trunc(raw), MAX_CONCURRENCY);
}

/** اجرای ترتیبی یا با هم‌زمانیِ محدود؛ هرگز همهٔ وعده‌ها را یک‌جا باز نمی‌کند. */
async function eachWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (limit <= 1 || items.length <= 1) {
    for (const item of items) await fn(item);
    return;
  }
  let cursor = 0;
  const width = Math.min(limit, items.length);
  const workers = Array.from({ length: width }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      await fn(items[index] as T);
    }
  });
  await Promise.all(workers);
}

// ══════════════════════════════════════════════════════════════════════
//  خواندن‌های DB (همه universityId-محور)
// ══════════════════════════════════════════════════════════════════════

/**
 * شرطِ مشترکِ student_ledger — یک‌جا ساخته می‌شود تا کوئریِ «نقطهٔ شروع»
 * و کوئریِ بچ دقیقاً یک فیلتر داشته باشند (بدونِ واگرایی).
 */
function ledgerWhere(universityId: number, lastId: number, filters: BatchFilters) {
  const where = [
    sql`sl."universityId" = ${universityId}`,
    sql`sl.id > ${lastId}`,
  ];
  const from = filters.from;
  const to = filters.to;
  const termCode = filters.termCode;
  if (from) where.push(sql`sl."createdAt"::date >= ${from}::date`);
  if (to) where.push(sql`sl."createdAt"::date <= ${to}::date`);
  if (termCode) {
    // academic_terms هم universityId-محور است تا هیچ ترمِ دانشگاهِ دیگر وارد نشود.
    where.push(sql`sl."termId" IN (
      SELECT t.id FROM academic_terms t
       WHERE t."universityId" = ${universityId}
         AND t."termCode" = ${termCode}
    )`);
  }
  return sql.join(where, sql` AND `);
}

/**
 * کوچک‌ترین idِ منطبق با فیلتر — نقطهٔ شروعِ keyset.
 * بدونِ این، اجرای «فقط نیمسالِ X» از id=1 شروع می‌کرد و کلِ جدول را
 * برای رسیدن به ردیف‌های آن نیمسال می‌خواند.
 */
async function firstMatchingLedgerId(
  universityId: number,
  filters: BatchFilters,
): Promise<number | null> {
  const res: any = await db.execute(sql`
    SELECT sl.id
      FROM student_ledger sl
     WHERE ${ledgerWhere(universityId, 0, filters)}
     ORDER BY sl.id
     LIMIT 1
  `);
  const row = (res?.rows ?? [])[0];
  return row ? Number(row.id) : null;
}

/**
 * یک بچ از student_ledger با keyset:
 *   WHERE "universityId" = $uid AND id > $last … ORDER BY id LIMIT $n
 * هیچ OFFSET و هیچ SELECT * ای در کار نیست.
 */
async function fetchLedgerBatch(
  universityId: number,
  lastId: number,
  limit: number,
  filters: BatchFilters,
): Promise<LedgerRow[]> {
  const res: any = await db.execute(sql`
    SELECT sl.id,
           sl."studentId",
           sl."termId",
           sl."transactionType",
           sl.amount,
           sl."createdAt",
           sl.description
      FROM student_ledger sl
     WHERE ${ledgerWhere(universityId, lastId, filters)}
     ORDER BY sl.id
     LIMIT ${limit}
  `);
  return ((res?.rows ?? []) as LedgerRow[]).map((r) => ({
    id: Number(r.id),
    studentId: r.studentId == null ? null : Number(r.studentId),
    termId: r.termId == null ? null : Number(r.termId),
    transactionType: String(r.transactionType ?? ''),
    amount: r.amount,
    createdAt: r.createdAt,
    description: r.description == null ? null : String(r.description),
  }));
}

/**
 * قواعدِ فعالِ ثبت + کدینگ، هر کدام یک کوئری برای کلِ دانشگاه.
 * این کشِ کوچک (<۱۰۰ ردیف) جایگزینِ SELECT به‌ازای هر ردیفِ دفتر است.
 */
async function loadRulesAndAccounts(universityId: number): Promise<{
  rules: Map<string, PostingRule>;
  accounts: Map<string, AccountInfo>;
}> {
  const [rulesRes, accountsRes]: any[] = await Promise.all([
    db.execute(sql`
      SELECT "eventKey", "debitAccountCode", "creditAccountCode"
        FROM gl_posting_rules
       WHERE "universityId" = ${universityId}
         AND "isActive" = 1
    `),
    db.execute(sql`
      SELECT code, id, "isActive", "isPostable"
        FROM gl_accounts
       WHERE "universityId" = ${universityId}
    `),
  ]);

  const rules = new Map<string, PostingRule>();
  for (const r of (rulesRes?.rows ?? []) as any[]) {
    rules.set(String(r.eventKey), {
      debitAccountCode: String(r.debitAccountCode),
      creditAccountCode: String(r.creditAccountCode),
    });
  }

  const accounts = new Map<string, AccountInfo>();
  for (const a of (accountsRes?.rows ?? []) as any[]) {
    accounts.set(String(a.code), {
      id: Number(a.id),
      isActive: Number(a.isActive) === 1,
      isPostable: Number(a.isPostable) === 1,
    });
  }

  return { rules, accounts };
}

/** عنوانِ دوره‌های بسته — فقط برای پیش‌بینیِ dryRun (یک کوئری). */
async function loadClosedPeriodTitles(universityId: number): Promise<Set<string>> {
  const res: any = await db.execute(sql`
    SELECT title
      FROM gl_periods
     WHERE "universityId" = ${universityId}
       AND status = 'CLOSED'
  `);
  return new Set(((res?.rows ?? []) as any[]).map((r) => String(r.title)));
}

/**
 * برای dryRun: کدام ردیف‌های همین بازهٔ شناسه از قبل سند دارند؟
 * sourceRef = 'ledger:' || id است، پس با بازهٔ [minId, maxId] و فیلترِ
 * regex (سازگار با ایندکس (universityId, source, sourceRef)) خوانده می‌شود —
 * بدونِ آرایهٔ هزارعضوی و بدونِ کوئری per-row.
 */
async function existingSourceRefsInRange(
  universityId: number,
  minId: number,
  maxId: number,
): Promise<Set<string>> {
  const res: any = await db.execute(sql`
    SELECT "sourceRef"
      FROM gl_vouchers
     WHERE "universityId" = ${universityId}
       AND source IN ('LEDGER', 'BACKFILL')
       AND "sourceRef" LIKE 'ledger:%'
       AND "sourceRef" ~ '^ledger:[0-9]+$'
       AND substring("sourceRef" from 8)::integer BETWEEN ${minId} AND ${maxId}
  `);
  return new Set(((res?.rows ?? []) as any[]).map((r) => String(r.sourceRef)));
}

// ══════════════════════════════════════════════════════════════════════
//  هستهٔ backfill
// ══════════════════════════════════════════════════════════════════════

/**
 * بازسازیِ دفترِ کل از student_ledger.
 *
 * جریانِ کار:
 *   ۱) اعتبارسنجیِ گزینه‌ها و ساختِ فیلترها (تاریخ/نیمسال)
 *   ۲) dryRun? فقط خواندنِ قاعده/کدینگ/دوره : ensureDefaultChart (idempotent)
 *   ۳) حلقهٔ keyset روی id؛ هر بچ یک SELECT و سپس پردازش
 *   ۴) ثبتِ واقعی با postLedgerRow(row, undefined, { source: 'BACKFILL' })
 *
 * رفتارِ خطاها (هیچ خطایی اجرا را قطع نمی‌کند — فقط خطای زیرساخت):
 *   ▸ DUPLICATE      → skipped (اجرای دوباره = no-op)
 *   ▸ PERIOD_CLOSED  → skipped + شمارشِ جدا (پس از بازکردنِ دوره با اجرای دوباره ثبت می‌شود)
 *   ▸ NO_ACCOUNT     → failed + unmatchedTypes
 *   ▸ INVALID/UNBALANCED/نامشخص → failed + نمونه (حداکثر ۲۰)
 *   ▸ استثنا          → failed + نمونه، ادامهٔ حلقه
 */
export async function rebuildGlFromLedger(opts: BackfillOptions): Promise<BackfillResult> {
  const startedAt = Date.now();
  const universityId = requireUniversityId(opts.universityId);
  const dryRun = opts.dryRun !== false;
  const batchSize = clampPositive(opts.batchSize, MAX_BATCH_SIZE, DEFAULT_BATCH_SIZE);
  const maxRows = clampPositive(opts.maxRows, HARD_MAX_ROWS, DEFAULT_MAX_ROWS);
  const from = opts.fromVoucherDate ? normalizeIsoDate(opts.fromVoucherDate, 'تاریخِ شروع') : null;
  const to = opts.toVoucherDate ? normalizeIsoDate(opts.toVoucherDate, 'تاریخِ پایان') : null;
  if (from && to && from > to) {
    throw new Error('بازهٔ تاریخ نامعتبر است: تاریخِ شروع بعد از تاریخِ پایان است.');
  }
  const termCode = opts.termCode?.trim() ? opts.termCode.trim() : null;
  const filters: BatchFilters = { from, to, termCode };

  const stats: Stats = {
    scanned: 0,
    posted: 0,
    skipped: 0,
    failed: 0,
    zeroAmount: 0,
    duplicates: 0,
    closedPeriods: 0,
    unbalanced: 0,
    debitSum: 0,
    creditSum: 0,
  };
  const unmatched = new Map<string, number>();
  const samples: Array<{ ledgerId: number; error: string }> = [];

  log.info('gl_backfill_start', {
    universityId,
    dryRun,
    batchSize,
    maxRows,
    fromVoucherDate: from,
    toVoucherDate: to,
    termCode,
  });

  // ── آماده‌سازی ──
  // dryRun هرگز نمی‌نویسد؛ پس ensureDefaultChart (که INSERT می‌کند) صدا زده نمی‌شود.
  if (!dryRun) {
    try {
      await ensureDefaultChart(universityId);
    } catch (err) {
      log.error('gl_backfill_chart_failed', { universityId, err });
      throw new Error('آماده‌سازیِ کدینگِ حساب‌ها ناموفق بود؛ بازسازیِ دفتر کل انجام نشد.');
    }
  }

  const { rules, accounts } = await loadRulesAndAccounts(universityId);
  const closedTitles = dryRun ? await loadClosedPeriodTitles(universityId) : null;

  if (rules.size === 0) {
    log.warn('gl_backfill_no_rules', { universityId, dryRun });
  }
  if (accounts.size === 0) {
    log.warn('gl_backfill_no_chart', { universityId, dryRun });
  }

  const concurrency = dryRun ? 1 : resolveConcurrency();
  const recordUnmatched = (transactionType: unknown) => {
    bump(unmatched, typeLabel(transactionType));
  };

  // ── حلقهٔ keyset ──
  // نقطهٔ شروع: با فیلترِ تاریخ/نیمسال از کوچک‌ترین idِ منطبق شروع می‌کنیم
  // تا ابتدای جدول بیهوده اسکن نشود (بدونِ فیلتر: از id=0).
  let lastId = 0;
  if (from || termCode) {
    const first = await firstMatchingLedgerId(universityId, filters);
    if (first != null) lastId = first - 1;
  }
  let batchIndex = 0;

  while (stats.scanned < maxRows) {
    const limit = Math.min(batchSize, maxRows - stats.scanned);
    const rows = await fetchLedgerBatch(universityId, lastId, limit, filters);
    if (rows.length === 0) break;

    lastId = rows[rows.length - 1]!.id;
    stats.scanned += rows.length;
    batchIndex += 1;

    if (dryRun) {
      // ── مسیرِ خشک: همان اعتبارسنجی، بدونِ هیچ نوشتنی ──
      const firstId = rows[0]!.id;
      const lastIdInBatch = rows[rows.length - 1]!.id;
      const existing = await existingSourceRefsInRange(universityId, firstId, lastIdInBatch);

      for (const row of rows) {
        const amount = toAmount(row.amount);
        const txn = String(row.transactionType ?? '').trim();

        // ۱) ردیفِ صفر/تهی → هیچ سندی نمی‌سازد
        if (amount == null || amount === 0) {
          stats.skipped += 1;
          stats.zeroAmount += 1;
          continue;
        }

        // ۲) اجرای قبلی این ردیف را ثبت کرده است (idempotency)
        if (existing.has(`ledger:${row.id}`)) {
          stats.skipped += 1;
          stats.duplicates += 1;
          continue;
        }

        // ۳) قاعدهٔ ثبت
        const rule = rules.get(txn);
        if (!rule) {
          stats.failed += 1;
          recordUnmatched(txn);
          pushSample(samples, row.id, 'قاعدهٔ ثبت برای این نوع تراکنش تعریف نشده است.');
          continue;
        }

        // ۴) حلِ حساب‌ها از کشِ کدینگ (بدونِ SELECT per-row)
        const debit = accounts.get(rule.debitAccountCode);
        const credit = accounts.get(rule.creditAccountCode);
        if (
          !debit || !credit ||
          !debit.isActive || !credit.isActive ||
          !debit.isPostable || !credit.isPostable
        ) {
          stats.failed += 1;
          recordUnmatched(txn);
          pushSample(
            samples,
            row.id,
            'حسابِ بدهکار یا بستانکارِ این قاعده در کدینگ یافت نشد یا غیرفعال است.',
          );
          continue;
        }

        // ۵) دورهٔ بسته: ثبت نمی‌شود (مثلِ PERIOD_CLOSED در مسیرِ واقعی)
        const title = monthTitle(row.createdAt);
        if (closedTitles && title && closedTitles.has(title)) {
          stats.skipped += 1;
          stats.closedPeriods += 1;
          continue;
        }

        // ۶) مقایسهٔ جمعِ دو طرف — قاعده همیشه یک بدهکار و یک بستانکار
        //    به مبلغِ یکسان می‌سازد؛ اگر روزی چندردیفی شد، همین‌جا دیده می‌شود.
        const debitSum = amount;
        const creditSum = amount;
        if (debitSum !== creditSum) {
          stats.failed += 1;
          stats.unbalanced += 1;
          pushSample(samples, row.id, 'جمعِ بدهکار و بستانکارِ سند برابر نیست.');
          continue;
        }
        stats.debitSum += debitSum;
        stats.creditSum += creditSum;
        stats.posted += 1;
      }
    } else {
      // ── مسیرِ واقعی: ثبت با لایهٔ posting (بدونِ تکرارِ منطق) ──
      await eachWithConcurrency(rows, concurrency, async (row) => {
        const amount = toAmount(row.amount);
        const txn = String(row.transactionType ?? '').trim();

        if (amount == null || amount === 0) {
          stats.skipped += 1;
          stats.zeroAmount += 1;
          return;
        }

        // اگر جدولِ قواعد پر است و این نوع در آن نیست، فراخوانیِ posting
        // فقط یک رفت‌وبرگشتِ بی‌فایده است؛ همان‌جا failed + unmatched.
        // (اگر جدول خالی باشد این فیلتر خاموش است تا رفتارِ posting مرجع بماند.)
        if (rules.size > 0 && !rules.has(txn)) {
          stats.failed += 1;
          recordUnmatched(txn);
          pushSample(samples, row.id, 'قاعدهٔ ثبت برای این نوع تراکنش تعریف نشده است.');
          return;
        }

        try {
          const result = await postLedgerRow(
            {
              id: row.id,
              universityId,
              studentId: row.studentId,
              termId: row.termId,
              transactionType: txn,
              amount,
              createdAt: row.createdAt,
              description: row.description,
            },
            undefined,
            { source: 'BACKFILL' },
          );

          if (result.ok) {
            stats.posted += 1;
            stats.debitSum += amount;
            stats.creditSum += amount;
            return;
          }

          if (result.code === 'DUPLICATE') {
            stats.skipped += 1;
            stats.duplicates += 1;
            return;
          }

          if (result.code === 'PERIOD_CLOSED') {
            // دوره بسته است: چیزی نوشته نشد، ولی اجرا هم نباید متوقف شود.
            stats.skipped += 1;
            stats.closedPeriods += 1;
            return;
          }

          if (result.code === 'NO_ACCOUNT') {
            stats.failed += 1;
            recordUnmatched(txn);
            pushSample(samples, row.id, result.error || 'حسابِ متناظر در کدینگ یافت نشد.');
            return;
          }

          stats.failed += 1;
          pushSample(samples, row.id, result.error || 'ثبتِ سند ناموفق بود.');
        } catch (err: any) {
          stats.failed += 1;
          pushSample(samples, row.id, `خطای غیرمنتظره: ${String(err?.message ?? err)}`);
        }
      });
    }

    if (batchIndex % PROGRESS_EVERY_BATCHES === 0) {
      log.info('gl_backfill_progress', {
        universityId,
        dryRun,
        batchIndex,
        scanned: stats.scanned,
        posted: stats.posted,
        skipped: stats.skipped,
        failed: stats.failed,
        lastId,
      });
    }

    if (rows.length < limit) break;
  }

  const unmatchedTypes = [...unmatched.entries()]
    .map(([transactionType, rows]) => ({ transactionType, rows }))
    .sort((a, b) => b.rows - a.rows || a.transactionType.localeCompare(b.transactionType));

  const result: BackfillResult = {
    scanned: stats.scanned,
    posted: stats.posted,
    skipped: stats.skipped,
    failed: stats.failed,
    unmatchedTypes,
    samples: samples.slice(0, SAMPLE_LIMIT),
    durationMs: Date.now() - startedAt,
  };

  const level = stats.failed > 0 ? 'warn' : 'info';
  log[level](dryRun ? 'gl_backfill_dry_run_done' : 'gl_backfill_done', {
    universityId,
    dryRun,
    scanned: result.scanned,
    posted: result.posted,
    skipped: result.skipped,
    failed: result.failed,
    zeroAmount: stats.zeroAmount,
    duplicates: stats.duplicates,
    closedPeriods: stats.closedPeriods,
    unbalanced: stats.unbalanced,
    unmatchedTypes: unmatchedTypes.length,
    balanced: stats.debitSum === stats.creditSum,
    durationMs: result.durationMs,
    // سقفِ ایمنی: اگر true شد، اجرای بعدی با fromVoucherDate ادامه می‌دهد.
    truncated: stats.scanned >= maxRows,
  });

  return result;
}

// ══════════════════════════════════════════════════════════════════════
//  تطبیق (reconciliation)
// ══════════════════════════════════════════════════════════════════════

/**
 * سلامتِ دفترِ کل در برابرِ student_ledger — شش شمارشِ مستقل، هر کدام یک
 * کوئری (بدونِ N+1، بدونِ حلقهٔ JS). همه universityId-محور.
 *
 * معنا:
 *   ▸ ledgerRows               کلِ ردیف‌های دفترِ دانشجو (همهٔ زمان‌ها)
 *   ▸ postedVouchers           اسنادِ ثبت‌شده با منشأ LEDGER/BACKFILL
 *   ▸ unmatchedLedgerRows      ردیف‌هایی که هیچ سندی با sourceRef = 'ledger:'||id ندارند
 *   ▸ unbalancedVouchers       سندِ POSTED با totalDebit <> totalCredit (باید ۰ باشد)
 *   ▸ closedPeriodViolations   سندِ POSTED که دوره‌اش CLOSED است
 *   ▸ duplicateSourceRefs      گروه‌های (source, sourceRef) با بیش از یک سند (باید ۰ باشد)
 */
export async function glReconciliation(universityId: number): Promise<Reconciliation> {
  const uid = requireUniversityId(universityId);

  const [ledgerRes, postedRes, unmatchedRes, unbalancedRes, closedRes, dupRes]: any[] =
    await Promise.all([
      db.execute(sql`
        SELECT count(*)::bigint AS c
          FROM student_ledger sl
         WHERE sl."universityId" = ${uid}
      `),

      db.execute(sql`
        SELECT count(*)::bigint AS c
          FROM gl_vouchers v
         WHERE v."universityId" = ${uid}
           AND v.source IN ('LEDGER', 'BACKFILL')
      `),

      db.execute(sql`
        SELECT count(*)::bigint AS c
          FROM student_ledger sl
         WHERE sl."universityId" = ${uid}
           AND NOT EXISTS (
             SELECT 1
               FROM gl_vouchers v
              WHERE v."universityId" = sl."universityId"
                AND v.source IN ('LEDGER', 'BACKFILL')
                AND v."sourceRef" = 'ledger:' || sl.id::text
           )
      `),

      db.execute(sql`
        SELECT count(*)::bigint AS c
          FROM gl_vouchers v
         WHERE v."universityId" = ${uid}
           AND v.status = 'POSTED'
           AND v."totalDebit" <> v."totalCredit"
      `),

      db.execute(sql`
        SELECT count(*)::bigint AS c
          FROM gl_vouchers v
          JOIN gl_periods p ON p.id = v."periodId"
         WHERE v."universityId" = ${uid}
           AND v.status = 'POSTED'
           AND p."universityId" = v."universityId"
           AND p.status = 'CLOSED'
      `),

      db.execute(sql`
        SELECT count(*)::bigint AS c
          FROM (
            SELECT 1
              FROM gl_vouchers v
             WHERE v."universityId" = ${uid}
             GROUP BY v.source, v."sourceRef"
            HAVING count(*) > 1
          ) d
      `),
    ]);

  return {
    ledgerRows: countOf(ledgerRes),
    postedVouchers: countOf(postedRes),
    unmatchedLedgerRows: countOf(unmatchedRes),
    unbalancedVouchers: countOf(unbalancedRes),
    closedPeriodViolations: countOf(closedRes),
    duplicateSourceRefs: countOf(dupRes),
  };
}
