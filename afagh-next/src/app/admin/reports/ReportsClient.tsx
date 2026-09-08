'use client';

import { useState } from 'react';
import { exportReport, runReport, type FilterOptions, type ReportResult } from './actions';

type Card = { kind: string; icon: string; title: string; needsTerm?: boolean; soon?: boolean };

const CARDS: Card[] = [
  { kind: 'active-term', icon: '🧑‍🎓', title: 'گزارش دانشجویان فعال ترم', needsTerm: true },
  { kind: 'status-summary', icon: '📊', title: 'گزارش خلاصه وضعیت تحصیلی' },
  { kind: 'by-faculty', icon: '🏛️', title: 'گزارش به تفکیک دانشکده' },
  { kind: 'by-major', icon: '📚', title: 'گزارش دانشجویان هر رشته' },
  { kind: 'grade-status', icon: '📝', title: 'دانشجویان برحسب وضعیت نمره', needsTerm: true },
  { kind: 'probation', icon: '⚠️', title: 'مشروطی‌های ترم', needsTerm: true },
  { kind: 'top', icon: '🏆', title: 'گزارش نمرات برتر هر رشته' },
  { kind: 'incomplete', icon: '📋', title: 'تکمیلی دانشجویان (پرونده ناقص)' },
  { kind: 'graduates', icon: '🎓', title: 'دانش‌آموختگان' },
  { kind: 'entries', icon: '📥', title: 'ورودی‌های جدید' },
  { kind: 'noshow', icon: '🚫', title: 'عدم مراجعه‌ها' },
  { kind: 'transfers', icon: '🔀', title: 'میهمان / انتقالی' },
  { kind: 'tuition', icon: '💰', title: 'گزارش بهای دانشجویان در ترم', soon: true },
  { kind: 'payesh', icon: '🗂️', title: 'گزارش پاسخ‌های طرح پایش', soon: true },
  { kind: 'jame', icon: '🧮', title: 'دانشجویان واجد شرایط آزمون جامع', soon: true },
  { kind: 'docs', icon: '📎', title: 'مدارک دانشجو', soon: true },
];

