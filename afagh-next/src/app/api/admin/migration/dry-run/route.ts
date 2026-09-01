import { NextRequest, NextResponse } from 'next/server';
import { dryRun, ENTITIES, logDryRun, type Entity } from '@/lib/migration/engine';
import { parseTabular } from '@/lib/migration/tabular';
import { readUpload, requireMigrationAdmin } from '@/lib/migration/http';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireMigrationAdmin();
  if ('res' in auth) return auth.res;

  const form = await req.formData();
  const entity = String(form.get('entity') || '') as Entity;
  const file = form.get('file') as File | null;
  if (!ENTITIES.some(e => e.id === entity)) return NextResponse.json({ error: 'نوع داده نامعتبر' }, { status: 400 });
  if (!file) return NextResponse.json({ error: 'فایلی ارسال نشد' }, { status: 400 });

  try {
    const tables = parseTabular(file.name, await readUpload(file));
    const report = await dryRun(entity, tables, file.name);
    await logDryRun(auth.user.id, report);
    return NextResponse.json({ ...report, sheets: tables.map(t => t.sheet) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'خطا در خواندن فایل' }, { status: 400 });
  }
}
