'use client';

import React, { useMemo, useState, useTransition } from 'react';
import {
  payrollComputeAction, payrollConfigAction, payrollExportAction,
  payrollMidtermAction, payrollPayslipAction, payrollSettleAction,
} from './actions';

// ═══ میز کار حق‌التدریس — دادهٔ واقعی از موتور مالی ═══

export type OverviewItem = {
  id: number; name: string; staffCode: string | null; rank: string | null; degree: string | null;
  contractType: string | null; rate: number; totalEquivalentUnits: number; totalEffectiveUnits: number;
  payableUnits: number; gross: number; tax: number; absenceDeductionRial: number; net: number;
  status: string; statementId: number | null; midtermPaid: number; finalPaid: number; remaining: number;
  gates: { gradesFinalized: boolean; pendingGrades: number; docsSigned: boolean; unsignedDocs: number };
};

export type OverviewTotals = { budget: number; paid: number; remaining: number; staffCount: number };

const faNum = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === '' ? '—' : String(v).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
const money = (n: number) => faNum(Math.round(Number(n || 0)).toLocaleString('en-US')) + ' ریال';

const STATUS_FA: Record<string, string> = {
  NOT_COMPUTED: 'محاسبه‌نشده',
  DRAFT: 'پیش‌نویس',
  MID_TERM_PAID: 'میان‌ترم پرداخت‌شده',
  FINAL_SETTLED: 'تسویهٔ نهایی',
};
const CONTRACT_FA: Record<string, string> = { FULL_TIME: 'هیئت علمی', ADJUNCT: 'مدعو', FULL_TIME_FACULTY: 'هیئت علمی' };

