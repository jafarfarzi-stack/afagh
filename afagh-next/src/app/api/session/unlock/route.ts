import { NextRequest, NextResponse } from 'next/server';
import { verifyOwnPasswordCore } from '@/lib/step-up-actions';
import { assertCsrf } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * بازگشایی قفل بیکاری با رمز — مسیر HTTP.
 *
 * همان گاردِ Server Action (`verifyOwnPasswordCore`: سقف ۵ خطا/۱۵دقیقه به‌ازای
 * کاربر + IP، تأخیر تصاعدی، و پاک‌سازی پرچم قفل) را صدا می‌زند. مسیر HTTP را
 * کنار آن گذاشته‌ایم تا اگر Server Action پشت پروکسی/آی‌فریم به‌دلیل بررسی
 * Origin/Host رد شد، کاربر پشت قفل گیر نکند.
 */
export async function POST(req: NextRequest) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  let password = '';
  try {
    const body = (await req.json()) as { password?: unknown } | null;
    password = String(body?.password ?? '');
  } catch { /* بدنهٔ نامعتبر */ }

  if (!password) return NextResponse.json({ ok: false, error: 'رمز عبور را وارد کنید.' }, { status: 400 });

  const r = await verifyOwnPasswordCore(password).catch(() => ({ ok: false, error: 'خطا در ارتباط با سرور.' }));
  return NextResponse.json(r, { status: r.ok ? 200 : 401 });
}
