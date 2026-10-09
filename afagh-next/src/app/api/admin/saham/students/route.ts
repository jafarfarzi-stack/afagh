import { NextRequest, NextResponse } from 'next/server';
import { requireMigrationAdmin } from '@/lib/migration/http';
import { buildSahamWorkbook, type SahamKind } from '@/lib/saham/build';
import { fetchSahamStudents } from '@/lib/saham/student-rows';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * گزارش سهام با فیلتر سمت سرور (مشکل سرعت + خروجی ۳۹هزاری حل شد):
 *   GET /api/admin/saham/students?universityId=1&kind=students&status=ACTIVE&majorId=3&entryFrom=1400&entryTo=1404&limit=5000
 *   GET ...&kind=graduates&gradFrom=1403/01/01&gradTo=1404/12/29
 *   GET ...&kind=instructors&termId=111
 *   GET ...&preview=1   → فقط تعداد (بدون ساخت فایل)
 */

const KINDS: SahamKind[] = ['students', 'graduates', 'instructors'];

function num(v: string | null): number | undefined {
  if (v == null || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(req: NextRequest) {
  const auth = await requireMigrationAdmin();
  if ('res' in auth) return auth.res;

  const q = req.nextUrl.searchParams;
  const universityId = Number(q.get('universityId') || 0);
  if (!universityId) {
    return NextResponse.json({ error: 'شناسهٔ دانشگاه لازم است.' }, { status: 400 });
  }
  const kind = (q.get('kind') || 'students') as SahamKind;
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: 'نوع گزارش نامعتبر است.' }, { status: 400 });
  }

  const filters = {
    status: q.get('status') || undefined,
    majorId: num(q.get('majorId')),
    facultyId: num(q.get('facultyId')),
    entryYearFrom: num(q.get('entryFrom')),
    entryYearTo: num(q.get('entryTo')),
    graduateFrom: q.get('gradFrom') || undefined,
    graduateTo: q.get('gradTo') || undefined,
    termId: num(q.get('termId')),
    limit: num(q.get('limit')),
  };

  try {
    // پیش‌نمایش تعداد — بدون ساخت فایل
    if (q.get('preview') === '1') {
      if (kind === 'instructors') {
        if (!filters.termId) return NextResponse.json({ error: 'انتخاب نیمسال لازم است.' }, { status: 400 });
        // تعداد دقیق با کوئری سبک
        const { db } = await import('@/db');
        const { sql } = await import('drizzle-orm');
        const n = (await db.execute<{ n: number } & Record<string, unknown>>(sql`
          SELECT count(DISTINCT o."professorId")::int AS n
          FROM course_offerings o JOIN staff st ON st.id = o."professorId"
          WHERE o."termId" = ${filters.termId} AND o."professorId" IS NOT NULL
            AND o."isActive" = 1 AND st."universityId" = ${universityId}
        `)).rows[0]?.n ?? 0;
        return NextResponse.json({ total: n });
      }
      const sf = kind === 'graduates' ? { ...filters, status: 'GRADUATED' } : filters;
      const { total } = await fetchSahamStudents(universityId, { ...sf, limit: 1 });
      return NextResponse.json({ total });
    }

    if (kind === 'instructors' && !filters.termId) {
      return NextResponse.json({ error: 'برای گزارش آموزشگران انتخاب نیمسال لازم است.' }, { status: 400 });
    }
    const { buf, fileName, count, total, hasMore } = await buildSahamWorkbook(universityId, kind, filters);
    if (count === 0) {
      return NextResponse.json({ error: 'با این فیلتر رکوردی یافت نشد.' }, { status: 404 });
    }
    const asciiName = `saham-${kind}-uni${universityId}.xlsx`;
    const res = new NextResponse(new Uint8Array(buf), {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'cache-control': 'no-store',
      },
    });
    res.headers.set('x-row-count', String(count));
    res.headers.set('x-row-total', String(total));
    res.headers.set('x-has-more', hasMore ? '1' : '0');
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
