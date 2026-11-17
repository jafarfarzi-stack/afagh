import 'server-only';
/**
 * موتورِ ثبتِ سندِ حسابداریِ دوبل (دفترِ کل) — تولیدِ سند از رویدادهای مالی.
 *
 * این ماژول فقط «می‌نویسد»: کدینگ/قواعد/دوره را به‌صورت on-demand می‌سازد،
 * شمارهٔ سند را به‌صورتِ سریالی می‌دهد و سندِ متوازن را در یک تراکنش ثبت
 * می‌کند. اسکلتِ جدول‌ها در مهاجرت ۰۱۴۲ ساخته شده است.
 *
 * قراردادهای سخت:
 *   • پول همیشه ریال و عددِ صحیح؛ numeric(18,0) با رشتهٔ عددی نوشته می‌شود
 *     تا هیچ گردکردنِ اعشاری وارد دفتر نشود.
 *   • idempotency: `(universityId, source, sourceRef)` یکتاست؛ ثبتِ دوبارهٔ
 *     همان رویداد `DUPLICATE` برمی‌گرداند، نه استثنا (بازپرشی به آن تکیه می‌کند).
 *   • شمارهٔ سند پیوسته است: قفلِ advisory تراکنشی + MAX+1.
 *   • خطاهای کاربرمحور فقط فارسی‌اند؛ متنِ SQL هرگز به بیرون درز نمی‌کند و
 *     فقط در لاگ (پاک‌سازی‌شده) می‌ماند.
 *   • اگر `exec` داده شود، همان تراکنشِ فراخوان استفاده می‌شود و هیچ
 *     تراکنشِ تودرتویی باز نمی‌شود.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { createLogger } from '@/lib/logger';
import { ensureDefaultChart, resolveAccountId, ensurePeriod, periodStatus } from './accounts';
import { ensureDefaultRules, getRule } from './rules';
import { DEBT_LEDGER_TYPES, DISCOUNT_LEDGER_TYPES, PAID_LEDGER_TYPES } from '@/lib/ledger-balance';

const log = createLogger({ mod: 'gl-posting' });

// ══════════════════════════════════════════════════════════════════════
//  انواعِ عمومی
// ══════════════════════════════════════════════════════════════════════

/** یک ردیفِ سند — دقیقاً یکی از debit/credit باید بزرگ‌تر از صفر باشد. */
export type PostLine = {
  accountCode: string;
  debit?: number | string;
  credit?: number | string;
  description?: string;
  studentId?: number | null;
  termId?: number | null;
};

export type PostVoucherInput = {
  universityId: number;
  voucherDate: Date | string;
  description: string;
  source: 'LEDGER' | 'MANUAL' | 'OPENING' | 'PAYROLL' | 'EXPENSE' | 'CONTRACTOR' | 'BACKFILL';
  sourceRef: string;
  lines: PostLine[];
  createdByUserId?: number | null;
};

export type PostVoucherResult =
  | { ok: true; voucherId: number; voucherNo: number }
  | { ok: false; error: string; code?: 'INVALID' | 'UNBALANCED' | 'PERIOD_CLOSED' | 'DUPLICATE' | 'NO_ACCOUNT' };

type PostErrorCode = 'INVALID' | 'UNBALANCED' | 'PERIOD_CLOSED' | 'DUPLICATE' | 'NO_ACCOUNT';

/** فهرستِ مجازِ منبع — عیناً همان CHECKِ ck_gl_vouchers_source */
const SOURCE_VALUES = [
  'LEDGER',
  'MANUAL',
  'OPENING',
  'PAYROLL',
  'EXPENSE',
  'CONTRACTOR',
  'BACKFILL',
] as const;

// ══════════════════════════════════════════════════════════════════════
//  ابزارهای کوچک
// ══════════════════════════════════════════════════════════════════════

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'] as const;

