import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { legacy_import_batches, legacy_import_rows, migration_audit_entries } from '@/db/schema';
import { createLogger } from '@/lib/logger';
import { importCodeMaps } from './workbook';
import { importFinancials, importFormulas, type ImportReport } from './tuition';
import { importGrades } from './grades';
import { rawRows } from './fields';
import { iterate, tableFromRaw, type Table } from './tabular';

// ═══ ناحیهٔ موقت (Staging) ═══
// هر فایل آپلودشده یک «دسته» است و همهٔ سطرهایش پیش از هر پردازشی خام (JSONB)
// ذخیره می‌شوند. سود عملی: اگر نگاشت کدها بعداً کامل شد، بدون آپلود دوبارهٔ فایل
// فقط سطرهای خطادار دوباره پردازش می‌شوند؛ و برای واگرد، سند دائمی داریم.

const log = createLogger({ mod: 'migration.batch' });

/** درج تکه‌ای: با فایل‌های ده‌هزار سطری، یک INSERT غول‌پیکر حافظه و پارامترها را می‌ترکاند */
const CHUNK = 500;

export type BatchKind = 'codes' | 'tuition-formula' | 'legacy-financial' | 'grades';

export async function createBatch(input: {
  sourceCode: string; importType: string; fileName: string; sheetName: string;
  headers: string[]; columnMap?: Record<string, number> | null; userId?: number | null; note?: string | null;
}): Promise<number> {
  const [b] = await db.insert(legacy_import_batches).values({
    sourceCode: input.sourceCode, importType: input.importType, fileName: input.fileName,
    sheetName: input.sheetName, headers: JSON.stringify(input.headers),
    columnMap: input.columnMap ? JSON.stringify(input.columnMap) : null,
    status: 'PARSED', createdByUserId: input.userId ?? null, note: input.note ?? null,
  }).returning({ id: legacy_import_batches.id });
  return b.id;
}

/** ذخیرهٔ سطرهای خام (تکه‌تکه) */
export async function storeRows(batchId: number, table: Table): Promise<number> {
  const rows = rawRows(table);
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK).map(r => ({
      batchId, rowNumber: r.rowNumber, rawData: r.rawData as never, validationStatus: 'PENDING',
    }));
    if (slice.length) await db.insert(legacy_import_rows).values(slice);
  }
  await db.update(legacy_import_batches).set({ totalRows: rows.length }).where(eq(legacy_import_batches.id, batchId));
  return rows.length;
}

/** نتیجهٔ پردازش را روی سطرها و خود دسته می‌نشانیم */
export async function finalizeBatch(
  batchId: number, report: ImportReport,
  opts: { lineMap?: Map<number, number> } = {},
): Promise<void> {
  const errLines = new Map<number, string>();
  for (const e of report.errors) {
    const orig = opts.lineMap ? opts.lineMap.get(e.row) ?? e.row : e.row;
    errLines.set(orig, e.msg);
  }

  const all = await db.select({ id: legacy_import_rows.id, rowNumber: legacy_import_rows.rowNumber })
    .from(legacy_import_rows).where(eq(legacy_import_rows.batchId, batchId));

  const okIds: number[] = [];
  for (const r of all) {
    const msg = errLines.get(r.rowNumber);
    if (msg) {
      await db.update(legacy_import_rows)
        .set({ validationStatus: 'ERROR', errorMessage: msg, processedAt: new Date() })
        .where(eq(legacy_import_rows.id, r.id));
    } else okIds.push(r.id);
  }
  for (let i = 0; i < okIds.length; i += CHUNK) {
    await db.update(legacy_import_rows)
      .set({ validationStatus: 'IMPORTED', errorMessage: null, processedAt: new Date() })
      .where(inArray(legacy_import_rows.id, okIds.slice(i, i + CHUNK)));
  }

  const errorRows = all.length - okIds.length;
  await db.update(legacy_import_batches).set({
    okRows: okIds.length, errorRows,
    status: errorRows === 0 ? 'PROCESSED' : okIds.length ? 'PARTIAL' : 'PARSED',
    processedAt: new Date(),
  }).where(eq(legacy_import_batches.id, batchId));

  log.info('batch_finalized', { batchId, ok: okIds.length, errors: errorRows });
}

export type BatchSummary = {
  id: number; sourceCode: string; importType: string; fileName: string | null; sheetName: string | null;
  totalRows: number; okRows: number; errorRows: number; status: string;
  createdAt: string | null; processedAt: string | null; rolledBackAt: string | null;
  auditOpen: number; auditTotal: number;
};

export async function listBatches(sourceCode: string, limit = 50): Promise<BatchSummary[]> {
  const rows = await db.select().from(legacy_import_batches)
    .where(eq(legacy_import_batches.sourceCode, sourceCode))
    .orderBy(desc(legacy_import_batches.id)).limit(limit);
  if (!rows.length) return [];

  const audit = await db.select({
    batchId: migration_audit_entries.batchId,
    total: sql<number>`count(*)::int`,
    open: sql<number>`count(*) filter (where "revertedAt" is null)::int`,
  }).from(migration_audit_entries)
    .where(inArray(migration_audit_entries.batchId, rows.map(r => r.id)))
    .groupBy(migration_audit_entries.batchId);
  const am = new Map(audit.map(a => [a.batchId, a]));

  return rows.map(r => ({
    id: r.id, sourceCode: r.sourceCode, importType: r.importType, fileName: r.fileName,
    sheetName: r.sheetName, totalRows: r.totalRows, okRows: r.okRows, errorRows: r.errorRows,
    status: r.status,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    processedAt: r.processedAt ? new Date(r.processedAt).toISOString() : null,
    rolledBackAt: r.rolledBackAt ? new Date(r.rolledBackAt).toISOString() : null,
    auditTotal: Number(am.get(r.id)?.total ?? 0),
    auditOpen: Number(am.get(r.id)?.open ?? 0),
  }));
}

