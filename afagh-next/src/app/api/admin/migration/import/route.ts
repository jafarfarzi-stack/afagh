import { NextRequest, NextResponse } from 'next/server';
import { parseTabular } from '@/lib/migration/tabular';
import { importCodeMaps } from '@/lib/migration/workbook';
import { importFinancials, importFormulas } from '@/lib/migration/tuition';
import { importGrades } from '@/lib/migration/grades';
import { readUpload, requireMigrationAdmin } from '@/lib/migration/http';
import { db } from '@/db';
import { migration_runs } from '@/db/schema';

export const dynamic = 'force-dynamic';

/** واردسازی اکسل/CSV برای ماژول‌های تخصصی: تطبیق کدها، فرمول شهریه، مالی قدیمی، نمرات */
export async function POST(req: NextRequest) {
  const auth = await requireMigrationAdmin();
  if ('res' in auth) return auth.res;

  const form = await req.formData();
  const kind = String(form.get('kind') || '');
  const sourceCode = (String(form.get('sourceCode') || 'LEGACY').trim() || 'LEGACY').toUpperCase();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'فایلی ارسال نشد.' }, { status: 400 });

  try {
    const buf = await readUpload(file);
    const tables = parseTabular(file.name, buf);
    if (!tables.length) return NextResponse.json({ error: 'در فایل هیچ جدولی پیدا نشد.' }, { status: 400 });

    const report =
      kind === 'codes' ? await importCodeMaps(auth.user.id, sourceCode, tables, file.name)
      : kind === 'tuition-formula' ? await importFormulas(auth.user.id, sourceCode, tables, file.name)
      : kind === 'legacy-financial' ? await importFinancials(sourceCode, tables, file.name)
      : kind === 'grades' ? await importGrades(sourceCode, tables, file.name)
      : null;

    if (!report) return NextResponse.json({ error: 'نوع واردسازی نامعتبر است.' }, { status: 400 });

    await db.insert(migration_runs).values({
      entity: kind, fileName: file.name, mode: 'IMPORT', totalRows: report.total,
      inserted: report.inserted, skippedExisting: report.updated, invalid: report.invalid,
      report: JSON.stringify(report), status: report.invalid && !report.inserted && !report.updated ? 'FAILED' : 'OK',
      triggeredByUserId: auth.user.id,
    });

    return NextResponse.json({ ...report, sheets: tables.map(t => t.sheet) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'خطا در خواندن فایل' }, { status: 400 });
  }
}
