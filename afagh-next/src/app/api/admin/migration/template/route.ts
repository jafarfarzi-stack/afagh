import { NextRequest, NextResponse } from 'next/server';
import { buildTemplate, templateKinds, type WorkbookKind } from '@/lib/migration/workbook';
import { requireMigrationAdmin, xlsxResponse } from '@/lib/migration/http';

export const dynamic = 'force-dynamic';

/** دانلود قالب خام اکسل برای هر نوع داده */
export async function GET(req: NextRequest) {
  const auth = await requireMigrationAdmin();
  if ('res' in auth) return auth.res;

  const kind = (req.nextUrl.searchParams.get('kind') || 'grades') as WorkbookKind;
  if (!templateKinds().some(k => k.id === kind)) return NextResponse.json({ error: 'نوع قالب نامعتبر' }, { status: 400 });
  const { buf, fileName } = buildTemplate(kind);
  return xlsxResponse(buf, fileName);
}
