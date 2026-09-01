import { NextRequest, NextResponse } from 'next/server';
import { exportCodeMaps, exportCompareRun, exportFinancial, exportGrades } from '@/lib/migration/workbook';
import type { MapDomain } from '@/lib/migration/codemap';
import { requireMigrationAdmin, xlsxResponse } from '@/lib/migration/http';

export const dynamic = 'force-dynamic';

/** خروجی اکسل: نگاشت کدها، مقایسهٔ شهریه، نمرات، مالی قدیمی */
export async function GET(req: NextRequest) {
  const auth = await requireMigrationAdmin();
  if ('res' in auth) return auth.res;

  const q = req.nextUrl.searchParams;
  const kind = q.get('kind') || 'codes';
  const sourceCode = (q.get('sourceCode') || 'LEGACY').toUpperCase();

  try {
    if (kind === 'codes') {
      const domain = (q.get('domain') || '') as MapDomain;
      const { buf, fileName } = await exportCodeMaps(sourceCode, domain || undefined);
      return xlsxResponse(buf, fileName);
    }
    if (kind === 'tuition-compare') {
      const runId = Number(q.get('runId') || 0);
      if (!runId) return NextResponse.json({ error: 'شناسهٔ اجرا لازم است.' }, { status: 400 });
      const { buf, fileName } = await exportCompareRun(runId);
      return xlsxResponse(buf, fileName);
    }
    if (kind === 'grades') {
      const { buf, fileName } = await exportGrades(sourceCode, q.get('termCode') || undefined);
      return xlsxResponse(buf, fileName);
    }
    if (kind === 'legacy-financial') {
      const { buf, fileName } = await exportFinancial(sourceCode);
      return xlsxResponse(buf, fileName);
    }
    return NextResponse.json({ error: 'نوع خروجی نامعتبر' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
