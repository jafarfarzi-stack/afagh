import 'server-only';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms, course_offerings, courses, enrollments, financial_clearances,
  legacy_grades, legacy_import_batches, migration_audit_entries, student_ledger,
  students, term_financial_rules, users,
} from '@/db/schema';
import { createLogger } from '@/lib/logger';

// ═══ دفتر واگرد مهاجرت ═══
// هر نوشتنی که ماژول مهاجرت روی جدول‌های «عملیاتی» انجام می‌دهد اینجا سند می‌خورد:
// چه جدولی، چه سطری، درج بود یا به‌روزرسانی، و مقدار پیش/پس از تغییر.
// با همین سند می‌توان یک دستهٔ کامل را «واگرد» کرد؛ چیزی که تا پیش از این
// برای ۱۰هزار نمرهٔ اشتباهاً اعمال‌شده هیچ راه تمیزی نداشت.

const log = createLogger({ mod: 'migration.audit' });

/** جدول‌هایی که واگردشان مجاز است (whitelist عمدی؛ هرچه اینجا نیست، واگرد نمی‌شود) */
const TABLES = {
  enrollments, course_offerings, courses, academic_terms,
  term_financial_rules, student_ledger, financial_clearances,
  students, users, legacy_grades,
} as const;

export type AuditTable = keyof typeof TABLES;

export type AuditCtx = {
  batchId?: number | null;
  opGroup: string;
  sourceCode: string;
  userId?: number | null;
} | null | undefined;

/** ثبت یک درج در دفتر واگرد */
export async function auditInsert(ctx: AuditCtx, tableName: AuditTable, rowId: number, afterData?: Record<string, unknown>) {
  if (!ctx || !rowId) return;
  await db.insert(migration_audit_entries).values({
    batchId: ctx.batchId ?? null, opGroup: ctx.opGroup, sourceCode: ctx.sourceCode,
    tableName, rowId, op: 'INSERT', beforeData: null,
    afterData: (afterData ?? null) as never, createdByUserId: ctx.userId ?? null,
  });
}

/** ثبت یک به‌روزرسانی در دفتر واگرد (before = فقط ستون‌هایی که تغییر می‌کنند) */
export async function auditUpdate(
  ctx: AuditCtx, tableName: AuditTable, rowId: number,
  beforeData: Record<string, unknown>, afterData: Record<string, unknown>,
) {
  if (!ctx || !rowId) return;
  await db.insert(migration_audit_entries).values({
    batchId: ctx.batchId ?? null, opGroup: ctx.opGroup, sourceCode: ctx.sourceCode,
    tableName, rowId, op: 'UPDATE',
    beforeData: beforeData as never, afterData: afterData as never,
    createdByUserId: ctx.userId ?? null,
  });
}

export type RollbackResult = {
  batchId: number | null;
  opGroup?: string;
  total: number;
  deleted: number;
  restored: number;
  alreadyReverted: number;
  missing: number;
  changedAfterwards: number;
  blocked: number;
  details: { table: string; rowId: number; op: string; result: string; note?: string }[];
};

const sameValue = (a: unknown, b: unknown) => {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (a instanceof Date || b instanceof Date) return new Date(a as string).getTime() === new Date(b as string).getTime();
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  return String(a) === String(b);
};

/**
 * واگرد یک دسته (یا یک گروه عملیاتی).
 * ترتیب معکوسِ ثبت طی می‌شود تا وابستگی‌ها (مثلاً enrollment قبل از offering) نشکند.
 *  • INSERT → حذف سطر (اگر جای دیگری به آن ارجاع داده شده باشد، «مسدود» گزارش می‌شود)
 *  • UPDATE → بازگرداندن مقدار پیشین
 *  • اگر سطر بعد از مهاجرت دستی تغییر کرده باشد، پیش‌فرض دست نمی‌خورد (مگر force)
 */
