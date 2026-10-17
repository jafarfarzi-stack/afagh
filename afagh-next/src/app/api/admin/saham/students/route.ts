import { NextRequest, NextResponse } from 'next/server';
import { requireMigrationAdmin } from '@/lib/migration/http';
import { db } from '@/db';
import { universities } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { buildSahamWorkbook, buildSahamWorkbookMany, type SahamKind } from '@/lib/saham/build';
import { fetchSahamStudents } from '@/lib/saham/student-rows';
import { authorizedUniversityIds } from '@/lib/university-scope';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * گزارش سهام با فیلتر سمت سرور:
 *   GET /api/admin/saham/students?universityId=1&kind=students&status=ACTIVE&majorId=3&entryFrom=1400&entryTo=1404&limit=5000
 *   GET ...&kind=graduates&gradFrom=1403/01/01&gradTo=1404/12/29
 *   GET ...&kind=instructors&termId=111
 *   GET ...&preview=1   → فقط تعداد (بدون ساخت فایل)
 *   GET ...&all=1       → یک فایل برای **همهٔ مؤسسه‌های مجاز** (خروجی «دانلود همه»)
 */

const KINDS: SahamKind[] = ['students', 'graduates', 'instructors'];

function num(v: string | null): number | undefined {
  if (v == null || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * شناسهٔ مؤسسه‌های مجازِ کاربر (سمت سرور مشتق می‌شود، هرگز از کلاینت گرفته نمی‌شود).
 * `authorizedUniversityIds()` → `null` یعنی حساب پلتفرمی (همه)، `[]` یعنی deny-all.
 */
async function authorizedIds(): Promise<number[]> {
  const allowed = await authorizedUniversityIds().catch(() => []);
  if (allowed === null) {
    const rows = await db.select({ id: universities.id }).from(universities).where(eq(universities.isActive, 1));
    return rows.map((r) => r.id);
  }
  return allowed;
}

export async function GET(req: NextRequest) {
  const auth = await requireMigrationAdmin();
  if ('res' in auth) return auth.res;

  const q = req.nextUrl.searchParams;
  const wantAll = q.get('all') === '1';
  const universityId = Number(q.get('universityId') || 0);
  // انتخاب چندگانه: `universityId=1,2,4`  (یا `all=1` = همهٔ مجازها)
  const picked = (q.get('universityId') || '')
    .split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);

  // 🔒 هرگز به شناسه‌های ارسالی کلاینت اعتماد نمی‌کنیم: با فهرست مجاز تلاقی می‌دهیم
  let ids: number[] = [];
  if (wantAll) {
    ids = await authorizedIds();
  } else if (picked.length) {
    const allowed = await authorizedIds();
    ids = picked.filter((id) => allowed.includes(id));
  } else if (universityId > 0) {
    const allowed = await authorizedIds();
    ids = allowed.includes(universityId) ? [universityId] : [];
  }
  if (!ids.length) {
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
    // ── پیش‌نمایش تعداد (بدون ساخت فایل) ──
    if (q.get('preview') === '1') {
      if (kind === 'instructors') {
        if (!filters.termId) return NextResponse.json({ error: 'انتخاب نیمسال لازم است.' }, { status: 400 });
        const { sql } = await import('drizzle-orm');
        let n = 0;
        for (const id of ids) {
          n += (await db.execute<{ n: number } & Record<string, unknown>>(sql`
            SELECT count(DISTINCT o."professorId")::int AS n
            FROM course_offerings o JOIN staff st ON st.id = o."professorId"
            WHERE o."termId" = ${filters.termId} AND o."professorId" IS NOT NULL
              AND o."isActive" = 1 AND st."universityId" = ${id}
          `)).rows[0]?.n ?? 0;
        }
        return NextResponse.json({ total: n });
      }
      const sf = kind === 'graduates' ? { ...filters, status: 'GRADUATED' } : filters;
      let total = 0;
      for (const id of ids) {
        total += (await fetchSahamStudents(id, { ...sf, limit: 1 })).total;
      }
      return NextResponse.json({ total });
    }

    if (kind === 'instructors' && !filters.termId) {
      return NextResponse.json({ error: 'برای گزارش آموزشگران انتخاب نیمسال لازم است.' }, { status: 400 });
    }

    // ── ساخت فایل: یک مؤسسه، یا یک فایل تجمیعی برای همه ──
    const built = ids.length === 1
      ? await buildSahamWorkbook(ids[0], kind, filters)
      : await buildSahamWorkbookMany(ids, kind, filters);

    if (built.count === 0) {
      return NextResponse.json({ error: 'با این فیلتر رکوردی یافت نشد.' }, { status: 404 });
    }
    const suffix = ids.length === 1 ? `uni${ids[0]}` : `${ids.length}uni`;
    const asciiName = `saham-${kind}-${suffix}.xlsx`;
    const res = new NextResponse(new Uint8Array(built.buf), {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(built.fileName)}`,
        'cache-control': 'no-store',
      },
    });
    res.headers.set('x-row-count', String(built.count));
    res.headers.set('x-row-total', String(built.total));
    res.headers.set('x-has-more', built.hasMore ? '1' : '0');
    return res;
  } catch (e) {
    // 🔒 پیام خام (SQL/فایل‌سیستم) به کلاینت برنمی‌گردد — فقط لاگ سرور.
    console.error('[api] saham/students failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'خطای داخلی سرور؛ دوباره تلاش کنید.' }, { status: 500 });
  }
}
