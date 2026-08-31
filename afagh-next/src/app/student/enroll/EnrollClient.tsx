'use client';

// انتخاب واحد Optimistic UI + اتاق انتظار Redis — سند §۱۰۱۶/§۳۷۵۹/§۶۹۰۶
// «ثبت نهایی» بی‌درنگ پاسخ می‌گیرد؛ نتیجه از صف با polling می‌رسد.
import { useEffect, useMemo, useRef, useState } from 'react';
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

export type ClassScheduleItem = {
  dayOfWeek: number;
  dayName: string;
  startTime: string;
  endTime: string;
  room?: string;
};

export type ExamScheduleItem = {
  examDate: string;
  startTime: string;
  endTime: string;
};

export type OfferingItem = {
  id: number;
  courseId: number;
  code: string;
  title: string;
  units: number;
  capacity: number;
  enrolled: number;
  group: number;
  professor: string;
  prereq?: string | null;
  classSchedules: ClassScheduleItem[];
  examSchedule: ExamScheduleItem | null;
};

export type CartItem = {
  id: number;
  courseId: number;
  code: string;
  title: string;
  units: number;
  group: number;
  classSchedules: ClassScheduleItem[];
  examSchedule: ExamScheduleItem | null;
};

type Live = Record<number, { cap: number; enrolled: number; remaining: number }>;

function checkTimeOverlap(s1: string, e1: string, s2: string, e2: string) {
  return s1.slice(0, 5) < e2.slice(0, 5) && s2.slice(0, 5) < e1.slice(0, 5);
}

