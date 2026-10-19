import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { universities } from '@/db/schema';
import { getSessionUser } from '@/lib/auth';
import { canActOnUniversity, UNIVERSITY_COOKIE } from '@/lib/university-scope';
import { assertCsrf } from '@/lib/security';
import { universitySwitchTarget } from '@/lib/scope-switch';

export const dynamic = 'force-dynamic';

/**
 * تغییر «دانشگاه فعال» با یک POST و پاسخ ۳۰۳.
 *
 * چرا Route Handler و نه Server Action؟ اکشن، صفحهٔ جاری را با کوکی جدید
 * دوباره رندر می‌کند؛ اگر آن صفحه یک جزئیاتِ متعلق به دانشگاه قبلی باشد
 * (مثل پروندهٔ مالی یک دانشجو) به `notFound()` می‌رسد و «صفحه پیدا نشد»
 * می‌ماند تا رفرش دستی. اینجا کوکی در همان پاسخ ست می‌شود و مرورگر با یک
 * درخواست GET کامل به صفحهٔ امن برمی‌گردد.
 *
 * Location نسبی است (نه absolute) تا پشت پروکسی/Caddy هم درست کار کند.
 */
const AREA_ROLES = [
  'ADMIN',
  'EDU_EXPERT',
  'ARCHIVE_EXPERT',
  'FINANCE_EXPERT',
  'FINANCE',
  'MILITARY_OFFICER',
  'VAULT_MANAGER',
  'DEP_HEAD',
  'VICE_EDU',
];

function redirect(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

function secureCookie(): boolean {
  const mode = (process.env.AFAGH_COOKIE_SECURE ?? 'auto').toLowerCase();
  if (mode === 'true') return true;
  if (mode === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

export async function POST(req: NextRequest) {
  // جلوگیری از CSRF (کوکی نشست روی HTTPS ممکن است SameSite=None باشد)
  const csrf = assertCsrf(req);
  if (csrf) return csrf;

  const back = universitySwitchTarget(req.headers.get('referer'));

  const me = await getSessionUser().catch(() => null);
  if (!me) return redirect('/login');
  if (!me.roles.some(r => AREA_ROLES.includes(r))) return redirect('/');

  let code = '';
  try {
    const form = await req.formData();
    code = String(form.get('code') ?? '').trim().slice(0, 20);
  } catch { /* بدنهٔ نامعتبر → بدون تغییر */ }
  if (!code) return redirect(back);

  let hit: { id: number; code: string } | undefined;
  try {
    hit = (await db.select({ id: universities.id, code: universities.code })
      .from(universities).where(eq(universities.code, code)).limit(1))[0];
  } catch {
    return redirect(back); // DB در دسترس نیست — تغییر نمی‌دهیم
  }
  // مرز واحد: همان محاسبه‌ای که getCurrentUniversity بر پایهٔ آن تصمیم می‌گیرد
  if (!hit || !(await canActOnUniversity(hit.id).catch(() => false))) return redirect(back);

  const res = redirect(back);
  res.cookies.set(UNIVERSITY_COOKIE, hit.code, {
    path: '/',
    maxAge: 365 * 24 * 3600,
    httpOnly: true,
    secure: secureCookie(),
    sameSite: 'lax',
  });
  return res;
}
