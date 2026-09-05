import { NextRequest, NextResponse } from 'next/server';
import { dryRun, ENTITIES, logDryRun, type Entity } from '@/lib/migration/engine';
import { parseTabular } from '@/lib/migration/tabular';
import { chooseTable } from '@/lib/migration/fields';
import { readUpload, requireMigrationAdmin } from '@/lib/migration/http';
import { assertSameOrigin } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;
  const auth = await requireMigrationAdmin();
  if ('res' in auth) return auth.res;

  const form = await req.formData();
  const entity = String(form.get('entity') || '') as Entity;
  const file = form.get('file') as File | null;
  // ترجیح کاربر در گام «بررسی ستون‌ها»: کدام شیت و کدام ستون یعنی چه
  const sheetWanted = String(form.get('sheet') || '').trim() || null;
  const columnMapRaw = String(form.get('columnMap') || '').trim() || null;
  if (!ENTITIES.some(e => e.id === entity)) return NextResponse.json({ error: 'نوع داده نامعتبر' }, { status: 400 });
  if (!file) return NextResponse.json({ error: 'فایلی ارسال نشد' }, { status: 400 });

  try {
    const tables = parseTabular(file.name, await readUpload(file));
    if (!tables.length) return NextResponse.json({ error: 'در فایل هیچ جدولی پیدا نشد.' }, { status: 400 });
    const picked = chooseTable(tables, entity, sheetWanted, columnMapRaw);
    if (picked.error) return NextResponse.json({ error: picked.error }, { status: 400 });
    const report = await dryRun(entity, [picked.table], file.name);
    await logDryRun(auth.user.id, report);
    return NextResponse.json({ ...report, sheet: picked.table.sheet, sheets: tables.map(t => t.sheet) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'خطا در خواندن فایل' }, { status: 400 });
  }
}
