import { NextRequest, NextResponse } from 'next/server';
import { requireMigrationAdmin } from '@/lib/migration/http';
import { buildSahamWorkbook } from '@/lib/saham/build';

export const dynamic = 'force-dynamic';

/**
 * دانلود فایل اکسل گزارش سهام برای یک دانشگاه.
 *   GET /api/admin/saham/students?universityId=1
 *
 * نکته: نام فایل فارسی است؛ هدر filename باید ASCII بماند (وگرنه
 * خطای ByteString می‌گیریم) و نام واقعی در filename* می‌رود (RFC 5987).
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
    const asciiName = `saham-students-uni${universityId}.xlsx`;
    const res = new NextResponse(new Uint8Array(buf), {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'cache-control': 'no-store',
      },
    });
    res.headers.set('x-row-count', String(count));
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}