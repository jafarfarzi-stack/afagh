import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms } from '@/db/schema';
import { getSessionUser } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { TERM_COOKIE } from '@/lib/term-scope';
import { assertCsrf } from '@/lib/security';
import { safeBackPath } from '@/lib/scope-switch';

export const dynamic = 'force-dynamic';

/**
 * تغییر «نیمسال فعال» با یک POST و پاسخ ۳۰۳ (به همان صفحه).
 *
 * پیش‌تر Server Action + `window.location.reload()` بود؛ اکشن صفحهٔ جاری را
 * با کوکی جدید دوباره رندر می‌کند و اگر همان رندر به `notFound()` برسد،
 * «صفحه پیدا نشد» تا رفرش دستی می‌ماند. اینجا کوکی در پاسخِ ریدایرکت ست
 * می‌شود و صفحه با یک GET کامل و کوکی جدید لود می‌شود.
 *
 * Location نسبی است تا پشت پروکسی هم امن بماند.
 */
function redirect(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function POST(req: NextRequest) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;

  const back = safeBackPath(req.headers.get('referer'));

  const me = await getSessionUser().catch(() => null);
  if (!me) return redirect('/login');

  let raw = '';
  try {
    const form = await req.formData();
    raw = String(form.get('termId') ?? '').trim();
  } catch { /* بدنهٔ نامعتبر */ }

  // «همهٔ نیمسال‌ها» = پاک کردن کوکی
  if (!raw) {
    const res = redirect(back);
    res.cookies.set(TERM_COOKIE, '', { path: '/', maxAge: 0, sameSite: 'lax' });
    return res;
  }

  const termId = Number(raw);
  if (!Number.isFinite(termId) || termId <= 0) return redirect(back);

  const uni = await getCurrentUniversity().catch(() => null);
  if (!uni || !(uni.id > 0)) return redirect(back);

  // فقط ترمی پذیرفته می‌شود که واقعاً متعلق به دانشگاه فعال است
  let hit: { id: number } | undefined;
  try {
    hit = (await db.select({ id: academic_terms.id })
      .from(academic_terms)
      .where(and(eq(academic_terms.id, termId), eq(academic_terms.universityId, uni.id)))
      .limit(1))[0];
  } catch {
    return redirect(back);
  }
  if (!hit) return redirect(back);

  const res = redirect(back);
  res.cookies.set(TERM_COOKIE, String(hit.id), {
    path: '/',
    maxAge: 365 * 24 * 3600,
    sameSite: 'lax',
  });
  return res;
}
