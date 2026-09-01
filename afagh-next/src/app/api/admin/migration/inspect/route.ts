import { NextRequest, NextResponse } from 'next/server';
import { parseTabular } from '@/lib/migration/tabular';
import { readUpload, requireMigrationAdmin } from '@/lib/migration/http';
import { inspectTables } from '@/lib/migration/fields';
import { createLogger, requestId } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * گام ۱ جادوگر آپلود: «فایل را بررسی کن و بگو چه فهمیدی».
 * چیزی در دیتابیس نوشته نمی‌شود؛ فقط شیت‌ها، سرستون‌ها، حدسِ نگاشت ستون‌ها و
 * چند سطر نمونه برگردانده می‌شود تا کاربر پیش از واردسازی، نگاشت را اصلاح کند.
 */
export async function POST(req: NextRequest) {
  const auth = await requireMigrationAdmin();
  if ('res' in auth) return auth.res;

  const rid = requestId(req);
  const log = createLogger({ rid, route: 'migration.inspect', userId: auth.user.id });

  const form = await req.formData();
  const kind = String(form.get('kind') || '');
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'فایلی ارسال نشد.' }, { status: 400 });

  try {
    const buf = await readUpload(file);
    const tables = parseTabular(file.name, buf);
    if (!tables.length) return NextResponse.json({ error: 'در فایل هیچ جدولی پیدا نشد.' }, { status: 400 });

    const result = inspectTables(kind, tables);
    log.info('inspect', { kind, sheets: tables.length, fileName: file.name });
    return NextResponse.json({ fileName: file.name, ...result }, { headers: { 'x-request-id': rid } });
  } catch (e) {
    log.error('inspect_failed', { kind, err: e });
    return NextResponse.json({ error: (e as Error).message || 'خطا در خواندن فایل' }, { status: 400 });
  }
}
