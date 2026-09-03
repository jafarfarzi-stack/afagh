import { NextRequest, NextResponse } from 'next/server';
import { parseTabular, pickTable, type Table } from '@/lib/migration/tabular';
import { readUpload, requireMigrationAdmin } from '@/lib/migration/http';
import { assertSameOrigin } from '@/lib/security';
import { createBatch, finalizeBatch, importerFor, storeRows } from '@/lib/migration/batches';
import { FIELD_SPECS } from '@/lib/migration/fields';
import { createLogger, requestId } from '@/lib/logger';
import { db } from '@/db';
import { migration_runs } from '@/db/schema';

export const dynamic = 'force-dynamic';

/**
 * واردسازی اکسل/CSV برای ماژول‌های تخصصی: تطبیق کدها، فرمول شهریه، مالی قدیمی، نمرات.
 * جریان: فایل → ناحیهٔ موقت (سطرهای خام JSONB) → پردازش → گزارش.
 * پارامترهای اختیاری فرم:
 *   sheet      نام شیتی که کاربر در گام «بررسی ستون‌ها» انتخاب کرده
 *   columnMap  JSON نگاشت دستی ستون‌ها { کلید فیلد: شمارهٔ ستون }
 */
export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;
  const auth = await requireMigrationAdmin();
  if ('res' in auth) return auth.res;

  const rid = requestId(req);
  const log = createLogger({ rid, route: 'migration.import', userId: auth.user.id });
  const t0 = Date.now();

  const form = await req.formData();
  const kind = String(form.get('kind') || '');
  const sourceCode = (String(form.get('sourceCode') || 'LEGACY').trim() || 'LEGACY').toUpperCase();
  const sheetWanted = String(form.get('sheet') || '').trim();
  const columnMapRaw = String(form.get('columnMap') || '').trim();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'فایلی ارسال نشد.' }, { status: 400 });

  const importer = importerFor(kind);
  if (!importer) return NextResponse.json({ error: 'نوع واردسازی نامعتبر است.' }, { status: 400 });

  try {
    const buf = await readUpload(file);
    const tables = parseTabular(file.name, buf);
    if (!tables.length) return NextResponse.json({ error: 'در فایل هیچ جدولی پیدا نشد.' }, { status: 400 });

    // انتخاب شیت: ترجیح کاربر، وگرنه شیتی که بیشترین ستون مورد انتظار را دارد
    const specs = FIELD_SPECS[kind] ?? [];
    const chosen: Table =
      (sheetWanted && tables.find(t => t.sheet === sheetWanted)) ||
      pickTable(tables, specs.map(sp => sp.aliases)) ||
      tables[0];

    let columnMap: Record<string, number> | null = null;
    if (columnMapRaw) {
      try {
        const parsed = JSON.parse(columnMapRaw) as Record<string, unknown>;
        columnMap = Object.fromEntries(
          Object.entries(parsed)
            .filter(([, v]) => v !== null && v !== '' && Number.isFinite(Number(v)))
            .map(([k, v]) => [k, Number(v)]),
        );
        chosen.columnMap = columnMap;
      } catch {
        return NextResponse.json({ error: 'نگاشت ستون‌ها معتبر نیست.' }, { status: 400 });
      }
    }

    // ۱) ناحیهٔ موقت: سطرهای خام پیش از هر پردازشی ذخیره می‌شوند
    const batchId = await createBatch({
      sourceCode, importType: kind, fileName: file.name, sheetName: chosen.sheet,
      headers: chosen.headers, columnMap, userId: auth.user.id,
    });
    const stored = await storeRows(batchId, chosen);

    // ۲) پردازش
    const report = await importer(auth.user.id, sourceCode, [chosen], file.name, batchId);

    // ۳) نشاندن نتیجه روی سطرها (سطرهای خطادار قابل پردازش دوباره می‌مانند)
    await finalizeBatch(batchId, report);

    await db.insert(migration_runs).values({
      entity: kind, fileName: file.name, mode: 'IMPORT', totalRows: report.total,
      inserted: report.inserted, skippedExisting: report.updated, invalid: report.invalid,
      report: JSON.stringify({ ...report, batchId }),
      status: report.invalid && !report.inserted && !report.updated ? 'FAILED' : 'OK',
      triggeredByUserId: auth.user.id,
    });

    log.info('import_done', {
      kind, sourceCode, batchId, sheet: chosen.sheet, stored,
      total: report.total, inserted: report.inserted, updated: report.updated,
      invalid: report.invalid, ms: Date.now() - t0,
    });

    return NextResponse.json({ ...report, batchId, sheets: tables.map(t => t.sheet) }, { headers: { 'x-request-id': rid } });
  } catch (e) {
    log.error('import_failed', { kind, sourceCode, ms: Date.now() - t0, err: e });
    return NextResponse.json({ error: (e as Error).message || 'خطا در خواندن فایل' }, { status: 400 });
  }
}