export async function rollbackBatch(
  opts: { batchId?: number; opGroup?: string; sourceCode?: string; force?: boolean; userId?: number | null },
): Promise<RollbackResult> {
  const conds = [isNull(migration_audit_entries.revertedAt)];
  if (opts.batchId) conds.push(eq(migration_audit_entries.batchId, opts.batchId));
  if (opts.opGroup) conds.push(eq(migration_audit_entries.opGroup, opts.opGroup));
  if (opts.sourceCode) conds.push(eq(migration_audit_entries.sourceCode, opts.sourceCode));
  if (!opts.batchId && !opts.opGroup) throw new Error('برای واگرد باید دسته یا گروه عملیات مشخص شود.');

  const entries = await db.select().from(migration_audit_entries)
    .where(and(...conds)).orderBy(desc(migration_audit_entries.id));

  const res: RollbackResult = {
    batchId: opts.batchId ?? null, opGroup: opts.opGroup,
    total: entries.length, deleted: 0, restored: 0, alreadyReverted: 0,
    missing: 0, changedAfterwards: 0, blocked: 0, details: [],
  };

  for (const e of entries) {
    const tbl = TABLES[e.tableName as AuditTable];
    if (!tbl) {
      res.blocked++;
      res.details.push({ table: e.tableName, rowId: e.rowId, op: e.op, result: 'BLOCKED', note: 'جدول در فهرست مجاز واگرد نیست.' });
      continue;
    }
    const idCol = (tbl as unknown as { id: never }).id;
    const [current] = await db.select().from(tbl as never).where(eq(idCol, e.rowId as never)).limit(1) as Record<string, unknown>[];

    if (!current) {
      res.missing++;
      await db.update(migration_audit_entries)
        .set({ revertedAt: new Date(), revertNote: 'سطر دیگر وجود نداشت.' })
        .where(eq(migration_audit_entries.id, e.id));
      res.details.push({ table: e.tableName, rowId: e.rowId, op: e.op, result: 'MISSING' });
      continue;
    }

    // آیا بعد از مهاجرت کسی دستی تغییرش داده؟
    const after = (e.afterData ?? null) as Record<string, unknown> | null;
    if (after && !opts.force) {
      const drifted = Object.entries(after).filter(([k, v]) => !sameValue(current[k], v));
      if (drifted.length) {
        res.changedAfterwards++;
        res.details.push({
          table: e.tableName, rowId: e.rowId, op: e.op, result: 'CHANGED_AFTER',
          note: `پس از مهاجرت تغییر کرده: ${drifted.map(([k]) => k).join('، ')} — با «واگرد اجباری» قابل انجام است.`,
        });
        continue;
      }
    }

    try {
      if (e.op === 'INSERT') {
        await db.delete(tbl as never).where(eq(idCol, e.rowId as never));
        res.deleted++;
        res.details.push({ table: e.tableName, rowId: e.rowId, op: e.op, result: 'DELETED' });
      } else {
        const before = (e.beforeData ?? {}) as Record<string, unknown>;
        if (Object.keys(before).length) await db.update(tbl as never).set(before as never).where(eq(idCol, e.rowId as never));
        res.restored++;
        res.details.push({ table: e.tableName, rowId: e.rowId, op: e.op, result: 'RESTORED' });
      }
      await db.update(migration_audit_entries)
        .set({ revertedAt: new Date(), revertNote: opts.force ? 'واگرد اجباری' : null })
        .where(eq(migration_audit_entries.id, e.id));
    } catch (err) {
      // معمولاً نقض کلید خارجی: سطر جای دیگری استفاده شده است
      res.blocked++;
      res.details.push({
        table: e.tableName, rowId: e.rowId, op: e.op, result: 'BLOCKED',
        note: (err as Error).message?.slice(0, 200),
      });
    }
  }

  if (opts.batchId) {
    await db.update(legacy_import_batches)
      .set({ status: res.blocked || res.changedAfterwards ? 'PARTIAL' : 'ROLLED_BACK', rolledBackAt: new Date() })
      .where(eq(legacy_import_batches.id, opts.batchId));
  }

  log.info('rollback', { batchId: opts.batchId, opGroup: opts.opGroup, ...{ total: res.total, deleted: res.deleted, restored: res.restored, blocked: res.blocked } });
  return res;
}

/** خلاصهٔ آنچه یک دسته/گروه روی جدول‌های عملیاتی نوشته است (پیش‌نمایش واگرد) */
export async function auditSummary(opts: { batchId?: number; opGroup?: string; sourceCode?: string }) {
  const conds = [];
  if (opts.batchId) conds.push(eq(migration_audit_entries.batchId, opts.batchId));
  if (opts.opGroup) conds.push(eq(migration_audit_entries.opGroup, opts.opGroup));
  if (opts.sourceCode) conds.push(eq(migration_audit_entries.sourceCode, opts.sourceCode));
  const rows = await db.select({
    tableName: migration_audit_entries.tableName,
    op: migration_audit_entries.op,
    reverted: sql<number>`count(*) filter (where "revertedAt" is not null)::int`,
    n: sql<number>`count(*)::int`,
  }).from(migration_audit_entries)
    .where(conds.length ? and(...conds) : sql`true`)
    .groupBy(migration_audit_entries.tableName, migration_audit_entries.op)
    .orderBy(asc(migration_audit_entries.tableName));
  return rows.map(r => ({ table: r.tableName, op: r.op, count: Number(r.n), reverted: Number(r.reverted) }));
}

/** گروه‌های عملیاتی بدون دسته (اعمال نمره/فرمول/تراز) برای نمایش در فهرست واگرد */
export async function auditGroups(sourceCode: string) {
  const rows = await db.select({
    opGroup: migration_audit_entries.opGroup,
    batchId: migration_audit_entries.batchId,
    n: sql<number>`count(*)::int`,
    open: sql<number>`count(*) filter (where "revertedAt" is null)::int`,
    last: sql<string>`max("createdAt")::text`,
  }).from(migration_audit_entries)
    .where(eq(migration_audit_entries.sourceCode, sourceCode))
    .groupBy(migration_audit_entries.opGroup, migration_audit_entries.batchId)
    .orderBy(desc(sql`max("createdAt")`));
  return rows.map(r => ({
    opGroup: r.opGroup, batchId: r.batchId, count: Number(r.n),
    revertable: Number(r.open), at: r.last,
  }));
}

/** حذف سندهای واگردشدهٔ قدیمی (نگه‌داری فضای دیتابیس) */
export async function purgeRevertedAudit(sourceCode: string) {
  const ids = await db.select({ id: migration_audit_entries.id }).from(migration_audit_entries)
    .where(and(eq(migration_audit_entries.sourceCode, sourceCode), sql`"revertedAt" is not null`));
  if (ids.length) await db.delete(migration_audit_entries).where(inArray(migration_audit_entries.id, ids.map(i => i.id)));
  return ids.length;
}
