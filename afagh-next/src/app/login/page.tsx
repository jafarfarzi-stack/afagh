'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { homeForClient } from './roles';
import { loginAndReport } from './actions';

export default function LoginPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // پیام‌های بازگشتی (مثلاً کاربر بدون نقش) — بدون نیاز به useSearchParams
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get('e');
    if (e === 'norole') setErr('ورود موفق بود، اما برای این حساب هیچ نقشی تعریف نشده است. با مدیر سامانه تماس بگیرید.');
    if (e === 'expired') setErr('نشست شما منقضی شده است. دوباره وارد شوید.');
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    const res = await loginAndReport(code, pass).catch(() => null);
    if (!res) {
      setErr('ارتباط با سرور برقرار نشد. اگر پیش‌نمایش را داخل همین صفحه می‌بینید، آن را در تب جدید باز کنید و دوباره وارد شوید.');
      setBusy(false); return;
    }
    if (!res.ok) { setErr(res.error || 'خطا'); setBusy(false); return; }
    // حساب تازه‌پذیرش‌شده با رمز پیش‌فرض → ابتدا تغییر اجباری رمز
    if (res.mustChange) {
      router.replace('/change-password');
      router.refresh();
      return;
    }
    // مسیر پس از ورود را سرور تعیین می‌کند؛ refresh لازم است تا کوکی تازه اعمال شود
    router.replace(homeForClient());
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-xl font-bold text-white">آ</div>
          <h1 className="text-lg font-bold">سامانه جامع آفاق</h1>
          <p className="text-xs text-slate-500">ورود با کد ملی و رمز عبور</p>
        </div>
        <input className="input text-left" dir="ltr" placeholder="کد ملی" value={code} onChange={e => setCode(e.target.value)} />
        <input className="input text-left" dir="ltr" type="password" placeholder="رمز عبور" value={pass} onChange={e => setPass(e.target.value)} />
        {err && <p className="rounded-xl bg-red-50 p-2 text-center text-sm text-red-700">{err}</p>}
        <button className="btn-primary w-full" disabled={busy || !code || !pass}>{busy ? 'در حال ورود…' : 'ورود'}</button>
      </form>
    </main>
  );
}
