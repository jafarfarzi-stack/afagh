'use server';

/**
 * اکشن‌های سرورِ «حسابداری و دفتر کل».
 *
 * قواعدِ مشترکِ همهٔ اکشن‌ها:
 *   • `requireRole` دوباره سمتِ سرور (منو و UI هیچ‌گاه مرزِ امنیتی نیستند)
 *   • دانشگاه همیشه از `getCurrentUniversity()` — هرگز از ورودیِ کلاینت
 *   • `assertServerActionOrigin` مثلِ بقیهٔ اکشن‌های مالیِ پنل
 *   • پیام خطای فارسی + `revalidatePath('/admin/accounting')`
 *   • هر تغییرِ کدینگ/قاعده/دوره/سند یک ردیفِ حسابرسی دارد (appendAudit)
 *
 * ⚠ جدول‌های gl_* از `@/db/schema` و منطقِ ثبت از `@/lib/accounting/*`
 *   می‌آید؛ در این فایل هیچ SQL ثبتِ سندی بازنویسی نمی‌شود.
 */

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  gl_accounts,
  gl_periods,
  gl_posting_rules,
  gl_vouchers,
} from '@/db/schema';
import { getSessionUser, requireRole } from '@/lib/auth';
import { assertServerActionOrigin } from '@/lib/security';
import { getCurrentUniversity, isRealUniversityId } from '@/lib/university-scope';
import { appendAudit } from '@/lib/audit';
import { safeRials } from '@/lib/money';
import { postVoucher, reverseVoucher } from '@/lib/accounting/posting';
import { glReconciliation, rebuildGlFromLedger } from '@/lib/accounting/backfill';

/** نقش‌های مجازِ حسابداری — دقیقاً همان گاردِ صفحه */
const FINANCE = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'];

const PATH = '/admin/accounting';

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const;
const ACCOUNT_SIDES = ['DEBIT', 'CREDIT'] as const;

/**
 * فهرستِ کانونیِ `student_ledger."transactionType"` — هم‌گام با
 * `ck_student_ledger_txn_type` در schema. کلیدِ رویدادِ قاعدهٔ ثبت همین است.
 */
const EVENT_KEYS = [
  'TUITION_FIXED',
  'TUITION_VARIABLE',
  'PAYMENT',
  'POS_PAYMENT',
  'DISCOUNT_FIXED',
  'DISCOUNT_VARIABLE',
  'SUBJECT_ADDITIVE',
  'SUBJECT_DEDUCTIVE',
  'SPONSORSHIP',
  'LOAN',
  'TUITION_CHARGE',
  'CHARGE',
  'CREDIT',
  'POS_REFUND',
  'TUITION_BATES',
  'TUITION_ADJUST_DEC',
  'TUITION_ADJUST_INC',
  'TUITION_BATES_FIXED',
  'TUITION_BATES_VARIABLE',
  'TUITION_BATES_AMOUNT',
] as const;
const EVENT_KEY_SET = new Set<string>(EVENT_KEYS);

// ══════════════════════════════════════════════════════════════════════
//  کمکی‌های ورودی
// ══════════════════════════════════════════════════════════════════════