/** ارقامِ لاتین → فارسی (برای پیام‌های کاربرمحور). */
function faNum(value: number | string): string {
  return String(value).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

/** مبلغ با جداکنندهٔ هزارگانِ فارسی: ۱٬۲۵۰٬۰۰۰ */
function money(amount: number): string {
  const grouped = Math.trunc(Number(amount) || 0).toLocaleString('en-US');
  return faNum(grouped).replace(/,/g, '٬');
}

/** بریدنِ امنِ رشته برای ستون‌های varchar — بدونِ تولیدِ خطای «too long». */
function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

function fail(code: PostErrorCode, error: string): PostVoucherResult {
  return { ok: false, error, code };
}

/** شناسهٔ اختیاری (دانشجو/ترم/کاربر): نامعتبر ⇒ null، نه خطا. */
function optionalId(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * مبلغِ ریالی → عددِ صحیحِ نامنفی.
 * undefined/null/رشتهٔ خالی ⇒ صفر (طرفِ مقابلِ ردیف). هر چیزِ دیگر (اعشاری،
 * منفی، NaN، متنی) ⇒ null تا فراخوان `INVALID` بدهد.
 */
function toRialAmount(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return 0;
  const n =
    typeof raw === 'number'
      ? raw
      : Number(String(raw).replace(/[,\u066C\u066B\s\u00A0]/g, ''));
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}

/**
 * تاریخ → YYYY-MM-DD میلادی (رشته) یا null.
 * مثلِ accounts.ts از تقویمِ محلیِ سرور استفاده می‌شود تا «امروزِ» محلی در
 * دورهٔ همان ماه بیفتد؛ تاریخِ ناموجود/نامعتبر رد می‌شود (بدونِ حدس).
 */
function normalizeDateValue(input: Date | string | null | undefined): string | null {
  if (input instanceof Date) {
    if (!Number.isFinite(input.getTime())) return null;
    const y = input.getFullYear();
    const m = String(input.getMonth() + 1).padStart(2, '0');
    const d = String(input.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const probe = new Date(y, mo - 1, d);
    if (probe.getFullYear() !== y || probe.getMonth() !== mo - 1 || probe.getDate() !== d) {
      return null;
    }
    return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const parsed = new Date(s);
  if (!Number.isFinite(parsed.getTime())) return null;
  return normalizeDateValue(parsed);
}

/** اگر `exec` داده شده باشد همان است (تراکنشِ فراخوان)؛ وگرنه تراکنشِ تازه. */
function runInTx<T>(exec: any, fn: (tx: any) => Promise<T>): Promise<T> {
  if (exec) return fn(exec);
  return (db as any).transaction((tx: any) => fn(tx));
}

/** وضعیت و عنوانِ دوره — با همان exec (داخلِ تراکنش قابلِ دیدن است). */
async function readPeriod(
  periodId: number,
  exec: any,
): Promise<{ status: 'OPEN' | 'CLOSED' | null; title: string }> {
  const res: any = await exec.execute(sql`
    SELECT status, title FROM gl_periods WHERE id = ${periodId} LIMIT 1
  `);
  const row = (res?.rows ?? [])[0];
  if (row) {
    const s = String(row.status ?? '').trim().toUpperCase();
    return {
      status: s === 'OPEN' || s === 'CLOSED' ? s : null,
      title: String(row.title ?? ''),
    };
  }
  // ردیف در همین exec دیده نشد (مسیرِ غیرِ تراکنشی) — کمکی از API عمومی
  return { status: await periodStatus(periodId), title: '' };
}

/** خطای یکتاییِ ایندکسِ source_ref — پشتیبانِ ON CONFLICT برای نسخه‌های قدیمی. */
function isDuplicateSourceRefError(err: any): boolean {
  if (String(err?.code ?? '') !== '23505') return false;
  const where = `${String(err?.constraint ?? '')} ${String(err?.detail ?? '')}`.toLowerCase();
  return where.includes('source_ref');
}

// ══════════════════════════════════════════════════════════════════════
//  اعتبارسنجی و نرمال‌سازیِ ردیف‌ها
// ══════════════════════════════════════════════════════════════════════

type NormalizedLine = {
  accountCode: string;
  debit: number;
  credit: number;
  description: string | null;
  studentId: number | null;
  termId: number | null;
};

type NormalizeLinesResult =
  | { ok: true; lines: NormalizedLine[]; totalDebit: number; totalCredit: number }
  | { ok: false; result: PostVoucherResult };

function normalizeLines(raw: PostLine[] | null | undefined): NormalizeLinesResult {
  if (!Array.isArray(raw) || raw.length < 2) {
    return { ok: false, result: fail('INVALID', 'سند باید دست‌کم دو ردیف داشته باشد.') };
  }

  const lines: NormalizedLine[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i];
    const label = faNum(i + 1);
    if (!item || typeof item !== 'object') {
      return { ok: false, result: fail('INVALID', `ردیفِ ${label} سند نامعتبر است.`) };
    }

    const accountCode = String(item.accountCode ?? '').trim();
    if (!accountCode) {
      return { ok: false, result: fail('INVALID', `ردیفِ ${label} کدِ حساب ندارد.`) };
    }

    const debit = toRialAmount(item.debit);
    const credit = toRialAmount(item.credit);
    if (debit === null || credit === null) {
      return {
        ok: false,
        result: fail('INVALID', `مبلغِ ردیفِ ${label} باید عددِ صحیحِ نامنفی (ریال) باشد.`),
      };
    }

    const hasDebit = debit > 0;
    const hasCredit = credit > 0;
    if (hasDebit === hasCredit) {
      return {
        ok: false,
        result: fail(
          'INVALID',
          `ردیفِ ${label} باید دقیقاً یک طرف (بدهکار یا بستانکار) و بزرگ‌تر از صفر داشته باشد.`,
        ),
      };
    }

    totalDebit += debit;
    totalCredit += credit;
    lines.push({
      accountCode,
      debit,
      credit,
      description: truncate(String(item.description ?? '').trim(), 200) || null,
      studentId: optionalId(item.studentId),
      termId: optionalId(item.termId),
    });
  }

  if (totalDebit !== totalCredit) {
    return {
      ok: false,
      result: fail(
        'UNBALANCED',
        `سند تراز نیست: جمعِ بدهکار ${money(totalDebit)} ریال و جمعِ بستانکار ${money(totalCredit)} ریال است.`,
      ),
    };
  }

  return { ok: true, lines, totalDebit, totalCredit };
}

// ══════════════════════════════════════════════════════════════════════
//  ثبتِ سند
// ══════════════════════════════════════════════════════════════════════

/**
 * ثبتِ یک سندِ متوازن.
 *
 * ترتیبِ کار (همه در یک تراکنش):
 *   ۱) اعتبارسنجیِ کاملِ ورودی (بدونِ هیچ نوشتنی)
 *   ۲) کدینگ + قواعدِ پیش‌فرض (idempotent) و تبدیلِ کدِ حساب به id
 *   ۳) دورهٔ مالیِ تاریخِ سند؛ بسته ⇒ PERIOD_CLOSED
 *   ۴) قفلِ advisory + شمارهٔ پیوسته
 *   ۵) درجِ سرسند با ON CONFLICT (uni, source, sourceRef) DO NOTHING
 *   ۶) درجِ همهٔ ردیف‌ها
 *
 * اگر `exec` داده شود، همهٔ این‌ها داخلِ همان تراکنش اجرا می‌شود. خطاهای
 * غیرمنتظره در حالتِ تراکنشِ فراخوان rethrow می‌شوند تا تراکنش abort شود
 * (خطای پاک‌سازی‌شده، بدونِ متنِ SQL).
 */
export async function postVoucher(input: PostVoucherInput, exec?: any): Promise<PostVoucherResult> {
  if (!input || typeof input !== 'object') {
    return fail('INVALID', 'اطلاعاتِ سند دریافت نشد.');
  }

  const uid = Number(input.universityId);
  if (!Number.isInteger(uid) || uid <= 0) {
    return fail('INVALID', 'شناسهٔ دانشگاه نامعتبر است.');
  }

  const iso = normalizeDateValue(input.voucherDate);
  if (!iso) return fail('INVALID', 'تاریخِ سند نامعتبر است.');

  const source = String(input.source ?? '').trim().toUpperCase();
  if (!(SOURCE_VALUES as readonly string[]).includes(source)) {
    return fail('INVALID', 'منبعِ سند نامعتبر است.');
  }

  const sourceRef = String(input.sourceRef ?? '').trim();
  if (!sourceRef) return fail('INVALID', 'مرجعِ سند خالی است.');
  if (sourceRef.length > 80) {
    return fail('INVALID', 'مرجعِ سند بیش از ۸۰ نویسه است و ثبت نشد.');
  }

  const headerDescription = truncate(String(input.description ?? '').trim(), 300) || 'سندِ حسابداری';
  const createdByUserId = optionalId(input.createdByUserId);

  const normalized = normalizeLines(input.lines);
  if (!normalized.ok) return normalized.result;
  const { lines, totalDebit, totalCredit } = normalized;

  try {
    return await runInTx(exec, async (tx) => {
      // ۲) زیرساختِ لازم: کدینگ و قواعدِ پیش‌فرض (هر دو idempotent)
      await ensureDefaultChart(uid, tx);
      await ensureDefaultRules(uid, tx);

      const accountIds = new Map<string, number>();
      const missing: string[] = [];
      const codes = Array.from(new Set(lines.map((l) => l.accountCode)));
      for (const code of codes) {
        const id = await resolveAccountId(uid, code, tx);
        if (id === null) missing.push(code);
        else accountIds.set(code, id);
      }
      if (missing.length > 0) {
        return fail(
          'NO_ACCOUNT',
          `حسابِ با کدِ «${missing.join('»، «')}» در کدینگِ این دانشگاه وجود ندارد؛ سند ثبت نشد.`,
        );
      }

      // ۳) دورهٔ مالی — سند در دورهٔ بسته ثبت نمی‌شود
      const periodId = await ensurePeriod(uid, iso, tx);
      const period = await readPeriod(periodId, tx);
      if (period.status === 'CLOSED') {
        const title = period.title || `#${faNum(periodId)}`;
        return fail(
          'PERIOD_CLOSED',
          `دورهٔ مالی «${title}» بسته است؛ سند در این دوره ثبت نمی‌شود.`,
        );
      }

      // ۴-۵) شمارهٔ پیوسته: قفلِ تراکنشیِ هر دانشگاه، سپس MAX+1
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`gl_voucher:${uid}`}))`);
      const seqRes: any = await tx.execute(sql`
        SELECT COALESCE(MAX("voucherNo"), 0) + 1 AS next
          FROM gl_vouchers
         WHERE "universityId" = ${uid}
      `);
      const voucherNo = Number((seqRes?.rows ?? [])[0]?.next ?? 1);
      if (!Number.isInteger(voucherNo) || voucherNo <= 0) {
        throw new Error('محاسبهٔ شمارهٔ سند نامعتبر بود.');
      }

      // درجِ سرسند — تضاد روی (دانشگاه، منبع، مرجع) یعنی «قبلاً ثبت شده»
      const headRes: any = await tx.execute(sql`
        INSERT INTO gl_vouchers (
          "universityId", "voucherNo", "voucherDate", "periodId", source, "sourceRef",
          description, status, "totalDebit", "totalCredit", "createdByUserId", "postedAt"
        )
        VALUES (
          ${uid}::integer,
          ${voucherNo}::bigint,
          ${iso}::date,
          ${periodId}::integer,
          ${source}::varchar,
          ${sourceRef}::varchar,
          ${headerDescription}::varchar,
          'POSTED',
          ${String(totalDebit)}::numeric,
          ${String(totalCredit)}::numeric,
          ${createdByUserId}::integer,
          now()
        )
        ON CONFLICT ("universityId", source, "sourceRef") DO NOTHING
        RETURNING id, "voucherNo"
      `);
      const inserted = (headRes?.rows ?? [])[0];
      if (!inserted) {
        return fail(
          'DUPLICATE',
          `سندی با همین منبع و مرجع («${sourceRef}») قبلاً ثبت شده است؛ ثبتِ دوباره انجام نشد.`,
        );
      }
      const voucherId = Number(inserted.id);

      // ۶) همهٔ ردیف‌ها در همان تراکنش
      const lineRows = lines.map((line) => {
        const accountId = accountIds.get(line.accountCode);
        if (!accountId) throw new Error('حسابِ ردیف در نقشهٔ حساب‌ها نبود.');
        return sql`(
          ${voucherId}::integer,
          ${accountId}::integer,
          ${String(line.debit)}::numeric,
          ${String(line.credit)}::numeric,
          ${line.description}::varchar,
          ${line.studentId}::integer,
          ${line.termId}::integer
        )`;
      });
      await tx.execute(sql`
        INSERT INTO gl_voucher_lines (
          "voucherId", "accountId", debit, credit, description, "studentId", "termId"
        )
        VALUES ${sql.join(lineRows, sql`, `)}
      `);

      return { ok: true as const, voucherId, voucherNo: Number(inserted.voucherNo ?? voucherNo) };
    });
  } catch (err: any) {
    // متنِ SQL فقط در لاگ می‌ماند (maskSecrets در logger) و هرگز به کاربر نمی‌رسد.
    log.error('post_voucher_failed', { err, universityId: uid, source, sourceRef });

    if (exec) {
      // تراکنشِ فراخوان باید abort شود؛ خطای پاک‌شده تا SQL به بیرون درز نکند.
      const safe = new Error('خطای داخلی در ثبتِ سند رخ داد؛ عملیات بازگردانده شد.');
      (safe as any).code = err?.code;
      throw safe;
    }

    // پشتیبانِ ON CONFLICT: اگر نسخه‌ای از ایندکس متفاوت بود، یکتاییِ مرجع
    // همچنان «تکراری» گزارش می‌شود، نه خطای داخلی.
    if (isDuplicateSourceRefError(err)) {
      return fail(
        'DUPLICATE',
        `سندی با همین منبع و مرجع («${sourceRef}») قبلاً ثبت شده است؛ ثبتِ دوباره انجام نشد.`,
      );
    }

    return {
      ok: false,
      error: 'خطای داخلی در ثبتِ سند رخ داد؛ هیچ تغییری ذخیره نشد. لطفاً با مدیرِ سامانه تماس بگیرید.',
    };
  }
}

// ══════════════════════════════════════════════════════════════════════
//  ثبتِ ردیفِ دفترِ مالیِ دانشجو
// ══════════════════════════════════════════════════════════════════════

export type PostLedgerRowOptions = { source?: 'LEDGER' | 'BACKFILL' };

const DEBT_TYPES: ReadonlySet<string> = new Set(DEBT_LEDGER_TYPES);
const DISCOUNT_TYPES: ReadonlySet<string> = new Set(DISCOUNT_LEDGER_TYPES);
const PAID_TYPES: ReadonlySet<string> = new Set(PAID_LEDGER_TYPES);

/**
 * یک ردیفِ `student_ledger` را به سندِ دوبل تبدیل می‌کند.
 *
 * قاعده از `gl_posting_rules` خوانده می‌شود؛ اگر نبود:
 *   • نوعِ «بدهیِ دانشجو»  ⇒ Dr 1101 / Cr 4001
 *   • نوعِ «تخفیف/اعتبار» ⇒ Dr 4101 / Cr 1101
 *   • نوعِ «پرداخت»        ⇒ Dr 1002 / Cr 1101
 *   • نوعِ کاملاً ناشناخته ⇒ NO_ACCOUNT (بدونِ نوشتن) تا بازپرشی آن را فهرست کند
 *
 * مبلغِ منفی (ردیفِ برگشتی) با جابه‌جاییِ دو طرف ثبت می‌شود تا اثرِ مالی
 * درست بماند (مثلاً پرداختِ منفی = Dr 1101 / Cr 1002).
 *
 * `sourceRef` = `ledger:<id>`؛ منبع پیش‌فرض `LEDGER` است و بازپرشی می‌تواند
 * با آرگومانِ اختیاریِ `{ source: 'BACKFILL' }` (سوم یا چهارم) عوضش کند.
 */
export async function postLedgerRow(
  row: {
    id: number;
    universityId: number;
    studentId?: number | null;
    termId?: number | null;
    transactionType: string;
    amount: number | string;
    createdAt: Date | string;
    description?: string | null;
  },
  exec?: any,
  arg3?: PostLedgerRowOptions | number | null,
  arg4?: PostLedgerRowOptions,
): Promise<PostVoucherResult> {
  // آرگومانِ سوم/چهارم: هم {source} و هم (برای سازگاری) شناسهٔ کاربر پذیرفته می‌شود.
  const opts: PostLedgerRowOptions | undefined =
    arg4 ?? (arg3 && typeof arg3 === 'object' ? arg3 : undefined);

  const uid = Number(row?.universityId);
  if (!Number.isInteger(uid) || uid <= 0) {
    return fail('INVALID', 'شناسهٔ دانشگاه نامعتبر است.');
  }

  const rowId = Number(row?.id);
  if (!Number.isInteger(rowId) || rowId <= 0) {
    return fail('INVALID', 'شناسهٔ ردیفِ دفتر مالی نامعتبر است.');
  }

  const type = String(row?.transactionType ?? '').trim().toUpperCase();
  if (!type) return fail('INVALID', 'نوعِ تراکنشِ ردیفِ دفتر مالی خالی است.');

  const rawAmount =
    typeof row?.amount === 'number'
      ? row.amount
      : Number(String(row?.amount ?? '').replace(/[,\u066C\u066B\s\u00A0]/g, ''));
  if (!Number.isFinite(rawAmount) || !Number.isInteger(rawAmount)) {
    return fail('INVALID', 'مبلغِ ردیفِ دفتر مالی باید عددِ صحیح (ریال) باشد.');
  }
  if (rawAmount === 0) {
    return fail('INVALID', `ردیفِ شمارهٔ ${faNum(rowId)} مبلغِ صفر دارد؛ سندی برای آن ساخته نشد.`);
  }

  const amount = Math.abs(rawAmount);
  const swapSides = rawAmount < 0;

  // قواعدِ پیش‌فرض را تضمین کن تا دانشگاهِ تازه هم قاعده داشته باشد.
  try {
    await ensureDefaultRules(uid, exec);
  } catch (err) {
    log.error('ensure_rules_failed', { err, universityId: uid });
    return {
      ok: false,
      error: 'آماده‌سازیِ قواعدِ ثبتِ سند ناموفق بود؛ سندی ثبت نشد.',
    };
  }

  const rule = await getRule(uid, type);

  let debitCode: string;
  let creditCode: string;
  if (rule) {
    debitCode = rule.debitAccountCode;
    creditCode = rule.creditAccountCode;
  } else if (DEBT_TYPES.has(type)) {
    // شارژ/شهریه: افزایشِ دریافتنی و درآمد
    debitCode = '1101';
    creditCode = '4001';
  } else if (DISCOUNT_TYPES.has(type)) {
    // تخفیف/اعتبار: کاهشِ درآمد و کاهشِ دریافتنی
    debitCode = '4101';
    creditCode = '1101';
  } else if (PAID_TYPES.has(type)) {
    // وصولِ نقدی: افزایشِ بانک و کاهشِ دریافتنی
    debitCode = '1002';
    creditCode = '1101';
  } else {
    // نوعِ کاملاً ناشناخته — عمداً ثبت نمی‌شود تا بازپرشی فهرستش کند
    return fail(
      'NO_ACCOUNT',
      `نوعِ تراکنشِ «${type}» در قواعدِ ثبتِ این دانشگاه شناخته نشده است؛ ردیفِ شمارهٔ ${faNum(rowId)} ثبت نشد.`,
    );
  }

  if (swapSides) {
    const tmp = debitCode;
    debitCode = creditCode;
    creditCode = tmp;
  }

  const source: 'LEDGER' | 'BACKFILL' = opts?.source === 'BACKFILL' ? 'BACKFILL' : 'LEDGER';
  const lineDescription =
    truncate(String(row?.description ?? '').trim(), 200) || `ثبتِ خودکار از دفتر مالی — ${type}`;
  const studentId = optionalId(row?.studentId);
  const termId = optionalId(row?.termId);

  return postVoucher(
    {
      universityId: uid,
      voucherDate: row?.createdAt,
      description: lineDescription,
      source,
      sourceRef: `ledger:${rowId}`,
      createdByUserId: typeof arg3 === 'number' ? optionalId(arg3) : null,
      lines: [
        {
          accountCode: debitCode,
          debit: amount,
          description: lineDescription,
          studentId,
          termId,
        },
        {
          accountCode: creditCode,
          credit: amount,
          description: lineDescription,
          studentId,
          termId,
        },
      ],
    },
    exec,
  );
}

// ══════════════════════════════════════════════════════════════════════
//  برگشتِ سند
// ══════════════════════════════════════════════════════════════════════

/**
 * برگشتِ کاملِ یک سند: سندِ آینه (بدهکار↔بستانکار) با منبعِ MANUAL و
 * `sourceRef = reverse:<id>` + علامت‌زدنِ سندِ اصلی به‌عنوان REVERSED.
 *
 * کلِ کار در یک تراکنش است و ردیفِ اصلی با FOR UPDATE قفل می‌شود تا دو
 * درخواستِ هم‌زمان دو سندِ برگشتی نسازند. سندِ دورهٔ بسته یا سندِ
 * قبلاً-برگشت‌خورده رد می‌شود.
 */
export async function reverseVoucher(
  voucherId: number,
  reason: string,
  actorUserId?: number | null,
): Promise<PostVoucherResult> {
  const id = Number(voucherId);
  if (!Number.isInteger(id) || id <= 0) {
    return fail('INVALID', 'شمارهٔ سند نامعتبر است.');
  }

  const why = truncate(String(reason ?? '').trim(), 200);
  if (!why) return fail('INVALID', 'دلیلِ برگشتِ سند الزامی است.');

  const actor = optionalId(actorUserId);

  try {
    return await runInTx(null, async (tx) => {
      const headRes: any = await tx.execute(sql`
        SELECT id, "universityId", "voucherNo",
               TO_CHAR("voucherDate", 'YYYY-MM-DD') AS voucher_date,
               "periodId", status
          FROM gl_vouchers
         WHERE id = ${id}
         FOR UPDATE
      `);
      const voucher = (headRes?.rows ?? [])[0];
      if (!voucher) {
        return fail('INVALID', `سندِ شمارهٔ ${faNum(id)} یافت نشد.`);
      }

      const uid = Number(voucher.universityId);
      const voucherNo = Number(voucher.voucherNo);
      const status = String(voucher.status ?? '').trim().toUpperCase();

      if (status === 'REVERSED') {
        return fail('INVALID', `سندِ شمارهٔ ${faNum(voucherNo)} قبلاً برگشت خورده است.`);
      }
      if (status !== 'POSTED') {
        return fail(
          'INVALID',
          `فقط اسنادِ ثبت‌شده قابلِ برگشت هستند؛ سندِ شمارهٔ ${faNum(voucherNo)} ثبت‌شده نیست.`,
        );
      }

      const iso = normalizeDateValue(String(voucher.voucher_date ?? ''));
      if (!iso) {
        return fail('INVALID', `تاریخِ سندِ شمارهٔ ${faNum(voucherNo)} نامعتبر است.`);
      }

      let periodId = Number(voucher.periodId);
      if (!Number.isInteger(periodId) || periodId <= 0) {
        periodId = await ensurePeriod(uid, iso, tx);
      }
      const period = await readPeriod(periodId, tx);
      if (period.status === 'CLOSED') {
        const title = period.title || `#${faNum(periodId)}`;
        return fail(
          'PERIOD_CLOSED',
          `دورهٔ مالی «${title}» بسته است؛ سند در این دوره ثبت نمی‌شود.`,
        );
      }

      const lineRes: any = await tx.execute(sql`
        SELECT l.debit, l.credit, l.description, l."studentId", l."termId", a.code
          FROM gl_voucher_lines l
          JOIN gl_accounts a ON a.id = l."accountId"
         WHERE l."voucherId" = ${id}
         ORDER BY l.id
      `);

      const mirrorLines: PostLine[] = [];
      for (const l of (lineRes?.rows ?? []) as any[]) {
        const debit = toRialAmount(l.credit) ?? 0;
        const credit = toRialAmount(l.debit) ?? 0;
        if (debit === 0 && credit === 0) continue;
        mirrorLines.push({
          accountCode: String(l.code ?? ''),
          debit,
          credit,
          description: l.description ? String(l.description) : undefined,
          studentId: optionalId(l.studentId),
          termId: optionalId(l.termId),
        });
      }

      if (mirrorLines.length < 2) {
        return fail(
          'INVALID',
          `سندِ شمارهٔ ${faNum(voucherNo)} ردیفِ کافی برای برگشت ندارد.`,
        );
      }

      const result = await postVoucher(
        {
          universityId: uid,
          voucherDate: iso,
          description: `برگشتِ سندِ شمارهٔ ${faNum(voucherNo)} — ${why}`,
          source: 'MANUAL',
          sourceRef: `reverse:${id}`,
          lines: mirrorLines,
          createdByUserId: actor,
        },
        tx,
      );

      if (!result.ok) return result;

      await tx.execute(sql`
        UPDATE gl_vouchers
           SET status = 'REVERSED', "reversedByVoucherId" = ${result.voucherId}::integer
         WHERE id = ${id}
      `);

      return result;
    });
  } catch (err: any) {
    log.error('reverse_voucher_failed', { err, voucherId: id });
    return {
      ok: false,
      error: 'برگشتِ سند به دلیلِ خطای داخلی انجام نشد؛ هیچ تغییری ذخیره نشد.',
    };
  }
}

