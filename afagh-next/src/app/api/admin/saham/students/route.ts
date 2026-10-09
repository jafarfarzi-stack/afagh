import { NextRequest, NextResponse } from 'next/server';
import { requireMigrationAdmin, xlsxResponse } from '@/lib/migration/http';
import { buildSahamWorkbook } from '@/lib/saham/build';

export const dynamic = 'force-dynamic';

/**
 * دانلود فایل اکسل گزارش سهام برای یک دانشگاه.
 *   GET /api/admin/saham/students?universityId=1
 */
export async function GET(req: NextRequest) {
  const auth = await requireMigrationAdmin();
  if ('res' in auth) return auth.res;

  const universityId = Number(req.nextUrl.searchParams.get('universityId') || 0);
  if (!universityId) {
    return NextResponse.json({ error: 'شناسهٔ دانشگاه لازم است.' }, { status: 400 });
  }

  try {
    const { buf, fileName, count } = await buildSahamWorkbook(universityId);
    if (count === 0) {
      return NextResponse.json({ error: 'برای این دانشگاه دانشجویی یافت نشد.' }, { status: 404 });
    }
    const res = xlsxResponse(buf, fileName);
    res.headers.set('x-row-count', String(count));
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}