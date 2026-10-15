'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { lockNowAction, verifyOwnPasswordAction } from '@/lib/step-up-actions';

/**
 * قفل خودکار بیکاری: اگر کاربر N دقیقه هیچ تعاملی (ماوس/کیبورد/لمس) نداشت،
 * صفحه قفل می‌شود و ادامهٔ کار منوط به ورود دوبارهٔ رمز عبور است.
 * پرچم قفل سمت سرور هم ثبت می‌شود (lockNowAction) و layout هنگام رندر آن را
 * می‌خواند (initialLocked) — پس رفرش/تب جدید قفل را دور نمی‌زند.
 * بررسی رمز سمت سرور انجام می‌شود (verifyOwnPasswordAction) — خودِ overlay
 * با DevTools قابل پنهان‌شدن است ولی هیچ داده‌ای بدون نشست معتبر لود نمی‌شود
 * و عملیات حساس جداگانه step-up می‌خواهند.
 */
export default function SessionLock({ name, timeoutMin = 15, initialLocked = false }: { name: string; timeoutMin?: number; initialLocked?: boolean }) {
  const disabled = !(timeoutMin > 0);
  const [locked, setLocked] = useState(initialLocked);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // اگر سرور هنگام رندر قفل را گزارش کرد (مثلاً پس از رفرش)، همان را نشان بده
  useEffect(() => { if (initialLocked) { setPw(''); setErr(''); setLocked(true); } }, [initialLocked]);

  const arm = useCallback(() => {
    if (disabled) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setPw('');
      setErr('');
      setLocked(true);
      // ثبت سمت سرور تا رفرش قفل را دور نزند (خطا نادیده گرفته می‌شود — قفل محلی برقرار است)
      lockNowAction().catch(() => {});
    }, Math.max(1, timeoutMin) * 60 * 1000);
  }, [timeoutMin, disabled]);

  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    const onAct = () => arm();
    for (const e of events) window.addEventListener(e, onAct, { passive: true });
    arm();
    return () => {
      for (const e of events) window.removeEventListener(e, onAct);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [arm]);

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw) { setErr('رمز عبور را وارد کنید.'); return; }
    setBusy(true);
    setErr('');
    try {
      const r = await verifyOwnPasswordAction(pw).catch(() => ({ ok: false as const, error: 'خطا در ارتباط با سرور.' }));
      if (r.ok) {
        setLocked(false);
        setPw('');
        arm();
      } else {
        setErr(r.error || 'رمز نادرست است.');
      }
    } finally {
      setBusy(false);
    }
  };

  if (disabled || !locked) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 print:hidden" dir="rtl">
      <form onSubmit={unlock} className="bg-white rounded-2xl shadow-2xl max-w-sm w-full border border-slate-300 overflow-hidden">
        <div className="bg-slate-900 text-white px-5 py-4 text-center">
          <div className="text-3xl">🔒</div>
          <h3 className="font-extrabold text-sm mt-1">صفحه به‌علت بیکاری قفل شد</h3>
          <p className="text-[11px] text-slate-300 mt-1">{name} — برای ادامه رمز عبور را وارد کنید.</p>
        </div>
        <div className="p-5 space-y-3">
          <input
            type="password"
            autoFocus
            value={pw}
            onChange={e => setPw(e.target.value)}
            placeholder="رمز عبور"
            dir="ltr"
            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-mono text-center focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
          />
          {err && <p className="text-xs font-bold text-rose-700 text-center">{err}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-black text-sm py-2.5"
          >
            {busy ? 'در حال بررسی…' : '🔓 بازگشایی'}
          </button>
        </div>
      </form>
    </div>
  );
}