export default function EnrollClient(props: {
  student: { id: number; status: string };
  term: { id: number | null; title: string; open: boolean };
  offerings: OfferingItem[];
  cart: CartItem[];
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

  // بررسی تداخل‌های زمانی درون سبد انتخاب واحد دانشجو
  const cartConflicts = useMemo(() => {
    const conflicts: Record<number, { classConflicts: string[]; examConflicts: string[]; alternateGroup?: OfferingItem }> = {};

    for (let i = 0; i < props.cart.length; i++) {
      const itemA = props.cart[i];
      const classConf: string[] = [];
      const examConf: string[] = [];

      for (let j = 0; j < props.cart.length; j++) {
        if (i === j) continue;
        const itemB = props.cart[j];

        // تداخل کلاسی
        for (const cA of itemA.classSchedules) {
          for (const cB of itemB.classSchedules) {
            if (cA.dayOfWeek === cB.dayOfWeek && checkTimeOverlap(cA.startTime, cA.endTime, cB.startTime, cB.endTime)) {
              classConf.push(`تداخل کلاس در روز ${cA.dayName} (${cA.startTime}-${cA.endTime}) با درس «${itemB.title}»`);
            }
          }
        }

        // تداخل امتحانی
        if (itemA.examSchedule && itemB.examSchedule && itemA.examSchedule.examDate === itemB.examSchedule.examDate) {
          if (checkTimeOverlap(itemA.examSchedule.startTime, itemA.examSchedule.endTime, itemB.examSchedule.startTime, itemB.examSchedule.endTime)) {
            examConf.push(`تداخل ساعت امتحان در تاریخ ${itemA.examSchedule.examDate} با درس «${itemB.title}»`);
          }
        }
      }

      // جستجوی گروه جایگزینِ بدون تداخل برای همین درس
      let alternateGroup: OfferingItem | undefined;
      if (classConf.length > 0 || examConf.length > 0) {
        const otherGroups = props.offerings.filter(o => o.courseId === itemA.courseId && o.id !== itemA.id);
        alternateGroup = otherGroups.find(alt => {
          // بررسی که alt با سایر دروس سبد (به جز itemA) تداخلی نداشته باشد
          for (const other of props.cart) {
            if (other.id === itemA.id) continue;
            for (const ca of alt.classSchedules) {
              for (const cb of other.classSchedules) {
                if (ca.dayOfWeek === cb.dayOfWeek && checkTimeOverlap(ca.startTime, ca.endTime, cb.startTime, cb.endTime)) return false;
              }
            }
            if (alt.examSchedule && other.examSchedule && alt.examSchedule.examDate === other.examSchedule.examDate) {
              if (checkTimeOverlap(alt.examSchedule.startTime, alt.examSchedule.endTime, other.examSchedule.startTime, other.examSchedule.endTime)) return false;
            }
          }
          return true;
        });
      }

      conflicts[itemA.id] = { classConflicts: classConf, examConflicts: examConf, alternateGroup };
    }

    return conflicts;
  }, [props.cart, props.offerings]);

  const hasAnyConflict = useMemo(() => {
    return Object.values(cartConflicts).some(c => c.classConflicts.length > 0 || c.examConflicts.length > 0);
  }, [cartConflicts]);

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

  async function switchGroup(newOfferingId: number) {
    setBusy(true);
    setMsg('در حال جابجایی به گروه بدون تداخل...');
    await addToCartAction(newOfferingId);
    router.refresh();
    setBusy(false);
    setMsg('✅ درس به گروه بدون تداخل جابجا گردید.');
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
    setMsg('در حال چیدمان هوشمند و خودکار دروس ترم با کنترل ظرفیت و عدم تداخل...');
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
            <span>انتخاب واحد هوشمند بر اساس چارت سرفصل و کنترل تداخل</span>
          </h3>
          <p className="text-xs text-emerald-200 mt-0.5">
            سیستم با بررسی تمام گروه‌های درسی، بهترین گروه‌های دارای ظرفیت و <b>فاقد تداخل کلاسی و امتحانی</b> را در سبد شما می‌چیند.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={autoFill}
            disabled={busy || !props.term.open}
            className="bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-black text-xs px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <span>⚡</span>
            <span>چیدمان خودکار دروس ترم (بدون تداخل)</span>
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
                }}
                className="text-[11px] bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1 rounded-lg"
              >
                🔄 تمدید مهلت
              </button>
            )}
          </div>
        </div>
      )}

      {/* هشدار تداخل زمانی کلی */}
      {hasAnyConflict && (
        <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl text-xs text-amber-900 space-y-1 shadow-sm">
          <div className="font-extrabold text-sm text-amber-950 flex items-center gap-2">
            <span>⚠️</span>
            <span>هشدار تداخل زمانی در سبد انتخاب واحد:</span>
          </div>
          <p>
            بین زمان برگزاری کلاس‌ها یا تاریخ امتحانات برخی دروس سبد تداخل وجود دارد. می‌توانید با زدن دکمهٔ «جابجایی به گروه دیگر»، گروه بدون تداخل را جایگزین نمایید.
          </p>
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
      {/* سبد انتخاب واحد دانشجو با نمایش تفکیکی گروه‌ها و تداخل‌ها          */}
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
              می‌توانید با دکمهٔ «چیدمان خودکار» دروس ترم را بدون تداخل بچینید یا از فهرست زیر گروه مورد نظر را اضافه کنید.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {props.cart.map((c, idx) => {
              const conf = cartConflicts[c.id];
              const isConflicted = conf && (conf.classConflicts.length > 0 || conf.examConflicts.length > 0);

              return (
                <div
                  key={c.id || idx}
                  className={`rounded-xl border p-3 text-sm transition-all space-y-2 ${
                    isConflicted
                      ? 'bg-amber-50/80 border-amber-300'
                      : 'bg-emerald-50/70 border-emerald-200/80'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-lg bg-emerald-200 text-emerald-900 flex items-center justify-center font-mono font-bold text-xs">
                        {idx + 1}
                      </span>
                      <div>
                        <span className="font-extrabold text-slate-900">{c.title}</span>
                        <span className="text-xs text-slate-500 mr-2 font-mono" dir="ltr">
                          ({c.code})
                        </span>
                        <span className="mr-2 text-xs bg-indigo-100 text-indigo-900 px-2 py-0.5 rounded font-bold font-mono">
                          گروه {c.group}
                        </span>
                        <span className="mr-2 text-[11px] bg-white text-emerald-800 px-2 py-0.5 rounded border border-emerald-300 font-bold font-mono">
                          {c.units} واحد
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {conf?.alternateGroup && (
                        <button
                          onClick={() => switchGroup(conf.alternateGroup!.id)}
                          disabled={busy}
                          className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-xl font-bold shadow-sm transition-all flex items-center gap-1"
                        >
                          <span>🔄</span>
                          <span>انتقال به گروه {conf.alternateGroup.group} (بدون تداخل)</span>
                        </button>
                      )}

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

                  {/* جزئیات زمان‌بندی کلاس و امتحان در کارت سبد */}
                  <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1 bg-white/70 p-2 rounded-lg border border-slate-200">
                    <div>
                      📅 <b>جلسات هفتگی:</b>{' '}
                      {c.classSchedules.length > 0
                        ? c.classSchedules.map((cs, i) => `${cs.dayName} ${cs.startTime}-${cs.endTime}`).join(' و ')
                        : 'اعلام خواهد شد'}
                    </div>
                    {c.examSchedule && (
                      <div>
                        📝 <b>امتحان پایان‌ترم:</b> {c.examSchedule.examDate} ({c.examSchedule.startTime}-{c.examSchedule.endTime})
                      </div>
                    )}
                  </div>

                  {/* هشدارهای تداخل */}
                  {isConflicted && (
                    <div className="space-y-1 text-[11px] text-rose-800 bg-rose-50 p-2 rounded-lg border border-rose-200 font-medium">
                      {conf.classConflicts.map((cc, i) => (
                        <p key={i}>⚠️ {cc}</p>
                      ))}
                      {conf.examConflicts.map((ec, i) => (
                        <p key={i}>⚠️ {ec}</p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
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
      {/* فهرست دروس ارائه‌شده با تفکیک دقیق گروه‌ها، ظرفیت و زمان‌بندی     */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div className="card !p-4 bg-white border border-slate-200 shadow-sm rounded-2xl space-y-3">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-2">
          <div>
            <h2 className="font-extrabold text-sm sm:text-base text-slate-900">
              📚 دروس و گروه‌های ارائه‌شده در نیمسال جاری — {props.term.title}
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              نمایش گروه‌های درسی موازی با زمان‌بندی کلاس، تاریخ امتحان و کنترل زندهٔ ظرفیت.
            </p>
          </div>
          <span className="text-xs text-slate-500 font-mono">تعداد کل گروه‌ها: {props.offerings.length}</span>
        </div>

        <div className="space-y-2.5">
          {props.offerings.map(o => {
            const inCart = props.cart.some(c => c.id === o.id);
            const lv = live[o.id];
            const remainingSeats = lv ? lv.remaining : o.capacity - o.enrolled;
            const full = remainingSeats <= 0;

            // آیا گروه دیگری از همین درس در سبد هست؟
            const otherGroupInCart = props.cart.find(c => c.courseId === o.courseId && c.id !== o.id);

            return (
              <div
                key={o.id}
                className={`flex flex-wrap items-center justify-between rounded-xl p-3 text-sm border transition-all ${
                  inCart
                    ? 'bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-200 shadow-sm'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100/80'
                }`}
              >
                <div className="space-y-1.5 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-extrabold text-slate-900">{o.title}</p>
                    <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-mono" dir="ltr">
                      {o.code}
                    </span>
                    <span className="text-xs bg-indigo-100 text-indigo-900 px-2 py-0.5 rounded-full font-bold font-mono">
                      گروه {o.group}
                    </span>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                      استاد: {o.professor}
                    </span>
                    <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold font-mono">
                      {o.units} واحد
                    </span>
                  </div>

                  {/* زمان‌بندی کلاس و امتحان */}
                  <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span>
                      🕒 <b>کلاس:</b>{' '}
                      {o.classSchedules.length > 0
                        ? o.classSchedules.map((cs, i) => `${cs.dayName} ${cs.startTime} تا ${cs.endTime}`).join(' و ')
                        : 'اعلام نشده'}
                    </span>
                    {o.examSchedule && (
                      <span>
                        📝 <b>امتحان:</b> {o.examSchedule.examDate} ({o.examSchedule.startTime}-{o.examSchedule.endTime})
                      </span>
                    )}
                  </div>

                  {/* ظرفیت کلاس */}
                  <div className="text-[11px]">
                    {full ? (
                      <span className="text-rose-600 font-bold">
                        ⛔ ظرفیت تکمیل ({o.enrolled}/{o.capacity}) — ورود به اتاق انتظار در صورت اخذ
                      </span>
                    ) : (
                      <span className="text-emerald-700 font-bold">
                        ✅ ظرفیت باقی‌مانده: {remainingSeats} از {o.capacity} صندلی
                      </span>
                    )}
                  </div>

                  {o.prereq && <p className="text-[11px] text-amber-700 font-medium">پیش‌نیاز: {o.prereq}</p>}
                </div>

                {/* دکمه‌های افزودن / حذف / تعویض گروه */}
                <div className="flex items-center gap-2 mt-2 sm:mt-0">
                  {inCart ? (
                    <button
                      className="bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-700 border border-rose-300 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
                      disabled={busy}
                      onClick={() => remove(o.id)}
                    >
                      <span>✕</span>
                      <span>حذف از سبد</span>
                    </button>
                  ) : otherGroupInCart ? (
                    <button
                      className="bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                      disabled={busy || !props.term.open}
                      onClick={() => add(o.id)}
                    >
                      <span>🔄</span>
                      <span>تغییر به گروه {o.group}</span>
                    </button>
                  ) : (
                    <button
                      className="bg-indigo-700 hover:bg-indigo-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
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