export default function LivePayrollClient({
  initialTerm, initialList, initialTotals,
}: {
  initialTerm: string;
  initialList: OverviewItem[];
  initialTotals: OverviewTotals;
}) {
  const [list, setList] = useState<OverviewItem[]>(initialList);
  const [totals, setTotals] = useState<OverviewTotals>(initialTotals);
  const [term, setTerm] = useState<string>(initialTerm);
  const [busy, startBusy] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [slip, setSlip] = useState<any | null>(null);
  const [query, setQuery] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [config, setConfig] = useState<any | null>(null);

  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 5000);
  };

  const filtered = useMemo(() => {
    const q = query.trim();
    return list.filter(x => {
      if (onlyOpen && x.status === 'FINAL_SETTLED') return false;
      if (!q) return true;
      return `${x.name} ${x.staffCode ?? ''} ${x.rank ?? ''}`.includes(q);
    });
  }, [list, query, onlyOpen]);

  const reload = () =>
    new Promise<void>(resolve => {
      // بارگذاری دوباره از طریق اکشن محاسبه انجام می‌شود؛ اینجا فقط وضعیت را تازه می‌کنیم
      resolve();
    });

  const runCompute = () =>
    startBusy(async () => {
      const r = await payrollComputeAction();
      if (r.ok === false) return say(r.error);
      const ov = await (await import('./actions')).payrollOverviewAction();
      if (ov.ok) {
        setList(ov.list as OverviewItem[]);
        setTotals(ov.totals as OverviewTotals);
        setTerm(ov.term);
      }
      say(`فیش ${faNum(r.computed)} استاد محاسبه شد${r.skippedNoContract ? ` — ${faNum(r.skippedNoContract)} استاد بدون قرارداد کنار گذاشته شد` : ''}.`);
      await reload();
    });

  const runMidterm = (staffId: number, name: string) =>
    startBusy(async () => {
      const r = await payrollMidtermAction(staffId);
      if (r.ok === false) return say(r.error);
      say(`علی‌الحساب ${name} به مبلغ ${money(r.amount)} پرداخت شد.`);
      await runComputeSilent();
    });

  const runSettle = (staffId: number, name: string) =>
    startBusy(async () => {
      const r = await payrollSettleAction(staffId);
      if (r.ok === false) return say(r.error);
      say(`تسویهٔ نهایی ${name} به مبلغ ${money(r.amount)} انجام شد.`);
      await runComputeSilent();
    });

  const runComputeSilent = async () => {
    const ov = await (await import('./actions')).payrollOverviewAction();
    if (ov.ok) {
      setList(ov.list as OverviewItem[]);
      setTotals(ov.totals as OverviewTotals);
      setTerm(ov.term);
    }
  };

  const openSlip = (staffId: number) =>
    startBusy(async () => {
      const r = await payrollPayslipAction(staffId);
      if (r.ok === false) return say(r.error);
      setSlip(r);
    });

  const doExport = () =>
    startBusy(async () => {
      const r = await payrollExportAction();
      if (r.ok === false) return say(r.error);
      const blob = new Blob(['\ufeff' + r.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payroll-batch-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      say(`فایل واریز دسته‌جمعی با ${faNum(r.count)} ردیف ساخته شد.`);
    });

  const loadConfig = () =>
    startBusy(async () => {
      const r = await payrollConfigAction();
      if (r.ok === false) return say(r.error);
      setConfig(r);
    });

  const card = (title: string, value: string, hint?: string) => (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="mt-1 text-lg font-bold text-slate-800">{value}</div>
      {hint ? <div className="mt-1 text-[11px] text-slate-400">{hint}</div> : null}
    </div>
  );

  return (
    <div className="space-y-4" dir="rtl">
      {toast ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{toast}</div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-slate-800">حق‌التدریس ترم {term || '—'}</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">دادهٔ زنده از موتور مالی</span>
        <div className="flex-1" />
        <button onClick={runCompute} disabled={busy} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">
          محاسبهٔ فیش ترم
        </button>
        <button onClick={doExport} disabled={busy} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50">
          خروجی واریز دسته‌جمعی (CSV)
        </button>
        <button onClick={loadConfig} disabled={busy} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50">
          ضرایب و قوانین
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {card('بودجهٔ حق‌التدریس (خالص)', money(totals.budget))}
        {card('پرداخت‌شده', money(totals.paid))}
        {card('باقی‌مانده', money(totals.remaining))}
        {card('تعداد اساتید', faNum(totals.staffCount), 'اساتید دارای قرارداد ترمی')}
      </div>

      {config ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs leading-6">
          <div className="mb-2 font-bold">پیکربندی فعلی موتور (سال {faNum(config.year)})</div>
          <div>ضریب درس عملی ×{faNum(config.coefs.practical)} · ضریب مقطع ارشد ×{faNum(config.coefs.msLevel)} · ضریب کلاس جمعی ×{faNum(config.coefs.crowded)} (بالای {faNum(config.crowded)} نفر)</div>
          <div>مبنای جلسات ترم: {faNum(config.sessions)} · علی‌الحساب میان‌ترم: {faNum(config.midterm)}٪</div>
          <div className="mt-2 font-bold">نرخ پایهٔ هر واحد</div>
          <ul>
            {config.rates.map((r: any, i: number) => (
              <li key={i}>{r.academicRank} / {r.degree} — {money(r.baseRatePerUnit)} (سال {faNum(r.effectiveYear)})</li>
            ))}
          </ul>
          {config.rules.length ? (
            <>
              <div className="mt-2 font-bold">فرمول‌های اختصاصی</div>
              <ul>
                {config.rules.map((r: any) => (
                  <li key={r.id}>{r.title || `${r.offeringType ?? '—'} / ${r.professorRole ?? '—'}`}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="جست‌وجوی نام یا کد پرسنلی…"
          className="rounded-lg border border-slate-300 px-3 py-1.5"
        />
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <input type="checkbox" checked={onlyOpen} onChange={e => setOnlyOpen(e.target.checked)} />
          فقط تسویه‌نشده‌ها
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-right text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="p-2">استاد</th>
              <th className="p-2">نوع قرارداد</th>
              <th className="p-2">واحد معادل</th>
              <th className="p-2">واحد قابل پرداخت</th>
              <th className="p-2">ناخالص</th>
              <th className="p-2">کسر غیبت</th>
              <th className="p-2">مالیات</th>
              <th className="p-2">خالص</th>
              <th className="p-2">پرداخت‌شده</th>
              <th className="p-2">وضعیت</th>
              <th className="p-2">گلوگاه‌ها</th>
              <th className="p-2">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={12} className="p-6 text-center text-slate-400">ردیفی یافت نشد. ابتدا «محاسبهٔ فیش ترم» را بزنید.</td></tr>
            ) : null}
            {filtered.map(x => (
              <tr key={x.id} className="border-t border-slate-100">
                <td className="p-2">
                  <div className="font-medium text-slate-800">{x.name}</div>
                  <div className="text-[11px] text-slate-400">{faNum(x.staffCode ?? '—')} · {x.rank ?? '—'}</div>
                </td>
                <td className="p-2">{CONTRACT_FA[x.contractType ?? ''] ?? x.contractType ?? '—'}</td>
                <td className="p-2">{faNum(x.totalEquivalentUnits.toFixed(2))}</td>
                <td className="p-2">{faNum(x.payableUnits.toFixed(2))}</td>
                <td className="p-2">{money(x.gross)}</td>
                <td className="p-2 text-rose-600">{money(x.absenceDeductionRial)}</td>
                <td className="p-2">{money(x.tax)}</td>
                <td className="p-2 font-bold">{money(x.net)}</td>
                <td className="p-2">{money(x.midtermPaid + x.finalPaid)}</td>
                <td className="p-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5">{STATUS_FA[x.status] ?? x.status}</span>
                </td>
                <td className="p-2 text-[11px]">
                  <span className={x.gates.gradesFinalized ? 'text-emerald-600' : 'text-amber-600'}>
                    نمرات: {x.gates.gradesFinalized ? 'قطعی' : `${faNum(x.gates.pendingGrades)} باز`}
                  </span>
                  <br />
                  <span className={x.gates.docsSigned ? 'text-emerald-600' : 'text-amber-600'}>
                    اسناد: {x.gates.docsSigned ? 'امضاشده' : `${faNum(x.gates.unsignedDocs)} امضانشده`}
                  </span>
                </td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-1">
                    <button onClick={() => openSlip(x.id)} disabled={busy} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50">فیش</button>
                    {x.status === 'DRAFT' ? (
                      <button onClick={() => runMidterm(x.id, x.name)} disabled={busy} className="rounded border border-indigo-300 px-2 py-1 text-indigo-700 disabled:opacity-50">
                        علی‌الحساب
                      </button>
                    ) : null}
                    {x.status !== 'FINAL_SETTLED' ? (
                      <button onClick={() => runSettle(x.id, x.name)} disabled={busy} className="rounded border border-emerald-300 px-2 py-1 text-emerald-700 disabled:opacity-50">
                        تسویهٔ نهایی
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {slip ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSlip(null)}>
          <div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-5 text-xs" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-base font-bold">فیش حق‌التدریس {slip.calc?.staff?.name} — {slip.term}</div>
              <button onClick={() => setSlip(null)} className="rounded border border-slate-300 px-2 py-1">بستن</button>
            </div>
            <div className="mb-2 text-slate-600">
              نرخ هر واحد: {money(slip.calc?.rate ?? 0)} · موظفی: {faNum(slip.calc?.dutyUnits ?? 0)} واحد · مالیات: {faNum(slip.calc?.taxRate ?? 0)}٪
            </div>
            <table className="w-full text-right">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-2">درس</th><th className="p-2">واحد</th><th className="p-2">نقش</th>
                  <th className="p-2">ضرایب</th><th className="p-2">معادل</th><th className="p-2">جلسات</th>
                  <th className="p-2">مؤثر</th><th className="p-2">کسر غیبت</th><th className="p-2">مبلغ</th>
                </tr>
              </thead>
              <tbody>
                {(slip.calc?.rows ?? []).map((r: any) => (
                  <tr key={r.offeringId} className="border-t border-slate-100">
                    <td className="p-2">{r.courseTitle}<div className="text-[10px] text-slate-400">{r.courseCode}</div></td>
                    <td className="p-2">{faNum(r.units)}</td>
                    <td className="p-2">{r.payRole}</td>
                    <td className="p-2 text-[10px]">{r.coefficients}</td>
                    <td className="p-2">{faNum(r.equivalentUnits.toFixed(2))}</td>
                    <td className="p-2 text-[10px]">
                      {faNum(r.sessions.planned)}/{faNum(r.sessions.held)} · غیبت {faNum(r.sessions.netAbsences)}
                    </td>
                    <td className="p-2">{faNum(r.effectiveUnits.toFixed(2))}</td>
                    <td className="p-2 text-rose-600">{money(r.absenceDeductionRial)}</td>
                    <td className="p-2">{money(r.grossRial)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 space-y-1 rounded-lg bg-slate-50 p-3">
              <div>واحد معادل کل: {faNum(slip.calc?.totalEquivalentUnits?.toFixed(2))}</div>
              <div>واحد مؤثر کل: {faNum(slip.calc?.totalEffectiveUnits?.toFixed(2))} — قابل پرداخت: {faNum(slip.calc?.payableUnits?.toFixed(2))}</div>
              <div>ناخالص: {money(slip.calc?.gross ?? 0)} · کسر غیبت: {money(slip.calc?.absenceDeductionRial ?? 0)} · مالیات: {money(slip.calc?.tax ?? 0)}</div>
              <div className="font-bold">خالص قابل پرداخت: {money(slip.calc?.net ?? 0)}</div>
              {slip.statement ? (
                <div className="text-slate-600">
                  وضعیت سند: {STATUS_FA[slip.statement.status] ?? slip.statement.status} ·
                  پرداخت‌شده: {money(Number(slip.statement.midtermPaidAmount ?? 0) + Number(slip.statement.finalPaidAmount ?? 0))} ·
                  باقی‌مانده: {money(slip.statement.remaining ?? 0)}
                </div>
              ) : (
                <div className="text-amber-600">هنوز فیش رسمی برای این استاد محاسبه نشده است.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