export default function ReportsClient({ opts }: { opts: FilterOptions }) {
  const [kind, setKind] = useState<string>('active-term');
  const [term, setTerm] = useState(opts.latestTerm);
  const [degreeId, setDegreeId] = useState(0);
  const [facultyId, setFacultyId] = useState(0);
  const [majorId, setMajorId] = useState(0);
  const [entryYear, setEntryYear] = useState(0);
  const [q, setQ] = useState('');
  const [miss, setMiss] = useState('national');
  const [res, setRes] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const card = CARDS.find(c => c.kind === kind);
  const filters = { term, degreeId, facultyId, majorId, entryYear, q: q.trim(), miss, page: 1 };

  const run = async (page = 1) => {
    setLoading(true);
    try {
      setRes(await runReport(kind, { ...filters, page }));
    } finally {
      setLoading(false);
    }
  };

  const pick = (k: string) => {
    setKind(k);
    setRes(null);
    setTimeout(() => {
      const el = document.getElementById('report-result');
      void el;
    }, 0);
  };

  const doExport = async () => {
    setExporting(true);
    try {
      const { header, lines } = await exportReport(kind, { ...filters, page: 1 });
      const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const csv = '﻿' + [header.map(esc).join(','), ...lines.map(l => l.map(esc).join(','))].join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `report-${kind}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* نوار دسته‌بندی به سبک سما */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {CARDS.map(c => (
          <button
            key={c.kind}
            disabled={c.soon}
            onClick={() => pick(c.kind)}
            className={`flex items-center gap-2 p-3 rounded-lg border-2 text-right font-bold text-[13px] transition-all shadow-sm
              ${c.soon
                ? 'bg-stone-100 border-stone-200 text-stone-400 cursor-not-allowed'
                : kind === c.kind
                  ? 'bg-indigo-50 border-indigo-500 text-indigo-950 shadow-md'
                  : 'bg-gradient-to-b from-white to-slate-100 border-slate-300 text-slate-700 hover:border-indigo-300 hover:shadow'}`}
          >
            <span className="text-2xl">{c.icon}</span>
            <span>{c.title}{c.soon && <span className="block text-[10px] font-normal">به‌زودی</span>}</span>
          </button>
        ))}
      </div>

      {/* نوار فیلتر */}
      {!card?.soon && (
        <div className="bg-white border border-slate-300 rounded-xl p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {card?.needsTerm && (
              <label className="flex items-center gap-1">
                <span className="font-bold text-slate-600">ترم:</span>
                <select value={term} onChange={e => setTerm(e.target.value)} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 font-mono" dir="ltr">
                  {opts.terms.map(t => <option key={t.code} value={t.code}>{t.code}</option>)}
                </select>
              </label>
            )}
            <label className="flex items-center gap-1">
              <span className="font-bold text-slate-600">مقطع:</span>
              <select value={degreeId} onChange={e => setDegreeId(Number(e.target.value))} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 max-w-44">
                <option value={0}>همه</option>
                {opts.degrees.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            </label>
            {(kind === 'by-major' || kind === 'active-term' || kind === 'top') && (
              <label className="flex items-center gap-1">
                <span className="font-bold text-slate-600">دانشکده:</span>
                <select value={facultyId} onChange={e => setFacultyId(Number(e.target.value))} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 max-w-44">
                  <option value={0}>همه</option>
                  {opts.faculties.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
            )}
            {(kind === 'top' || kind === 'graduates' || kind === 'entries') && (
              <label className="flex items-center gap-1">
                <span className="font-bold text-slate-600">رشته:</span>
                <select value={majorId} onChange={e => setMajorId(Number(e.target.value))} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 max-w-52">
                  <option value={0}>همه</option>
                  {opts.majors.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
            )}
            {(kind === 'entries' || kind === 'graduates' || kind === 'top') && (
              <label className="flex items-center gap-1">
                <span className="font-bold text-slate-600">ورودی:</span>
                <select value={entryYear} onChange={e => setEntryYear(Number(e.target.value))} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 font-mono" dir="ltr">
                  <option value={0}>همه</option>
                  {opts.entryYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
            )}
            {kind === 'incomplete' && (
              <label className="flex items-center gap-1">
                <span className="font-bold text-slate-600">نقص:</span>
                <select value={miss} onChange={e => setMiss(e.target.value)} className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5">
                  <option value="national">کد ملی نامعتبر/خالی</option>
                  <option value="mobile">موبایل خالی</option>
                  <option value="major">بدون رشته</option>
                </select>
              </label>
            )}
            <input
              value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && run(1)}
              placeholder="🔍 شماره/نام/کد ملی..."
              className="bg-slate-50 border border-slate-300 rounded px-2 py-1.5 w-48"
            />
            <button onClick={() => run(1)} disabled={loading} className="px-4 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white font-bold rounded disabled:opacity-50">
              {loading ? '⏳ در حال اجرا...' : '▶ اجرای گزارش'}
            </button>
            {res && res.rows.length > 0 && (
              <button onClick={doExport} disabled={exporting} className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded disabled:opacity-50 mr-auto">
                {exporting ? '⏳...' : '📥 خروجی Excel (CSV)'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* نتیجه */}
      <div id="report-result" className="bg-white border border-slate-300 rounded-xl shadow-sm overflow-hidden">
        {!res ? (
          <p className="p-8 text-center text-slate-500 text-sm">
            گزارش «{card?.title}» را انتخاب و <b>اجرای گزارش</b> را بزنید.
          </p>
        ) : res.rows.length === 0 ? (
          <p className="p-8 text-center text-amber-700 bg-amber-50 text-sm">رکوردی با این فیلترها یافت نشد.</p>
        ) : (
          <>
            {res.summary && <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700">{res.summary}</div>}
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 border-b border-slate-300 font-bold text-slate-700 sticky top-0">
                  <tr>
                    {res.columns.map(c => <th key={c.key} className="p-2 whitespace-nowrap">{c.title}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {res.rows.map((r, i) => (
                    <tr key={i} className="border-b border-slate-200 hover:bg-slate-50">
                      {res.columns.map(c => (
                        <td key={c.key} className="p-2 whitespace-nowrap font-mono" dir={/^[0-9]/.test(String(r[c.key] ?? '')) ? 'ltr' : 'auto'}>
                          {String(r[c.key] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {res.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 p-3 text-xs border-t border-slate-200">
                <button disabled={res.page <= 1} onClick={() => runReport(kind, { ...filters, page: res.page - 1 }).then(setRes)} className="px-3 py-1.5 bg-white border border-slate-300 rounded font-bold disabled:opacity-40">قبلی ◀</button>
                <span className="font-bold">صفحه {res.page.toLocaleString('fa-IR')} از {res.totalPages.toLocaleString('fa-IR')} ({res.total.toLocaleString('fa-IR')} رکورد)</span>
                <button disabled={res.page >= res.totalPages} onClick={() => runReport(kind, { ...filters, page: res.page + 1 }).then(setRes)} className="px-3 py-1.5 bg-white border border-slate-300 rounded font-bold disabled:opacity-40">▶ بعدی</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
