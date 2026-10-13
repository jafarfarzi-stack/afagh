// ══════════════════════════════════════════════════════════════════════
//  آفاق ERP — «کنترل زمانی دقیق ثبت مالی» (Accounting Period Lock)
//
//  گِیت مرکزیِ ثبت مالی: ثبت/تغییر مالی فقط وقتی مجاز است که «دورهٔ مالی
//  فعال» تعریف شده باشد، قفل نباشد و زمانِ ثبت داخل پنجرهٔ opens_at…
//  closes_at باشد. کمکی‌های مالی (actions/*.ts) بالای تراکنش خود صدا
//  می‌زنند:
//
//      const gate = await assertEntryAllowed();
//      if (!gate.ok) return { ok: false, error: gate.reason };
//
//  قرارداد:
//    • دوره‌ای تعریف نشده → ثبت آزاد است (سازگاری با داده‌های قدیمی).
//    • «تنها یک دورهٔ فعال»: آخرین ردیف ثبت‌شده (id بزرگ‌تر) ملاک است.
//    • کشِ سبکِ درون-حافظه‌ای (مثل الگوی globalThis در db/index.ts) تا
//      فراخوانی per-action یک SELECT اضافه نسازد؛ با invalidate… بلافاصله
//      بعد از نوشتن، و در هر حال حداکثر ۱۰ ثانیه کهنه می‌شود.
// ══════════════════════════════════════════════════════════════════════
import 'server-only';
import { desc } from 'drizzle-orm';
import { db } from '@/db';
import { accounting_periods, type AccountingPeriodRow } from '@/db/schema-timecontrol';

/** طول عمر کش در میلی‌ثانیه (کوتاه عمداً: قفل باید ظرف چند ثانیه اثر کند) */
const CACHE_TTL_MS = 10_000;

// الگوی globalThis پروژه (db/index.ts, rateLimit.ts) — کش بین hot-reloadهای dev پایدار می‌ماند
const g = globalThis as unknown as {
  __afaghAccountingPeriodCache?: { at: number; row: AccountingPeriodRow | null } | null;
};

/** ردیف دورهٔ مالی برای مصرف بیرونی (تاریخ‌ها به ISO) */
export type ActivePeriod = {
  id: number;
  periodName: string | null;
  opensAt: Date;
  closesAt: Date;
  isLocked: boolean;
};

/** وضعیت قفل برای UI و API — همهٔ رشته‌ها فارسی و آمادهٔ نمایش */
export type LockState = {
  /** آیا اصلاً دوره‌ای تعریف شده است؟ */
  configured: boolean;
  /** دورهٔ فعال قفل دستی است؟ */
  locked: boolean;
  /** آیا ثبت مالی در این لحظه مجاز است؟ */
  entryAllowed: boolean;
  /** دلیل فارسی (برای banner و پیام خطای اکشن‌ها) */
  reason: string;
  period: {
    id: number;
    periodName: string | null;
    opensAt: string;
    closesAt: string;
    isLocked: boolean;
  } | null;
  /** زمان محاسبهٔ وضعیت */
  now: string;
};

/** بازخوانی دورهٔ فعال از دیتابیس (با کش) — آخرین ردیفِ ثبت‌شده */
async function loadActiveRow(force = false): Promise<AccountingPeriodRow | null> {
  const cache = g.__afaghAccountingPeriodCache;
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.row;

  const [row] = await db
    .select()
    .from(accounting_periods)
    .orderBy(desc(accounting_periods.id))
    .limit(1);

  g.__afaghAccountingPeriodCache = { at: Date.now(), row: row ?? null };
  return row ?? null;
}

/** دورهٔ مالی فعال (آخرین ثبت‌شده) یا null اگر تعریف نشده باشد */
export async function getActivePeriod(): Promise<ActivePeriod | null> {
  const row = await loadActiveRow();
  if (!row) return null;
  return {
    id: row.id,
    periodName: row.periodName,
    opensAt: row.opensAt,
    closesAt: row.closesAt,
    isLocked: row.isLocked,
  };
}

/** آیا ثبت مالی در زمان داده‌شده (پیش‌فرض: الآن) مجاز است؟ */
export async function isEntryAllowed(date: Date = new Date()): Promise<boolean> {
  const row = await loadActiveRow();
  if (!row) return true; // دوره‌ای تعریف نشده → ثبت آزاد
  if (row.isLocked) return false;
  const t = date.getTime();
  return t >= row.opensAt.getTime() && t <= row.closesAt.getTime();
}

/**
 * گِیت fail-closed برای اکشن‌های مالی: بالای تراکنش صدا بزنید.
 * برگشتی: { ok: true } یا { ok: false, reason: '… فارسی …' } آمادهٔ نمایش به کاربر.
 */
export async function assertEntryAllowed(
  date: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const row = await loadActiveRow();
  if (!row) return { ok: true };

  const when = date.toLocaleString('fa-IR');
  const win = `${row.opensAt.toLocaleString('fa-IR')} تا ${row.closesAt.toLocaleString('fa-IR')}`;
  const name = row.periodName?.trim() || `#${row.id}`;

  if (row.isLocked) {
    return {
      ok: false,
      reason: `ثبت مالی مجاز نیست: دورهٔ مالی «${name}» توسط مدیر قفل شده است.`,
    };
  }
  if (date.getTime() < row.opensAt.getTime()) {
    return {
      ok: false,
      reason: `ثبت مالی مجاز نیست: زمان ثبت (${when}) پیش از آغاز دورهٔ مالی «${name}» (${win}) است.`,
    };
  }
  if (date.getTime() > row.closesAt.getTime()) {
    return {
      ok: false,
      reason: `ثبت مالی مجاز نیست: زمان ثبت (${when}) پس از پایان دورهٔ مالی «${name}» (${win}) است.`,
    };
  }
  return { ok: true };
}

/** وضعیت کامل قفل برای صفحهٔ مدیریت و bannerهای UI */
export async function getLockState(): Promise<LockState> {
  const row = await loadActiveRow();
  const now = new Date();

  if (!row) {
    return {
      configured: false,
      locked: false,
      entryAllowed: true,
      reason: 'دورهٔ مالی تعریف نشده است — ثبت مالی در حال حاضر محدودیتی ندارد.',
      period: null,
      now: now.toISOString(),
    };
  }

  const gate = await assertEntryAllowed(now);
  const locked = row.isLocked;
  const name = row.periodName?.trim() || `#${row.id}`;

  const reason = !gate.ok
    ? gate.reason
    : `دورهٔ مالی «${name}» باز است؛ ثبت مالی مجاز است.`;

  return {
    configured: true,
    locked,
    entryAllowed: gate.ok,
    reason,
    period: {
      id: row.id,
      periodName: row.periodName,
      opensAt: row.opensAt.toISOString(),
      closesAt: row.closesAt.toISOString(),
      isLocked: locked,
    },
    now: now.toISOString(),
  };
}

/**
 * باطل‌کردن کش — بعد از هر INSERT/UPDATE/DELETE روی accounting_periods
 * (از مسیر API POST /api/admin/finance/time-control) فراخوانی شود تا
 * قفل/بازشدن بلافاصله اثر کند.
 */
export function invalidateTimeControlCache(): void {
  g.__afaghAccountingPeriodCache = null;
}
