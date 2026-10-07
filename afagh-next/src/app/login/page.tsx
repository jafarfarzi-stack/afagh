'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { homeForClient } from './roles';
import { chooseLoginAccountAction, loginAndReport } from './actions';

type Candidate = {
  id: number; name: string; staffCodes: string[]; universityTitle: string | null; roles: string[];
};

export default function LoginPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState<{ token: string; candidates: Candidate[] } | null>(null);

  // پیام‌های بازگشتی (مثلاً کاربر بدون نقش) — بدون نیاز به useSearchParams
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get('e');
    if (e === 'norole') setErr('ورود موفق بود، اما برای این حساب هیچ نقشی تعریف نشده است. با مدیر سامانه تماس بگیرید.');
    if (e === 'expired') setErr('نشست شما منقضی شده است. دوباره وارد شوید.');
  }, []);

  function afterOk(mustChange?: boolean) {
    if (mustChange) {
      router.replace('/change-password');
      router.refresh();
      return;
    }
    // مسیر پس از ورود را سرور تعیین می‌کند؛ refresh لازم است تا کوکی تازه اعمال شود
    router.replace(homeForClient());
    router.refresh();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // اعتبارسنجی داخل submit، نه صرفاً غیرفعال‌کردن دکمه — چون در برخی مرورگرهای
    // قدیمی رویداد onChange برای autofill/برخی روش‌های تایپ ممکن است به‌درستی
    // شلیک نشود و دکمه‌ی صرفاً وابسته به state برای همیشه غیرفعال بماند.
    if (!code.trim() || !pass) { setErr('کد (ملی یا پرسنلی) و رمز عبور را وارد کنید.'); return; }
    setBusy(true); setErr(''); setChoice(null);
    const res = await loginAndReport(code, pass).catch(() => null);
    if (!res) {
      setErr('ارتباط با سرور برقرار نشد. اگر پیش‌نمایش را داخل همین صفحه می‌بینید، آن را در تب جدید باز کنید و دوباره وارد شوید.');
      setBusy(false); return;
    }
    if ((res as { needChoice?: boolean }).needChoice) {
      const r = res as unknown as { token: string; candidates: Candidate[] };
      setChoice({ token: r.token, candidates: r.candidates || [] });
      setBusy(false); return;
    }
    if (!res.ok) { setErr(res.error || 'خطا'); setBusy(false); return; }
    // حساب تازه‌پذیرش‌شده با رمز پیش‌فرض → ابتدا تغییر اجباری رمز
    afterOk(res.mustChange);
  }

  async function pick(id: number) {
    if (!choice) return;
    setBusy(true); setErr('');
    const res = await chooseLoginAccountAction(choice.token, id).catch(() => null);
    if (!res) { setErr('ارتباط با سرور برقرار نشد.'); setBusy(false); return; }
    if (!res.ok) { setErr(res.error || 'خطا'); setBusy(false); return; }
    afterOk(res.mustChange);
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-xl font-bold text-white">آ</div>
          <h1 className="text-lg font-bold">سامانه جامع آفاق</h1>
          <p className="text-xs text-slate-500">ورود با کد ملی / کد پرسنلی و رمز عبور</p>
        </div>
        {!choice ? (
          <>
            <input className="input text-left" dir="ltr" placeholder="کد ملی یا کد پرسنلی" value={code} onChange={e => setCode(e.target.value)} name="code" autoComplete="username" />
            <input className="input text-left" dir="ltr" type="password" placeholder="رمز عبور" value={pass} onChange={e => setPass(e.target.value)} name="password" autoComplete="current-password" />
            {err && <p className="rounded-xl bg-red-50 p-2 text-center text-sm text-red-700">{err}</p>}
            <button className="btn-primary w-full" disabled={busy}>{busy ? 'در حال ورود…' : 'ورود'}</button>
          </>
        ) : (
          <>
            <p className="rounded-xl bg-amber-50 p-2 text-center text-sm font-bold text-amber-900">
              این شناسه چند حساب دارد — وارد کدام کارتابل می‌شوید؟
            </p>
            <div className="space-y-2">
              {choice.candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={busy}
                  onClick={() => pick(c.id)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-right shadow-xs transition hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-60"
                >
                  <span className="block text-sm font-extrabold text-slate-900">{c.name}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {c.staffCodes.length ? `کد پرسنلی: ${c.staffCodes.join('، ')}` : 'بدون کد پرسنلی'}
                    {c.universityTitle ? ` · ${c.universityTitle}` : ''}
                  </span>
                </button>
              ))}
            </div>
            {err && <p className="rounded-xl bg-red-50 p-2 text-center text-sm text-red-700">{err}</p>}
            <button type="button" className="w-full text-center text-xs text-slate-500 hover:underline" disabled={busy} onClick={() => { setChoice(null); setErr(''); }}>
              بازگشت به ورود
            </button>
          </>
        )}
      </form>
    </main>
  );
}