/** سطرهای یک دسته (پیش‌فرض: فقط خطادارها، برای نمایش به کاربر) */
export async function batchRows(batchId: number, status = 'ERROR', limit = 200) {
  const conds = [eq(legacy_import_rows.batchId, batchId)];
  if (status !== 'ALL') conds.push(eq(legacy_import_rows.validationStatus, status));
  const rows = await db.select().from(legacy_import_rows).where(and(...conds))
    .orderBy(legacy_import_rows.rowNumber).limit(limit);
  return rows.map(r => ({
    id: r.id, rowNumber: r.rowNumber, status: r.validationStatus,
    error: r.errorMessage, data: r.rawData as Record<string, string>,
  }));
}

export type ImporterFn = (userId: number, source: string, tables: Table[], fileName: string, batchId?: number | null) => Promise<ImportReport>;

const IMPORTERS: Record<string, ImporterFn> = {
  codes: (u, s, t, f) => importCodeMaps(u, s, t, f),
  'tuition-formula': (u, s, t, f, b) => importFormulas(u, s, t, f, b),
  'legacy-financial': (_u, s, t, f, b) => importFinancials(s, t, f, b),
  grades: (_u, s, t, f, b) => importGrades(s, t, f, b),
};

export function importerFor(kind: string) {
  return IMPORTERS[kind] ?? null;
}

/**
 * پردازش دوبارهٔ سطرهای خطادار یک دسته — بدون نیاز به آپلود مجدد فایل.
 * سناریوی واقعی: اول ۳۰۰ سطر به‌خاطر «ترم تطبیق‌نخورده» رد می‌شوند، کاربر
 * نگاشت را کامل می‌کند و اینجا فقط همان ۳۰۰ سطر دوباره اجرا می‌شوند.
 */
export async function reprocessBatch(batchId: number, userId: number, opts: { all?: boolean } = {}) {
  const [b] = await db.select().from(legacy_import_batches).where(eq(legacy_import_batches.id, batchId)).limit(1);
  if (!b) throw new Error('دستهٔ موردنظر پیدا نشد.');
  const importer = importerFor(b.importType);
  if (!importer) throw new Error(`پردازش دوبارهٔ نوع «${b.importType}» پشتیبانی نمی‌شود.`);

  const conds = [eq(legacy_import_rows.batchId, batchId)];
  if (!opts.all) conds.push(eq(legacy_import_rows.validationStatus, 'ERROR'));
  const rows = await db.select().from(legacy_import_rows).where(and(...conds)).orderBy(legacy_import_rows.rowNumber);
  if (!rows.length) return { ok: true, reprocessed: 0, report: null as ImportReport | null };

  const headers: string[] = JSON.parse(b.headers || '[]');
  const columnMap: Record<string, number> | null = b.columnMap ? JSON.parse(b.columnMap) : null;
  const table = tableFromRaw(b.sheetName || 'STAGING', headers, rows.map(r => r.rawData as Record<string, unknown>));
  if (columnMap) table.columnMap = columnMap;

  // خط بازسازی‌شده (۲،۳،…) ← شمارهٔ واقعی سطر در فایل اصلی
  const lineMap = new Map<number, number>();
  iterate(table).forEach((r, i) => lineMap.set(r.line, rows[i].rowNumber));

  const report = await importer(userId, b.sourceCode, [table], b.fileName || 'reprocess', batchId);

  const errByOriginal = new Map<number, string>();
  for (const e of report.errors) errByOriginal.set(lineMap.get(e.row) ?? e.row, e.msg);
  for (const r of rows) {
    const msg = errByOriginal.get(r.rowNumber);
    await db.update(legacy_import_rows).set({
      validationStatus: msg ? 'ERROR' : 'IMPORTED',
      errorMessage: msg ?? null, processedAt: new Date(),
    }).where(eq(legacy_import_rows.id, r.id));
  }

  const [agg] = await db.select({
    ok: sql<number>`count(*) filter (where "validationStatus" = 'IMPORTED')::int`,
    err: sql<number>`count(*) filter (where "validationStatus" = 'ERROR')::int`,
  }).from(legacy_import_rows).where(eq(legacy_import_rows.batchId, batchId));

  await db.update(legacy_import_batches).set({
    okRows: Number(agg?.ok ?? 0), errorRows: Number(agg?.err ?? 0),
    status: Number(agg?.err ?? 0) === 0 ? 'PROCESSED' : 'PARTIAL', processedAt: new Date(),
  }).where(eq(legacy_import_batches.id, batchId));

  log.info('batch_reprocessed', { batchId, rows: rows.length, ok: agg?.ok, err: agg?.err });
  return { ok: true, reprocessed: rows.length, report };
}

/** حذف کامل یک دسته از ناحیهٔ موقت (دادهٔ عملیاتی دست نمی‌خورد) */
export async function deleteBatch(batchId: number) {
  await db.delete(legacy_import_rows).where(eq(legacy_import_rows.batchId, batchId));
  await db.delete(legacy_import_batches).where(eq(legacy_import_batches.id, batchId));
  return { ok: true };
}
