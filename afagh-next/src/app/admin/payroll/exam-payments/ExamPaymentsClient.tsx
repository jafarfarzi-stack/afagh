'use client';

import { useState, useTransition } from 'react';

type Payment = {
  id: number; staffId: number; staffName: string; staffCode: string | null;
  termId: number; source: string; sessionCount: number; unitCount: number;
  amount: number; decreeId: number | null; createdAt: string | null;
};

type Term = { id: number; title: string; isCurrent: boolean };

const SOURCE_FA: Record<string, string> = {
  INVIGILATION: 'مراقبت',
  CORRECTION: 'تصحیح',
  EXEC: 'اجرا',
};

const faNum = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === '' ? '—' : String(v).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
const money = (n: number) => faNum(Math.round(Number(n || 0)).toLocaleString('en-US')) + ' ریال';

export default function ExamPaymentsClient(props: {
  initial: Payment[];
  terms: Term[];
  currentTermId: number | null;
  actions: {
    searchStaffAction: (q: string) => Promise<{ ok: boolean; error?: string; list?: { id: number; staffCode: string | null; name: string }[] }>;
    listAction: (termId: number) => Promise<{ ok: boolean; list?: Payment[] }>;
    createAction: (input: { staffId: number; termId: number; source: string; sessionCount: number; unitCount: number; amount: number }) => Promise<{ ok: boolean; error?: string; id?: number }>;
    deleteAction: (id: number) => Promise<{ ok: boolean; error?: string }>;
  };
}) {
  const { terms, actions } = props;
  const [rows, setRows] = useState<Payment[]>(props.initial);
  const [termId, setTermId] = useState<number | null>(props.currentTermId);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ id: number; staffCode: string | null; name: string }[]>([]);
  const [staffId, setStaffId] = useState<number | null>(null);
  const [staffName, setStaffName] = useState('');
  const [source, setSource] = useState('INVIGILATION');
  const [sessions, setSessions] = useState('');
  const [units, setUnits] = useState('');
  const [amount, setAmount] = useState('');

  const inputCls = 'w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm';

  function changeTerm(tid: number) {
    setTermId(tid);
    start(async () => {
      const res = await actions.listAction(tid);
      if (res.ok) setRows(res.list ?? []);
    });
  }

  function doSearch() {
    start(async () => {
      const res = await actions.searchStaffAction(q);
      if (!res.ok) { setMsg(res.error ?? 'خطا در جست‌وجو.'); return; }
      setFound(res.list ?? []);
    });
  }

  function doCreate() {
    if (staffId == null || termId == null) return;
    setMsg(null);
    start(async () => {
      const res = await actions.createAction({
        staffId, termId, source,
        sessionCount: Number(sessions) || 0,
        unitCount: Number(units) || 0,
        amount: Number(amount) || 0,
      });
      if (!res.ok) { setMsg(res.error ?? 'خطا در ثبت.'); return; }
      setMsg('پرداخت ثبت شد.');
      setSessions(''); setUnits(''); setAmount('');
      const r = await actions.listAction(termId);
      if (r.ok) setRows(r.list ?? []);
    });
  }

  function doDelete(id: number) {
    if (!confirm('این پرداخت حذف شود؟')) return;
    start(async () => {
      const res = await actions.deleteAction(id);
      if (!res.ok) { setMsg(res.error ?? 'خطا در حذف.'); return; }
      setRows(rs => rs.filter(r => r.id !== id));
    });
  }

  const total = rows.reduce((a, r) => a + Number(r.amount ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-black text-slate-900">پرداخت‌های امتحانی ترم</h1>
        <div className="flex items-center gap-2">
          <select value={termId ?? ''} onChange={e => changeTerm(Number(e.target.value))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
            {terms.map(t => <option key={t.id} value={t.id}>{t.title}{t.isCurrent ? ' (جاری)' : ''}</option>)}
          </select>
          <a href="/admin/payroll" className="text-sm text-slate-600 underline">بازگشت</a>
        </div>
      </div>

      {msg ? <div className="rounded-xl border border-slate-300 bg-slate-50 p-2.5 text-sm text-slate-800">{msg}</div> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="font-black text-slate-900 text-sm">ثبت پرداخت جدید</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div className="flex gap-2">
            <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') doSearch(); }} className={inputCls} placeholder="جست‌وجوی استاد…" />
            <button onClick={doSearch} disabled={pending} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-50">جست‌وجو</button>
          </div>
          <div className="text-sm text-slate-700 flex items-center">
            {staffId != null ? <>استاد: <b className="mx-1">{staffName}</b></> : 'استادی انتخاب نشده است.'}
          </div>
          <div className="grid grid-cols-4 gap-2">
            <select value={source} onChange={e => setSource(e.target.value)} className={inputCls}>
              {Object.entries(SOURCE_FA).map(([v, fa]) => <option key={v} value={v}>{fa}</option>)}
            </select>
            <input value={sessions} onChange={e => setSessions(e.target.value)} className={inputCls} type="number" min="0" placeholder="جلسات" dir="ltr" />
            <input value={units} onChange={e => setUnits(e.target.value)} className={inputCls} type="number" min="0" step="0.5" placeholder="واحد" dir="ltr" />
            <input value={amount} onChange={e => setAmount(e.target.value)} className={inputCls} type="number" min="0" placeholder="مبلغ (ریال)" dir="ltr" />
          </div>
        </div>
        {found.length > 0 ? (
          <div className="rounded-xl border border-slate-200 divide-y text-sm">
            {found.map(s => (
              <button key={s.id} onClick={() => { setStaffId(s.id); setStaffName(s.name); setFound([]); }} className="w-full flex items-center justify-between p-2 hover:bg-slate-50">
                <span className="font-bold">{s.name}</span>
                <span className="text-xs text-slate-500 font-mono" dir="ltr">{s.staffCode}</span>
              </button>
            ))}
          </div>
        ) : null}
        <button onClick={doCreate} disabled={pending || staffId == null || termId == null} className="rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-1.5 text-sm text-white disabled:opacity-50">
          ثبت پرداخت
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="font-black text-slate-900 text-sm">
          فهرست پرداخت‌ها <span className="text-xs font-normal text-slate-500">— جمع: {money(total)}</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b">
                <th className="p-2 text-right">استاد</th>
                <th className="p-2">منبع</th>
                <th className="p-2">جلسات</th>
                <th className="p-2">واحد</th>
                <th className="p-2">مبلغ</th>
                <th className="p-2">ابلاغ</th>
                <th className="p-2">حذف</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="p-2 font-bold">{r.staffName} <span className="font-mono text-xs text-slate-400" dir="ltr">{r.staffCode}</span></td>
                  <td className="p-2 text-center">{SOURCE_FA[r.source] ?? r.source}</td>
                  <td className="p-2 text-center">{faNum(r.sessionCount)}</td>
                  <td className="p-2 text-center">{faNum(r.unitCount)}</td>
                  <td className="p-2 font-mono text-xs whitespace-nowrap">{money(r.amount)}</td>
                  <td className="p-2 text-center text-xs text-slate-500">{r.decreeId ? `#${faNum(r.decreeId)}` : '—'}</td>
                  <td className="p-2 text-center">
                    <button onClick={() => doDelete(r.id)} disabled={pending} className="rounded-lg border border-red-300 px-2 py-1 text-xs text-red-700 disabled:opacity-50">حذف</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="p-4 text-center text-xs text-slate-500">پرداختی در این ترم ثبت نشده است.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
