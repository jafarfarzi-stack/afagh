'use client';

// انتخاب واحد Optimistic UI + اتاق انتظار Redis — سند §۱۰۱۶/§۳۷۵۹/§۶۹۰۶
// «ثبت نهایی» بی‌درنگ پاسخ می‌گیرد؛ نتیجه از صف با polling می‌رسد.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  addToCartAction,
  autoFillCartFromChartAction,
  clearCartAction,
  removeFromCartAction,
  referCouncilAction,
  submitCartAction,
} from './actions';
import type { SubmitResult } from '@/lib/enroll-engine';

type Offering = {
  id: number;
  code: string;
  title: string;
  units: number;
  capacity: number;
  enrolled: number;
  group: number;
  prereq?: string | null;
};

type CartCourse = {
  id: number;
  code: string;
  title: string;
  units: number;
};

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
    if (!props.cartStartedAt) {
      setRemain(15 * 60);
      return;
    }
    const calc = () => {
      const elapsed = Math.floor((Date.now() - props.cartStartedAt!) / 1000);
      const left = Math.max(0, 15 * 60 - elapsed);
      setRemain(left);
    };
    calc();
    const t = setInterval(calc, 1000);
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
      } catch {
        /* ساکت */
      }
    };
    pull();
    const t = setInterval(pull, 4000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  // نظرسنجی وضعیت صف
  useEffect(() => {
    if (queuePos === null) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch('/api/waiting-room/status');
        const j = (await r.json()) as { state: string; position?: number; result?: SubmitResult };
        if (j.state === 'WAITING' && j.position) setQueuePos(j.position);
        else if (j.state === 'PROCESSING') {
          setQueuePos(null);
          setProcessing(true);
        } else if (j.state === 'DONE' && j.result) {
          setQueuePos(null);
          setProcessing(false);
          setResult(j.result);
          if (pollRef.current) clearInterval(pollRef.current);
          router.refresh();
        }
      } catch {
        /* تلاش بعدی */
      }
    }, 1500);
    pollRef.current = t;
    return () => clearInterval(t);
  }, [queuePos, router]);

  const expired = props.cart.length > 0 && remain <= 0;
  const totalUnits = props.cart.reduce((s, c) => s + c.units, 0);
  const mm = String(Math.floor(remain / 60)).padStart(2, '0');
  const ss = String(remain % 60).padStart(2, '0');

  async function add(id: number) {
    setBusy(true);
    setMsg('');
    await addToCartAction(id);
    router.refresh();
    setBusy(false);
  }

  async function remove(id: number) {
    setBusy(true);
    setMsg('');
    await removeFromCartAction(id);
    router.refresh();
    setBusy(false);
  }

  async function clearAll() {
    if (!confirm('آیا از خالی کردن تمام دروس موجود در سبد انتخاب واحد مطمئن هستید؟')) return;
    setBusy(true);
    setMsg('');
    await clearCartAction();
    router.refresh();
    setBusy(false);
    setMsg('سبد انتخاب واحد کاملاً خالی گردید.');
  }

  async function submit() {
    if (totalUnits > 20) {
      alert('خطا: مجموع واحدهای سبد (بیش از ۲۰ واحد) از سقف مجاز آیین‌نامه بیشتر است.');
      return;
    }
    setBusy(true);
    setMsg('');
    setResult(null);
    const res = await submitCartAction();
    setBusy(false);
    if (res.limited) {
      setMsg('سرعت درخواست‌ها بیش از حد مجاز است — چند لحظه صبر کنید (سپر نرخ).');
      return;
    }
    if (!res.queued) {
      setMsg('ورود به صف ناموفق بود.');
      return;
    }
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
    setMsg('در حال چیدمان هوشمند و خودکار دروس ترم بر اساس چارت مصوب...');
    const res = await autoFillCartFromChartAction();
    if (res.ok) {
      setMsg(`✅ ${res.message}`);
    } else {
      setMsg('خطا در چیدمان دروس چارت.');
    }
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="space-y-4 text-slate-800 font-sans" dir="rtl">
      {/* دکمه انتخاب هوشمند و سریع از روی چارت */}
      <div className="card !p-4 bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white rounded-2xl border-0 shadow-lg flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-extrabold text-white text-sm sm:text-base flex items-center gap-2">
            <span>🤖</span>
            <span>انتخاب واحد هوشمند بر اساس چارت سرفصل مصوب</span>
          </h3>
          <p className="text-xs text-emerald-200 mt-0.5">
            سیستم دروس پیشنهادی ترم جاری شما را مطابق سرفصل و پیش‌نیازها به صورت متوازن (سقف ۱۲ تا ۲۰ واحد) در سبد می‌چیند.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={autoFill}
            disabled={busy || !props.term.open}
            className="bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-black text-xs px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <span>⚡</span>
            <span>چیدمان خودکار دروس ترم جاری</span>
          </button>
        </div>
      </div>

      {!props.term.open && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 border border-amber-200">
          پنجرهٔ انتخاب واحد برای «{props.term.title || '—'}» بسته است.
        </p>
      )}

      {/* مهلت تکمیل سبد */}
      {props.cart.length > 0 && (
        <div
          className={`card !p-3 flex items-center justify-between rounded-xl border ${
            expired
              ? 'bg-rose-50 border-rose-300 text-rose-800'
              : remain < 180
              ? 'bg-amber-50 border-amber-300 text-amber-900'
              : 'bg-indigo-50 border-indigo-200 text-indigo-900'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-bold">
            <span>⏱️</span>
            <span>مهلت نهایی‌سازی و رزرو صندلی در سبد:</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-base font-extrabold tracking-wider" dir="ltr">
              {expired ? 'منقضی شده' : `${mm}:${ss}`}
            </span>
            {expired && (
              <button
                onClick={() => {
                  setRemain(15 * 60);
                  showToast?.('مهلت سبد تمدید گردید.');
                }}
                className="text-[11px] bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1 rounded-lg"
              >
                🔄 تمدید مهلت
              </button>
            )}
          </div>
        </div>
      )}

      {/* اتاق انتظار — پاسخ فوری §۱۰۱۶ */}
      {(queuePos !== null || processing) && (
        <div className="card flex items-center gap-3 border-emerald-300 bg-emerald-50 p-4 rounded-xl shadow-sm">
          <span className="h-3.5 w-3.5 animate-pulse rounded-full bg-emerald-600"></span>
          <div>
            <p className="text-sm font-bold text-emerald-900">درخواست شما در صف پردازش انتخاب واحد قرار گرفت</p>
            <p className="text-xs text-emerald-700">
              {processing ? 'در حال اعتبارسنجی و ثبت قطعی در پایگاه داده…' : `نوبت شما در اتاق انتظار: ${queuePos ?? '—'}`}
            </p>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* سبد انتخاب واحد دانشجو                                            */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div className="card !p-4 bg-white border border-slate-200 shadow-sm rounded-2xl space-y-3">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 gap-2">
          <div className="flex items-center gap-2">
            <h2 className="font-extrabold text-base text-slate-900">🛒 سبد انتخاب واحد</h2>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-bold font-mono ${
                totalUnits > 20
                  ? 'bg-rose-100 text-rose-800'
                  : totalUnits >= 12
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {totalUnits} واحد ({props.cart.length} درس) — سقف مجاز: ۲۰ واحد
            </span>
          </div>

          {props.cart.length > 0 && (
            <button
              onClick={clearAll}
              disabled={busy}
              className="text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-3 py-1.5 rounded-xl font-bold transition-colors flex items-center gap-1"
            >
              <span>🗑️</span>
              <span>حذف همه (خالی کردن سبد)</span>
            </button>
          )}
        </div>

        {props.cart.length === 0 ? (
          <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-300 space-y-1">
            <p className="text-sm font-bold text-slate-600">سبد انتخاب واحد شما خالی است.</p>
            <p className="text-xs text-slate-400">
              می‌توانید با دکمهٔ «چیدمان خودکار» دروس ترم را یکجا وارد کنید یا از جدول دروس ارائه‌شده درس‌های مورد نظر را اضافه نمایید.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {props.cart.map((c, idx) => (
              <div
                key={c.id || idx}
                className="flex items-center justify-between rounded-xl bg-emerald-50/70 border border-emerald-200/80 p-3 text-sm hover:bg-emerald-100/60 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-lg bg-emerald-200 text-emerald-900 flex items-center justify-center font-mono font-bold text-xs">
                    {idx + 1}
                  </span>
                  <div>
                    <span className="font-extrabold text-slate-900">{c.title}</span>
                    <span className="text-xs text-slate-500 mr-2 font-mono" dir="ltr">
                      ({c.code})
                    </span>
                    <span className="mr-2 text-[11px] bg-white text-emerald-800 px-2 py-0.5 rounded border border-emerald-300 font-bold font-mono">
                      {c.units} واحد
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    className="text-xs bg-white hover:bg-rose-600 hover:text-white text-rose-600 border border-rose-300 px-3 py-1.5 rounded-xl font-bold transition-all shadow-sm active:scale-95 flex items-center gap-1"
                    disabled={busy}
                    onClick={() => remove(c.id)}
                  >
                    <span>✕</span>
                    <span>حذف از سبد</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {totalUnits > 20 && (
          <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-800 font-bold flex items-center gap-2">
            <span>⛔</span>
            <span>تعداد واحدهای سبد ({totalUnits} واحد) بیش از سقف مجاز ترمیک (۲۰ واحد) است. لطفاً حداقل {totalUnits - 20} واحد را حذف کنید.</span>
          </div>
        )}

        {props.cart.length > 0 && (
          <button
            className="btn-primary mt-3 w-full py-3 text-sm font-extrabold shadow-lg rounded-xl"
            disabled={busy || totalUnits > 20 || queuePos !== null || processing}
            onClick={submit}
          >
            {busy ? 'در حال ارسال و رزرو…' : `ثبت نهایی و اخذ قطعی (${totalUnits} واحد)`}
          </button>
        )}
      </div>

      {msg && (
        <div className="rounded-xl bg-slate-900 text-white p-3 text-center text-xs font-bold animate-fade-in shadow-md">
          {msg}
        </div>
      )}

      {result && (
        <div className="space-y-2">
          {result.ok && result.registered.length > 0 && (
            <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 border border-emerald-200 font-bold">
              🎉 ثبت قطعی شد: {result.registered.join('، ')}
            </p>
          )}
          {result.waitlisted.length > 0 && (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 border border-amber-200">
              اتاق انتظار (ظرفیت تکمیل): {result.waitlisted.join('، ')} — با آزادشدن ظرفیت، به‌طور خودکار ثبت می‌شوید و اعلان می‌گیرید.
            </p>
          )}
          {result.hardErrors.map((e, i) => (
            <p key={i} className="rounded-xl bg-red-50 p-3 text-sm text-red-800 border border-red-200 font-bold">
              ⛔ {e}
            </p>
          ))}
          {result.softErrors.map((e, i) => (
            <div key={i} className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 border border-amber-200 flex items-center justify-between">
              <span>⚠️ {e.msg}</span>
              <button
                className="btn-ghost mr-2 !py-1 !px-2 text-xs"
                disabled={busy}
                onClick={() => refer(e.offeringId, e.msg)}
              >
                ارجاع به کمیسیون موارد خاص
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* فهرست دروس ارائه‌شده با دکمه‌های افزودن / حذف                        */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div className="card !p-4 bg-white border border-slate-200 shadow-sm rounded-2xl space-y-3">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-2">
          <div>
            <h2 className="font-extrabold text-sm sm:text-base text-slate-900">
              📚 دروس ارائه‌شده در نیمسال جاری — {props.term.title}
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              ظرفیت کلاس‌ها به صورت زنده از حافظهٔ توزیع‌شده Redis همگام‌سازی می‌شود.
            </p>
          </div>
          <span className="text-xs text-slate-500 font-mono">تعداد کلاس‌ها: {props.offerings.length}</span>
        </div>

        <div className="space-y-2">
          {props.offerings.map(o => {
            const inCart = props.cart.some(c => c.id === o.id);
            const lv = live[o.id];
            const full = lv ? lv.remaining <= 0 : o.enrolled >= o.capacity;

            return (
              <div
                key={o.id}
                className={`flex flex-wrap items-center justify-between rounded-xl p-3 text-sm border transition-all ${
                  inCart
                    ? 'bg-emerald-50/60 border-emerald-300 ring-1 ring-emerald-200'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100/80'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-extrabold text-slate-900">{o.title}</p>
                    <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-mono" dir="ltr">
                      {o.code}
                    </span>
                    <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-bold font-mono">
                      گروه {o.group}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600">
                    <span className="font-bold text-slate-800">{o.units} واحد</span> ·{' '}
                    {lv ? (
                      <span className={lv.remaining <= 0 ? 'text-rose-600 font-bold' : 'text-emerald-700 font-bold'}>
                        ظرفیت باقی‌مانده: {lv.remaining} از {lv.cap} نفر
                      </span>
                    ) : (
                      <span>
                        ثبت‌نامی: {o.enrolled} / ظرفیت: {o.capacity} نفر
                      </span>
                    )}
                  </p>
                  {o.prereq && <p className="text-[11px] text-amber-700">پیش‌نیاز: {o.prereq}</p>}
                </div>

                {/* دکمه‌های افزودن و حذف جلوی هر درس */}
                <div className="flex items-center gap-2 mt-2 sm:mt-0">
                  {full && !inCart && (
                    <span className="badge bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded-lg">
                      ظرفیت تکمیل (رزرو اتاق انتظار)
                    </span>
                  )}

                  {inCart ? (
                    <button
                      className="bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-700 border border-rose-300 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
                      disabled={busy}
                      onClick={() => remove(o.id)}
                    >
                      <span>✕</span>
                      <span>حذف از سبد</span>
                    </button>
                  ) : (
                    <button
                      className="bg-indigo-700 hover:bg-indigo-800 text-white px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                      disabled={busy || !props.term.open}
                      onClick={() => add(o.id)}
                    >
                      <span>➕</span>
                      <span>افزودن به سبد</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
