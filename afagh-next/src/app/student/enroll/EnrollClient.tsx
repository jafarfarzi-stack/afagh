'use client';

// انتخاب واحد Optimistic UI + اتاق انتظار Redis — سند §۱۰۱۶/§۳۷۵۹/§۶۹۰۶
// «ثبت نهایی» بی‌درنگ پاسخ می‌گیرد؛ نتیجه از صف با polling می‌رسد.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addToCartAction, autoFillCartFromChartAction, removeFromCartAction, referCouncilAction, submitCartAction } from './actions';
import type { SubmitResult } from '@/lib/enroll-engine';

type Offering = { id: number; code: string; title: string; units: number; capacity: number; enrolled: number; group: number; prereq?: string | null };
type CartCourse = { id: number; code: string; title: string; units: number };
type Live = Record<number, { cap: number; enrolled: number; remaining: number }>;

export default function EnrollClient(props: {
  student: { id: number; status: string };
  term: { id: number | null; title: string; open: boolean };
  offerings: Offering[];
  cart: CartCourse[];
  cartStartedAt: number | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [queuePos, setQueuePos] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [live, setLive] = useState<Live>({});
  const [remain, setRemain] = useState(15 * 60);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ⏱ مهلت ۱۵ دقیقه‌ای سبد (§۲۲۴۳)
  useEffect(() => {
    if (!props.cartStartedAt) return;
    const t = setInterval(() => setRemain(Math.max(0, 15 * 60 - Math.floor((Date.now() - props.cartStartedAt!) / 1000))), 1000);
    return () => clearInterval(t);
  }, [props.cartStartedAt]);

  // ظرفیت زنده از Redis (§۳۴۰۳) — بدون فشار به PostgreSQL
  useEffect(() => {
    let stop = false;
    const pull = async () => {
      try {
        const r = await fetch('/api/enroll/live-capacity');
        if (!r.ok) return;
        const j = (await r.json()) as Live;
        if (!stop) setLive(j);
      } catch { /* ساکت */ }
    };
    pull();
    const t = setInterval(pull, 4000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  // نظرسنجی وضعیت صف
  useEffect(() => {
    if (queuePos === null) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch('/api/waiting-room/status');
        const j = await r.json() as { state: string; position?: number; result?: SubmitResult };
        if (j.state === 'WAITING' && j.position) setQueuePos(j.position);
        else if (j.state === 'PROCESSING') { setQueuePos(null); setProcessing(true); }
        else if (j.state === 'DONE' && j.result) {
          setQueuePos(null); setProcessing(false); setResult(j.result);
          if (pollRef.current) clearInterval(pollRef.current);
          router.refresh();
        }
      } catch { /* تلاش بعدی */ }
    }, 1500);
    pollRef.current = t;
    return () => clearInterval(t);
  }, [queuePos, router]);

  const expired = remain <= 0;
  const totalUnits = props.cart.reduce((s, c) => s + c.units, 0);
  const mm = String(Math.floor(remain / 60)).padStart(2, '0');
  const ss = String(remain % 60).padStart(2, '0');

  async function add(id: number) { setBusy(true); await addToCartAction(id); router.refresh(); setBusy(false); }
  async function remove(id: number) { setBusy(true); await removeFromCartAction(id); router.refresh(); setBusy(false); }

  async function submit() {
    setBusy(true); setMsg(''); setResult(null);
    const res = await submitCartAction();
    setBusy(false);
    if (res.limited) { setMsg('سرعت درخواست‌ها بیش از حد مجاز است — چند لحظه صبر کنید (سپر نرخ).'); return; }
    if (!res.queued) { setMsg('ورود به صف ناموفق بود.'); return; }
    setQueuePos(res.position); // پاسخ فوری §۱۰۱۶
  }

  async function refer(id: number, reason?: string) {
    setBusy(true);
    const res = await referCouncilAction(id, reason);
    setMsg(res.ok ? 'ارجاع به کمیسیون ثبت شد؛ نتیجه از کارتابل پیگیری می‌شود.' : res.error || 'خطا');
    setBusy(false);
    router.refresh();
  }

  async function autoFill() {
    setBusy(true);
    setMsg('در حال چیدمان هوشمند دروس از چارت مصوب رشته...');
    const res = await autoFillCartFromChartAction();
    if (res.ok) {
      setMsg(`✅ ${res.count} درس پیشنهادی این ترم به سبد اضافه شد.`);
    }
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      {/* دکمه انتخاب هوشمند و سریع از روی چارت */}
      <div className="card !p-4 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-100 border border-emerald-200 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-extrabold text-emerald-950 text-sm">🤖 انتخاب واحد هوشمند بر اساس چارت سرفصل</h3>
          <p className="text-xs text-emerald-800 mt-0.5">سیستم کلیه دروس پیشنهادی این ترم را طبق چارت در سبد شما می‌چیند تا با یک کلیک ثبت کنید.</p>
        </div>
        <button
          onClick={autoFill}
          disabled={busy || !props.term.open}
          className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <span>⚡</span>
          <span>چیدمان خودکار دروس ترم</span>
        </button>
      </div>

      {!props.term.open && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">پنجرهٔ انتخاب واحد برای «{props.term.title || '—'}» بسته است.</p>}

      {props.cartStartedAt && (
        <div className={'card flex items-center justify-between ' + (expired ? 'text-red-600' : '')}>
          <span className="text-sm">مهلت تکمیل سبد</span>
          <span className="font-mono text-lg font-bold" dir="ltr">{expired ? 'منقضی' : mm + ':' + ss}</span>
        </div>
      )}

      {/* اتاق انتظار — پاسخ فوری §۱۰۱۶ */}
      {(queuePos !== null || processing) && (
        <div className="card flex items-center gap-3 border-emerald-300 bg-emerald-50">
          <span className="h-3 w-3 animate-pulse rounded-full bg-emerald-600"></span>
          <div>
            <p className="text-sm font-bold text-emerald-900">درخواست شما در صف پردازش قرار گرفت</p>
            <p className="text-xs text-emerald-700">{processing ? 'در حال اعتبارسنجی و ثبت…' : 'نوبت شما در اتاق انتظار: ' + (queuePos ?? '—')}</p>
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="mb-2 font-bold">سبد انتخاب ({totalUnits} واحد)</h2>
        {props.cart.length === 0 && <p className="text-sm text-slate-500">سبد خالی است — از فهرست زیر اضافه کنید.</p>}
        {props.cart.map(c => (
          <div key={c.id} className="mb-1 flex items-center justify-between rounded-xl bg-emerald-50 p-2 text-sm">
            <span>{c.title} <span className="text-xs text-slate-500" dir="ltr">({c.code})</span></span>
            <button className="text-xs text-red-600" disabled={busy || expired} onClick={() => remove(c.id)}>حذف</button>
          </div>
        ))}
        {props.cart.length > 0 && <button className="btn-primary mt-2 w-full" disabled={busy || expired || queuePos !== null || processing} onClick={submit}>{busy ? 'در حال ارسال…' : 'ثبت نهایی'}</button>}
        {expired && <p className="mt-2 text-xs text-red-600">سبد منقضی شد — موارد را حذف و دوباره انتخاب کنید.</p>}
      </div>

      {msg && <p className="rounded-xl bg-slate-100 p-2 text-center text-sm">{msg}</p>}

      {result && (
        <div className="space-y-2">
          {result.ok && result.registered.length > 0 && (
            <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">ثبت قطعی شد: {result.registered.join('، ')}</p>
          )}
          {result.waitlisted.length > 0 && (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              اتاق انتظار (ظرفیت تکمیل): {result.waitlisted.join('، ')} — با آزادشدن ظرفیت، به‌طور خودکار ثبت می‌شوید و اعلان می‌گیرید (ارتقای خودکار).
            </p>
          )}
          {result.hardErrors.map((e, i) => <p key={i} className="rounded-xl bg-red-50 p-3 text-sm text-red-800">⛔ {e}</p>)}
          {result.softErrors.map((e, i) => (
            <div key={i} className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              ⚠️ {e.msg}
              <button className="btn-ghost mr-2 !py-1 !px-2 text-xs" disabled={busy} onClick={() => refer(e.offeringId, e.msg)}>ارجاع به کمیسیون موارد خاص</button>
            </div>
          ))}
        </div>
      )}

      <div className="card space-y-2">
        <h2 className="font-bold">دروس ارائه‌شده — {props.term.title}</h2>
        <p className="text-[11px] text-slate-400">ظرفیت‌ها زنده از حافظهٔ Redis خوانده می‌شوند (§۱۰۰۶)</p>
        {props.offerings.map(o => {
          const inCart = props.cart.some(c => c.id === o.id);
          const lv = live[o.id];
          const full = lv ? lv.remaining <= 0 : o.enrolled >= o.capacity;
          return (
            <div key={o.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm">
              <div>
                <p className="font-medium">{o.title}</p>
                <p className="text-xs text-slate-500" dir="ltr">{o.code} · گروه {o.group} · {o.units} واحد{lv ? ' · باقی‌مانده ' + lv.remaining + '/' + lv.cap : ' · ظرفیت ' + o.enrolled + '/' + o.capacity}</p>
                {o.prereq && <p className="mt-0.5 text-[11px] text-amber-700">پیش‌نیاز: {o.prereq}</p>}
              </div>
              <div className="flex items-center gap-2">
                {full && !inCart && <span className="badge bg-red-100 text-red-700">تکمیل</span>}
                {inCart
                  ? <button className="btn-ghost !py-1" disabled={busy} onClick={() => remove(o.id)}>در سبد ✓</button>
                  : <button className="btn-primary !py-1" disabled={busy || !props.term.open} onClick={() => add(o.id)}>افزودن</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
