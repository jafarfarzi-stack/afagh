'use client';

import { useState } from 'react';
import { switchAccountAction, type SiblingAccount } from '@/lib/account-switch';

/**
 * بنر «مشاهده با کد دیگر» بالای کارتابل — برای کسی که چند حساب هم‌شخص دارد
 * (استاد دوکده / دانشجوی چندشماره‌ای). جابه‌جایی فقط با رمزِ همان حساب.
 */
export default function AccountSwitcher({ siblings }: { siblings: SiblingAccount[] }) {
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (!siblings.length) return null;

  async function go(s: SiblingAccount) {
    if (!pw) {
      setErr('رمز این حساب را وارد کنید.');
      return;
    }
    setBusy(true);
    setErr('');
    const res = await switchAccountAction(s.kind, s.code, pw).catch(() => null);
    if (!res) {
      setErr('ارتباط با سرور برقرار نشد.');
      setBusy(false);
      return;
    }
    if (!res.ok) {
      setErr(res.error || 'انجام نشد.');
      setBusy(false);
      return;
    }
    // نشست عوض شد — ریشه بر اساس نقشِ حساب جدید مسیریابی می‌کند
    if (res.mustChange) window.location.assign('/change-password');
    else window.location.assign('/');
  }

  return (
    <div className="print:hidden mx-auto max-w-6xl scroll-mt-24 px-4 pt-3" dir="rtl" id="account-switch">
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs shadow-xs">
        <p className="font-extrabold text-amber-900">
          🔀 حساب دیگری با همین کدملی دارید — برای مشاهدهٔ کارتابل آن، انتخاب کنید:
        </p>
        <div className="mt-2 space-y-2">
          {siblings.map((s) => {
            const key = `${s.kind}:${s.code}`;
            return (
              <div key={key} className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2 shadow-xs">
                <span className="font-bold text-slate-800">
                  {s.kind === 'staff' ? '👨‍🏫 کد پرسنلی' : '🎓 شماره دانشجویی'} {s.code}
                </span>
                <span className="text-slate-500">
                  {s.name}
                  {s.universityTitle ? ` · ${s.universityTitle}` : ''}
                </span>
                {openFor === key ? (
                  <span className="flex items-center gap-1.5 mr-auto">
                    <input
                      type="password"
                      dir="ltr"
                      placeholder="رمز این حساب"
                      value={pw}
                      onChange={(e) => setPw(e.target.value)}
                      className="w-36 rounded-lg border border-slate-300 bg-white px-2 py-1 text-left text-xs"
                      autoComplete="current-password"
                    />
                    <button
                      disabled={busy}
                      onClick={() => go(s)}
                      className="rounded-lg bg-emerald-700 px-3 py-1 font-bold text-white hover:bg-emerald-800 disabled:opacity-60"
                    >
                      {busy ? '…' : 'ورود'}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => {
                        setOpenFor(null);
                        setPw('');
                        setErr('');
                      }}
                      className="rounded-lg bg-white px-2 py-1 text-slate-500 hover:underline"
                    >
                      انصراف
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      setOpenFor(key);
                      setPw('');
                      setErr('');
                    }}
                    className="mr-auto rounded-lg bg-indigo-700 px-3 py-1 font-bold text-white hover:bg-indigo-800"
                  >
                    مشاهده با این کد ←
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {err && <p className="mt-2 rounded-lg bg-red-50 p-1.5 text-center font-bold text-red-700">{err}</p>}
      </div>
    </div>
  );
}