/** ارقامِ فارسی/عربی → لاتین (کد حساب و مبلغ از کیبورد فارسی می‌آید) */
function normalizeDigits(value: unknown): string {
  return String(value ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/** متنِ یک‌خطیِ تمیز (بدون تغییرِ ارقام — نامِ حساب و شرح باید عیناً بمانند) */
function cleanText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** کدِ حساب: فقط ارقام، ۱ تا ۲۰ رقم (طولِ ستون) */
function accountCode(value: unknown): string | null {
  const s = normalizeDigits(value).replace(/[\s,٬،]/g, '');
  return /^\d{1,20}$/.test(s) ? s : null;
}

/** مبلغِ ریالیِ نامنفی — «۱۲٬۰۰۰» و «12000» هر دو پذیرفته می‌شوند */
function rialAmount(value: unknown): number | null {
  if (typeof value === 'number') return safeRials(value);
  const s = normalizeDigits(value).replace(/[\s,٬،]/g, '');
  if (!s) return 0;
  return safeRials(s);
}

/** تاریخِ ISO میلادی (YYYY-MM-DD) با اعتبارسنجیِ رفت‌وبرگشتی */
function isoDate(value: unknown): string | null {
  const s = normalizeDigits(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** بازهٔ ماهِ میلادیِ شاملِ تاریخ — عنوانِ دورهٔ مالی همان YYYY-MM است */
function monthRange(iso: string): { title: string; start: string; end: string } {
  const [y, m] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { title: `${y}-${mm}`, start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

type Ctx =
  | { ok: true; universityId: number; userId: number | null; roles: string[] }
  | { ok: false; error: string };

/** مبدأِ امنیتی: اینترنت‌خاست + دانشگاهِ واقعی + کاربر */
async function actionCtx(): Promise<Ctx> {
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  const uni = await getCurrentUniversity().catch(() => null);
  const universityId = uni?.id ?? null;
  if (!isRealUniversityId(universityId)) {
    return { ok: false, error: 'دانشگاه فعال مشخص نیست؛ عملیات حسابداری مسدود شد.' };
  }
  const user = await getSessionUser().catch(() => null);
  return {
    ok: true,
    universityId,
    userId: user?.id ?? null,
    roles: (user?.roles ?? []) as string[],
  };
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

/** نقضِ یکتایی (کد حساب تکراری در همان دانشگاه) */
function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === '23505';
}

// ══════════════════════════════════════════════════════════════════════
//  ۱) کدینگِ حساب‌ها
// ══════════════════════════════════════════════════════════════════════

export type AccountInput = {
  code: string;
  name: string;
  type: string;
  normalSide: string;
  parentId?: number | null;
  isPostable?: boolean;
};

/** افزودنِ حسابِ جدید به کدینگ — کد در هر دانشگاه یکتاست */
export async function createAccountAction(input: AccountInput): Promise<{ ok: boolean; error?: string; id?: number }> {
  await requireRole(FINANCE);
  const c = await actionCtx();
  if (!c.ok) return { ok: false, error: c.error };

  const code = accountCode(input?.code);
  if (!code) return fail('کد حساب باید فقط رقم و بین ۱ تا ۲۰ رقم باشد.');
  const name = cleanText(input?.name);
  if (name.length < 2) return fail('نام حساب باید دست‌کم ۲ نویسه باشد.');
  if (name.length > 120) return fail('نام حساب حداکثر ۱۲۰ نویسه است.');
  if (!ACCOUNT_TYPES.includes(input?.type as (typeof ACCOUNT_TYPES)[number])) {
    return fail('نوع حساب نامعتبر است.');
  }
  if (!ACCOUNT_SIDES.includes(input?.normalSide as (typeof ACCOUNT_SIDES)[number])) {
    return fail('طرفِ طبیعیِ حساب نامعتبر است.');
  }

  const parentId = input?.parentId ? Number(input.parentId) : null;
  let level = 1;
  if (parentId !== null) {
    if (!Number.isInteger(parentId) || parentId <= 0) return fail('حساب والد نامعتبر است.');
    const [parent] = await db
      .select({ id: gl_accounts.id, level: gl_accounts.level })
      .from(gl_accounts)
      .where(and(eq(gl_accounts.id, parentId), eq(gl_accounts.universityId, c.universityId)))
      .limit(1);
    if (!parent) return fail('حساب والد در کدینگِ همین دانشگاه پیدا نشد.');
    level = Math.min(9, Number(parent.level ?? 1) + 1);
  }

  const [dup] = await db
    .select({ id: gl_accounts.id })
    .from(gl_accounts)
    .where(and(eq(gl_accounts.universityId, c.universityId), eq(gl_accounts.code, code)))
    .limit(1);
  if (dup) return fail(`کد حساب ${code} در این دانشگاه قبلاً ثبت شده است.`);

  try {
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(gl_accounts)
        .values({
          universityId: c.universityId,
          code,
          name,
          type: input.type,
          normalSide: input.normalSide,
          parentId,
          level,
          isActive: 1,
          isPostable: input?.isPostable === false ? 0 : 1,
        })
        .returning({ id: gl_accounts.id });
      await appendAudit(tx, {
        actorUserId: c.userId,
        action: 'GL_ACCOUNT_CREATE',
        entityType: 'gl_accounts',
        entityId: row.id,
        details: JSON.stringify({ code, name, type: input.type, normalSide: input.normalSide, parentId, level }),
      });
      return row.id;
    });
    revalidatePath(PATH);
    return { ok: true, id };
  } catch (e) {
    if (isUniqueViolation(e)) return fail(`کد حساب ${code} در این دانشگاه قبلاً ثبت شده است.`);
    return fail('ثبتِ حساب ناموفق بود؛ دوباره تلاش کنید.');
  }
}

/** فعال/غیرفعال یا قابل‌سند/تجمیعی کردنِ یک حساب */
export async function setAccountFlagAction(input: {
  id: number;
  field: 'isActive' | 'isPostable';
  value: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const c = await actionCtx();
  if (!c.ok) return { ok: false, error: c.error };

  const id = Number(input?.id);
  if (!Number.isInteger(id) || id <= 0) return fail('شناسهٔ حساب نامعتبر است.');
  if (input?.field !== 'isActive' && input?.field !== 'isPostable') return fail('فیلدِ درخواستی نامعتبر است.');

  const [row] = await db
    .select({ id: gl_accounts.id, code: gl_accounts.code, name: gl_accounts.name })
    .from(gl_accounts)
    .where(and(eq(gl_accounts.id, id), eq(gl_accounts.universityId, c.universityId)))
    .limit(1);
  if (!row) return fail('حساب در کدینگِ این دانشگاه پیدا نشد.');

  const value = input.value === true ? 1 : 0;
  const patch = input.field === 'isActive' ? { isActive: value } : { isPostable: value };
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(gl_accounts)
        .set(patch)
        .where(and(eq(gl_accounts.id, id), eq(gl_accounts.universityId, c.universityId)));
      await appendAudit(tx, {
        actorUserId: c.userId,
        action: input.field === 'isActive' ? 'GL_ACCOUNT_SET_ACTIVE' : 'GL_ACCOUNT_SET_POSTABLE',
        entityType: 'gl_accounts',
        entityId: id,
        details: JSON.stringify({ code: row.code, name: row.name, [input.field]: Boolean(value) }),
      });
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch {
    return fail('تغییرِ وضعیتِ حساب ناموفق بود.');
  }
}

// ══════════════════════════════════════════════════════════════════════
//  ۲) قواعدِ نگاشت (eventKey → Dr/Cr)
// ══════════════════════════════════════════════════════════════════════

export async function savePostingRuleAction(input: {
  eventKey: string;
  debitAccountCode: string;
  creditAccountCode: string;
  isActive?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const c = await actionCtx();
  if (!c.ok) return { ok: false, error: c.error };

  const eventKey = String(input?.eventKey ?? '').trim().toUpperCase();
  if (!EVENT_KEY_SET.has(eventKey)) return fail('کلیدِ رویداد نامعتبر است؛ فقط انواعِ دفترِ دانشجو پذیرفته می‌شوند.');

  const debitCode = accountCode(input?.debitAccountCode);
  const creditCode = accountCode(input?.creditAccountCode);
  if (!debitCode) return fail('کدِ حسابِ بدهکار نامعتبر است.');
  if (!creditCode) return fail('کدِ حسابِ بستانکار نامعتبر است.');
  if (debitCode === creditCode) return fail('حسابِ بدهکار و بستانکار نباید یکی باشند.');

  const accounts = await db
    .select({
      code: gl_accounts.code,
      name: gl_accounts.name,
      isActive: gl_accounts.isActive,
      isPostable: gl_accounts.isPostable,
    })
    .from(gl_accounts)
    .where(and(eq(gl_accounts.universityId, c.universityId), inArray(gl_accounts.code, [debitCode, creditCode])));
  const byCode = new Map(accounts.map((a) => [String(a.code), a]));
  const dr = byCode.get(debitCode);
  const cr = byCode.get(creditCode);
  if (!dr) return fail(`حساب بدهکار با کد ${debitCode} در کدینگِ این دانشگاه نیست.`);
  if (!cr) return fail(`حساب بستانکار با کد ${creditCode} در کدینگِ این دانشگاه نیست.`);
  if (Number(dr.isActive) !== 1) return fail(`حساب بدهکار «${dr.name}» غیرفعال است.`);
  if (Number(cr.isActive) !== 1) return fail(`حساب بستانکار «${cr.name}» غیرفعال است.`);
  if (Number(dr.isPostable) !== 1) return fail(`حساب بدهکار «${dr.name}» قابلِ سندزنی نیست.`);
  if (Number(cr.isPostable) !== 1) return fail(`حساب بستانکار «${cr.name}» قابلِ سندزنی نیست.`);

  const isActive = input?.isActive === false ? 0 : 1;
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(gl_posting_rules)
        .values({
          universityId: c.universityId,
          eventKey,
          debitAccountCode: debitCode,
          creditAccountCode: creditCode,
          isActive,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [gl_posting_rules.universityId, gl_posting_rules.eventKey],
          set: {
            debitAccountCode: debitCode,
            creditAccountCode: creditCode,
            isActive,
            updatedAt: new Date(),
          },
        });
      await appendAudit(tx, {
        actorUserId: c.userId,
        action: 'GL_RULE_UPSERT',
        entityType: 'gl_posting_rules',
        entityId: null,
        details: JSON.stringify({ eventKey, debitAccountCode: debitCode, creditAccountCode: creditCode, isActive: Boolean(isActive) }),
      });
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch {
    return fail('ذخیرهٔ قاعدهٔ نگاشت ناموفق بود.');
  }
}

// ══════════════════════════════════════════════════════════════════════
//  ۳) دوره‌های مالی
// ══════════════════════════════════════════════════════════════════════

/** بستنِ دوره — دلیل اجباری و بررسیِ سندِ ناتراز */
export async function closePeriodAction(input: { periodId: number; reason: string }): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const c = await actionCtx();
  if (!c.ok) return { ok: false, error: c.error };

  const periodId = Number(input?.periodId);
  if (!Number.isInteger(periodId) || periodId <= 0) return fail('شناسهٔ دوره نامعتبر است.');
  const reason = String(input?.reason ?? '').trim();
  if (reason.length < 5) return fail('دلیلِ بستنِ دوره اجباری است (دست‌کم ۵ نویسه).');

  const [period] = await db
    .select({ id: gl_periods.id, title: gl_periods.title, status: gl_periods.status })
    .from(gl_periods)
    .where(and(eq(gl_periods.id, periodId), eq(gl_periods.universityId, c.universityId)))
    .limit(1);
  if (!period) return fail('دوره در این دانشگاه پیدا نشد.');
  if (String(period.status) !== 'OPEN') return fail('این دوره از قبل بسته است.');

  const bad = await db.execute<{ n: number }>(sql`
    SELECT COUNT(*)::int AS n
      FROM gl_vouchers v
     WHERE v."universityId" = ${c.universityId}
       AND v."periodId" = ${periodId}
       AND COALESCE(v."totalDebit", 0) <> COALESCE(v."totalCredit", 0)
  `);
  const unbalanced = Number(bad.rows?.[0]?.n ?? 0);
  if (unbalanced > 0) {
    return fail('دوره سندِ ناتراز دارد؛ پیش از بستن، اسنادِ ناتراز را اصلاح یا برگشت بزنید.');
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(gl_periods)
        .set({ status: 'CLOSED', closedAt: new Date() })
        .where(and(eq(gl_periods.id, periodId), eq(gl_periods.universityId, c.universityId)));
      await appendAudit(tx, {
        actorUserId: c.userId,
        action: 'GL_PERIOD_CLOSE',
        entityType: 'gl_periods',
        entityId: periodId,
        details: JSON.stringify({ title: period.title, reason }),
      });
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch {
    return fail('بستنِ دوره ناموفق بود.');
  }
}

/** بازگشاییِ دوره — فقط ADMIN (در گزارشِ حسابرسی ثبت می‌شود) */
export async function reopenPeriodAction(input: { periodId: number; reason: string }): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const c = await actionCtx();
  if (!c.ok) return { ok: false, error: c.error };
  if (!c.roles.includes('ADMIN')) return fail('بازگشاییِ دوره فقط با نقشِ مدیر سامانه امکان‌پذیر است.');

  const periodId = Number(input?.periodId);
  if (!Number.isInteger(periodId) || periodId <= 0) return fail('شناسهٔ دوره نامعتبر است.');
  const reason = String(input?.reason ?? '').trim();
  if (reason.length < 5) return fail('دلیلِ بازگشایی اجباری است (دست‌کم ۵ نویسه).');

  const [period] = await db
    .select({ id: gl_periods.id, title: gl_periods.title, status: gl_periods.status })
    .from(gl_periods)
    .where(and(eq(gl_periods.id, periodId), eq(gl_periods.universityId, c.universityId)))
    .limit(1);
  if (!period) return fail('دوره در این دانشگاه پیدا نشد.');
  if (String(period.status) !== 'CLOSED') return fail('این دوره بسته نیست.');

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(gl_periods)
        .set({ status: 'OPEN', closedAt: null })
        .where(and(eq(gl_periods.id, periodId), eq(gl_periods.universityId, c.universityId)));
      await appendAudit(tx, {
        actorUserId: c.userId,
        action: 'GL_PERIOD_REOPEN',
        entityType: 'gl_periods',
        entityId: periodId,
        details: JSON.stringify({ title: period.title, reason }),
      });
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch {
    return fail('بازگشاییِ دوره ناموفق بود.');
  }
}

// ══════════════════════════════════════════════════════════════════════
//  ۴) اسناد — دستی، برگشت و افتتاحیه
// ══════════════════════════════════════════════════════════════════════

export type VoucherLineInput = {
  accountId?: number | null;
  debit?: number | string | null;
  credit?: number | string | null;
  description?: string | null;
};

type PreparedLines =
  | { ok: true; lines: { accountCode: string; debit: string; credit: string; description?: string }[]; debit: number; credit: number }
  | { ok: false; error: string };

/**
 * اعتبارسنجیِ خطوطِ سند: حسابِ همین دانشگاه، حسابِ فعال و قابل‌سند،
 * دقیقاً یک طرفِ بدهکار/بستانکارِ مثبت، و ترازِ دوطرفه.
 */
async function prepareLines(universityId: number, raw: VoucherLineInput[] | undefined): Promise<PreparedLines> {
  const rows = Array.isArray(raw) ? raw : [];
  if (rows.length < 2) return { ok: false, error: 'سند باید دست‌کم دو ردیف داشته باشد.' };

  const ids: number[] = [];
  for (const r of rows) {
    const id = Number(r?.accountId);
    if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'برای همهٔ ردیف‌ها حساب انتخاب کنید.' };
    ids.push(id);
  }
  const uniq = [...new Set(ids)];
  const accounts = await db
    .select({
      id: gl_accounts.id,
      code: gl_accounts.code,
      name: gl_accounts.name,
      isActive: gl_accounts.isActive,
      isPostable: gl_accounts.isPostable,
    })
    .from(gl_accounts)
    .where(and(eq(gl_accounts.universityId, universityId), inArray(gl_accounts.id, uniq)));
  const byId = new Map(accounts.map((a) => [Number(a.id), a]));

  const lines: { accountCode: string; debit: string; credit: string; description?: string }[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (const row of rows) {
    const acc = byId.get(Number(row.accountId));
    if (!acc) return { ok: false, error: 'یکی از حساب‌های انتخاب‌شده در کدینگِ این دانشگاه نیست.' };
    if (Number(acc.isActive) !== 1) return { ok: false, error: `حساب «${acc.name}» غیرفعال است.` };
    if (Number(acc.isPostable) !== 1) return { ok: false, error: `حساب «${acc.name}» قابلِ سندزنی نیست.` };

    const debit = rialAmount(row.debit ?? 0);
    const credit = rialAmount(row.credit ?? 0);
    if (debit === null || credit === null) return { ok: false, error: `مبلغِ ردیفِ «${acc.name}» نامعتبر است.` };
    if (debit < 0 || credit < 0) return { ok: false, error: 'مبلغِ ردیف نمی‌تواند منفی باشد.' };
    if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
      return { ok: false, error: `ردیفِ «${acc.name}» باید دقیقاً یک طرف (بدهکار یا بستانکار) و بزرگ‌تر از صفر داشته باشد.` };
    }
    totalDebit += debit;
    totalCredit += credit;
    lines.push({
      accountCode: String(acc.code),
      debit: String(debit),
      credit: String(credit),
      description: String(row.description ?? '').trim().slice(0, 200) || undefined,
    });
  }

  if (totalDebit <= 0) return { ok: false, error: 'جمعِ بدهکار باید بزرگ‌تر از صفر باشد.' };
  if (totalDebit !== totalCredit) {
    return { ok: false, error: 'سند تراز نیست؛ جمعِ بدهکار و بستانکار باید برابر باشد.' };
  }
  return { ok: true, lines, debit: totalDebit, credit: totalCredit };
}

/** ثبتِ سندِ دستی با کلیدِ یکتای MANUAL:<timestamp> */
export async function postManualVoucherAction(input: {
  date: string;
  description: string;
  lines: VoucherLineInput[];
}): Promise<{ ok: boolean; error?: string; voucherId?: number; voucherNo?: number }> {
  await requireRole(FINANCE);
  const c = await actionCtx();
  if (!c.ok) return { ok: false, error: c.error };

  const date = isoDate(input?.date);
  if (!date) return fail('تاریخِ سند نامعتبر است.');
  const description = cleanText(input?.description);
  if (description.length < 3) return fail('شرحِ سند اجباری است (دست‌کم ۳ نویسه).');

  const prepared = await prepareLines(c.universityId, input?.lines);
  if (!prepared.ok) return { ok: false, error: prepared.error };

  const sourceRef = `MANUAL:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  try {
    const res = await postVoucher({
      universityId: c.universityId,
      voucherDate: date,
      description: description.slice(0, 300),
      source: 'MANUAL',
      sourceRef,
      lines: prepared.lines,
      createdByUserId: c.userId,
    });
    if (!res.ok) return { ok: false, error: res.error };

    await db.transaction((tx) =>
      appendAudit(tx, {
        actorUserId: c.userId,
        action: 'GL_VOUCHER_MANUAL_POST',
        entityType: 'gl_vouchers',
        entityId: res.voucherId,
        details: JSON.stringify({
          voucherNo: res.voucherNo,
          voucherDate: date,
          sourceRef,
          debit: prepared.debit,
          credit: prepared.credit,
          lines: prepared.lines.length,
        }),
      }),
    );
    revalidatePath(PATH);
    return { ok: true, voucherId: res.voucherId, voucherNo: res.voucherNo };
  } catch (e) {
    return fail((e as { message?: string } | null)?.message || 'ثبتِ سند ناموفق بود.');
  }
}

/** برگشتِ سند — دلیل اجباری */
export async function reverseVoucherAction(input: {
  voucherId: number;
  reason: string;
}): Promise<{ ok: boolean; error?: string; voucherNo?: number }> {
  await requireRole(FINANCE);
  const c = await actionCtx();
  if (!c.ok) return { ok: false, error: c.error };

  const voucherId = Number(input?.voucherId);
  if (!Number.isInteger(voucherId) || voucherId <= 0) return fail('شناسهٔ سند نامعتبر است.');
  const reason = String(input?.reason ?? '').trim();
  if (reason.length < 5) return fail('دلیلِ برگشت اجباری است (دست‌کم ۵ نویسه).');

  const [voucher] = await db
    .select({
      id: gl_vouchers.id,
      voucherNo: gl_vouchers.voucherNo,
      status: gl_vouchers.status,
      reversedByVoucherId: gl_vouchers.reversedByVoucherId,
      totalDebit: gl_vouchers.totalDebit,
      source: gl_vouchers.source,
    })
    .from(gl_vouchers)
    .where(and(eq(gl_vouchers.id, voucherId), eq(gl_vouchers.universityId, c.universityId)))
    .limit(1);
  if (!voucher) return fail('سند در این دانشگاه پیدا نشد.');
  if (String(voucher.status) === 'REVERSED' || voucher.reversedByVoucherId) {
    return fail('این سند قبلاً برگشت خورده است.');
  }
  if (String(voucher.status) !== 'POSTED') return fail('فقط سندِ ثبت‌شده (POSTED) قابلِ برگشت است.');

  try {
    const res = await reverseVoucher(voucherId, reason, c.userId);
    if (!res.ok) return { ok: false, error: res.error };

    await db.transaction((tx) =>
      appendAudit(tx, {
        actorUserId: c.userId,
        action: 'GL_VOUCHER_REVERSE',
        entityType: 'gl_vouchers',
        entityId: res.voucherId,
        details: JSON.stringify({
          reversesVoucherId: voucherId,
          reversesVoucherNo: Number(voucher.voucherNo),
          reversalVoucherNo: res.voucherNo,
          reason,
        }),
      }),
    );
    revalidatePath(PATH);
    return { ok: true, voucherNo: res.voucherNo };
  } catch (e) {
    return fail((e as { message?: string } | null)?.message || 'برگشتِ سند ناموفق بود.');
  }
}

/**
 * ثبتِ «ماندهٔ افتتاحیه» — یک سندِ OPENING برای شروعِ ترازنامه.
 * اگر همان ماه سندِ افتتاحیهٔ برگشت‌نخورده داشته باشد، رد می‌شود.
 */
export async function postOpeningBalanceAction(input: {
  date: string;
  description?: string;
  lines: VoucherLineInput[];
}): Promise<{ ok: boolean; error?: string; voucherId?: number; voucherNo?: number }> {
  await requireRole(FINANCE);
  const c = await actionCtx();
  if (!c.ok) return { ok: false, error: c.error };

  const date = isoDate(input?.date);
  if (!date) return fail('تاریخِ سند افتتاحیه نامعتبر است.');
  const month = monthRange(date);
  const description = cleanText(input?.description) || `ماندهٔ افتتاحیه — ${month.title}`;

  const existing = await db.execute<{ n: number }>(sql`
    SELECT COUNT(*)::int AS n
      FROM gl_vouchers v
     WHERE v."universityId" = ${c.universityId}
       AND v.source = 'OPENING'
       AND v.status <> 'REVERSED'
       AND v."voucherDate" >= ${month.start}::date
       AND v."voucherDate" <= ${month.end}::date
  `);
  if (Number(existing.rows?.[0]?.n ?? 0) > 0) {
    return fail(`برای دورهٔ ${month.title} قبلاً سندِ افتتاحیه ثبت شده است؛ ابتدا آن را برگشت بزنید.`);
  }

  const prepared = await prepareLines(c.universityId, input?.lines);
  if (!prepared.ok) return { ok: false, error: prepared.error };

  try {
    const res = await postVoucher({
      universityId: c.universityId,
      voucherDate: date,
      description: description.slice(0, 300),
      source: 'OPENING',
      sourceRef: `OPENING:${month.title}`,
      lines: prepared.lines,
      createdByUserId: c.userId,
    });
    if (!res.ok) return { ok: false, error: res.error };

    await db.transaction((tx) =>
      appendAudit(tx, {
        actorUserId: c.userId,
        action: 'GL_VOUCHER_OPENING_POST',
        entityType: 'gl_vouchers',
        entityId: res.voucherId,
        details: JSON.stringify({ voucherNo: res.voucherNo, period: month.title, debit: prepared.debit, lines: prepared.lines.length }),
      }),
    );
    revalidatePath(PATH);
    return { ok: true, voucherId: res.voucherId, voucherNo: res.voucherNo };
  } catch (e) {
    const msg = (e as { message?: string } | null)?.message || 'ثبتِ سند افتتاحیه ناموفق بود.';
    return fail(msg);
  }
}

// ══════════════════════════════════════════════════════════════════════
//  ۵) بازسازی از دفتر دانشجو
// ══════════════════════════════════════════════════════════════════════

export type BackfillActionInput = {
  dryRun?: boolean;
  confirm?: boolean;
  fromVoucherDate?: string;
  toVoucherDate?: string;
  termCode?: string;
  maxRows?: number;
};

/**
 * اجرای بازسازی — پیش‌فرض «آزمایشی» است. اجرای واقعی فقط با
 * `confirm === true` و پس از یک dry-run در UI انجام می‌شود.
 */
export async function runBackfillAction(input: BackfillActionInput): Promise<
  | {
      ok: true;
      dryRun: boolean;
      result: Awaited<ReturnType<typeof rebuildGlFromLedger>>;
      reconciliation: Awaited<ReturnType<typeof glReconciliation>> | null;
    }
  | { ok: false; error: string }
> {
  await requireRole(FINANCE);
  const c = await actionCtx();
  if (!c.ok) return c;

  const dryRun = input?.dryRun !== false;
  if (!dryRun && input?.confirm !== true) {
    return fail('اجرای واقعیِ بازسازی نیازمند تأییدِ صریح است؛ ابتدا اجرای آزمایشی را ببینید.');
  }

  const fromVoucherDate = input?.fromVoucherDate ? isoDate(input.fromVoucherDate) : undefined;
  if (input?.fromVoucherDate && !fromVoucherDate) return fail('تاریخِ شروع نامعتبر است.');
  const toVoucherDate = input?.toVoucherDate ? isoDate(input.toVoucherDate) : undefined;
  if (input?.toVoucherDate && !toVoucherDate) return fail('تاریخِ پایان نامعتبر است.');
  if (fromVoucherDate && toVoucherDate && fromVoucherDate > toVoucherDate) {
    return fail('تاریخِ شروع نباید بعد از تاریخِ پایان باشد.');
  }

  const termCode = normalizeDigits(input?.termCode).replace(/[^\d]/g, '').slice(0, 10) || undefined;
  const maxRowsRaw = Number(input?.maxRows ?? 2000);
  const maxRows = Number.isFinite(maxRowsRaw) ? Math.min(20000, Math.max(1, Math.round(maxRowsRaw))) : 2000;

  try {
    const result = await rebuildGlFromLedger({
      universityId: c.universityId,
      fromVoucherDate,
      toVoucherDate,
      termCode,
      dryRun,
      batchSize: 500,
      maxRows,
    });
    const reconciliation = await glReconciliation(c.universityId).catch(() => null);

    if (!dryRun) {
      await db.transaction((tx) =>
        appendAudit(tx, {
          actorUserId: c.userId,
          action: 'GL_BACKFILL_RUN',
          entityType: 'gl_vouchers',
          entityId: null,
          details: JSON.stringify({
            scanned: result.scanned,
            posted: result.posted,
            skipped: result.skipped,
            failed: result.failed,
            fromVoucherDate: fromVoucherDate ?? null,
            toVoucherDate: toVoucherDate ?? null,
            termCode: termCode ?? null,
            maxRows,
          }),
        }),
      );
    }
    revalidatePath(PATH);
    return { ok: true, dryRun, result, reconciliation };
  } catch (e) {
    return fail((e as { message?: string } | null)?.message || 'اجرای بازسازی ناموفق بود.');
  }
}