// ══════════════════════════════════════════════════════════════════════
//  ترازِ آزمایشی
// ══════════════════════════════════════════════════════════════════════

/**
 * ترازِ آزمایشیِ یک دانشگاه روی اسنادِ POSTED (اختیاری در بازهٔ تاریخ).
 * یک کوئریِ تجمیعی — نه جمعِ سمتِ کلاینت؛ ردیف‌های بدونِ گردش حذف می‌شوند.
 */
export async function trialBalance(p: {
  universityId: number;
  from?: string;
  to?: string;
}): Promise<Array<{ code: string; name: string; type: string; debit: number; credit: number; balance: number }>> {
  const uid = Number(p?.universityId);
  if (!Number.isInteger(uid) || uid <= 0) return [];

  const from = p?.from ? normalizeDateValue(p.from) : null;
  const to = p?.to ? normalizeDateValue(p.to) : null;

  const conditions = [sql`v."universityId" = ${uid}`, sql`v.status = 'POSTED'`];
  if (from) conditions.push(sql`v."voucherDate" >= ${from}::date`);
  if (to) conditions.push(sql`v."voucherDate" <= ${to}::date`);

  const res: any = await db.execute(sql`
    SELECT a.code AS code,
           a.name AS name,
           a.type AS type,
           COALESCE(SUM(l.debit), 0) AS debit,
           COALESCE(SUM(l.credit), 0) AS credit,
           COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0) AS balance
      FROM gl_voucher_lines l
      JOIN gl_vouchers v ON v.id = l."voucherId"
      JOIN gl_accounts a ON a.id = l."accountId"
     WHERE ${sql.join(conditions, sql` AND `)}
     GROUP BY a.id, a.code, a.name, a.type
     ORDER BY a.code, a.id
  `);

  return ((res?.rows ?? []) as any[]).map((r) => ({
    code: String(r.code ?? ''),
    name: String(r.name ?? ''),
    type: String(r.type ?? ''),
    debit: Number(r.debit) || 0,
    credit: Number(r.credit) || 0,
    balance: Number(r.balance) || 0,
  }));
}
