'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { ADD_LABEL, CREATE_ELSEWHERE, NEW_FIELDS, type CodeRow, type CodeStat, type CodeTable, type FormOptions } from './tables';
import Link from 'next/link';

type Res = { ok: boolean; error?: string };

const PAGE = 200;

export default function CodesClient({
  stats,
  initialTable,
  initialRows,
  listAction,
  setCodeAction,
  createAction,
  deleteAction,
  options,
}: {
  stats: CodeStat[];
  initialTable: CodeTable;
  initialRows: CodeRow[];
  listAction: (table: CodeTable, q: string) => Promise<CodeRow[]>;
  setCodeAction: (fd: FormData) => Promise<Res>;
  createAction: (fd: FormData) => Promise<Res & { id?: number }>;
  deleteAction: (fd: FormData) => Promise<Res>;
  options: FormOptions;
}) {
  const [table, setTable] = useState<CodeTable>(initialTable);
  const [rows, setRows] = useState<CodeRow[]>(initialRows);
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<'ALL' | 'MISSING' | 'DUP'>('ALL');
  const [page, setPage] = useState(0);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [dirty, setDirty] = useState<Record<number, string>>({});
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const cur = stats.find(s => s.id === table);
  const newFields = NEW_FIELDS[table] ?? [];
  const elsewhere = CREATE_ELSEWHERE[table];

  // با عوض‌شدن جدول، فرمِ باز را ببند و مقادیر پیش‌فرض را بگذار
  useEffect(() => {
    setAdding(false);
    setForm(Object.fromEntries((NEW_FIELDS[table] ?? []).map(f => [f.name, f.def ?? ''])));
  }, [table]);

  const submitNew = () =>
    start(async () => {
      const fd = new FormData();
      fd.set('table', table);
      for (const f of newFields) fd.set(f.name, form[f.name] ?? '');
      const r = await createAction(fd);
      if (r.ok) {
        setMsg({ kind: 'ok', text: 'رکورد تازه ثبت شد. برای دیده‌شدن در فهرست‌های دیگر، صفحه را تازه کنید.' });
        setAdding(false);
        setForm(Object.fromEntries(newFields.map(f => [f.name, f.def ?? ''])));
        setRows(await listAction(table, ''));
      } else {
        setMsg({ kind: 'err', text: r.error ?? 'ثبت نشد.' });
      }
    });

  const remove = (row: CodeRow) =>
    start(async () => {
      if (!confirm(`«${row.title}» حذف شود؟ اگر جایی استفاده شده باشد، حذف نمی‌شود.`)) return;
      const fd = new FormData();
      fd.set('table', table);
      fd.set('id', String(row.id));
      const r = await deleteAction(fd);
      if (r.ok) {
        setMsg({ kind: 'ok', text: `«${row.title}» حذف شد.` });
        setRows(await listAction(table, ''));
      } else {
        setMsg({ kind: 'err', text: r.error ?? 'حذف نشد.' });
      }
    });

  // بارگذاری جدول انتخاب‌شده
  useEffect(() => {
    start(async () => {
      setRows(await listAction(table, ''));
      setPage(0);
      setDirty({});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  const filtered = useMemo(() => {
    const t = q.trim();
    return rows.filter(r => {
      if (only === 'MISSING' && r.code) return false;
      if (only === 'DUP' && !r.duplicate) return false;
      if (!t) return true;
      return r.title.includes(t) || (r.code ?? '').includes(t) || (r.context ?? '').includes(t);
    });
  }, [rows, q, only]);

  const shown = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.ceil(filtered.length / PAGE);

  const save = (row: CodeRow, code: string) =>
    start(async () => {
      const fd = new FormData();
      fd.set('table', table);
      fd.set('id', String(row.id));
      fd.set('code', code);
      const r = await setCodeAction(fd);
      if (r.ok) {
        setMsg({ kind: 'ok', text: `کد «${row.title}» ذخیره شد.` });
        setRows(await listAction(table, ''));
        setDirty(d => { const n = { ...d }; delete n[row.id]; return n; });
      } else {
        setMsg({ kind: 'err', text: r.error ?? 'ذخیره نشد.' });
      }
    });

  return (
    <div className="space-y-4">
      {/* کارت‌های سلامت کد */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(s => {
          const active = s.id === table;
          const bad = s.missing > 0 || s.duplicate > 0;
          return (
            <button
              key={s.id}
              onClick={() => setTable(s.id)}
              className={
                'rounded-xl border p-3 text-right transition-colors ' +
                (active ? 'border-indigo-500 bg-indigo-50' : bad ? 'border-amber-200 bg-white hover:bg-amber-50' : 'border-slate-200 bg-white hover:bg-slate-50')
              }
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">{s.title}</span>
                <span className="text-xs tabular-nums text-slate-400">{s.total.toLocaleString('fa-IR')}</span>
              </div>
              <p className="mt-0.5 text-[11px] leading-5 text-slate-500">{s.hint}</p>
              <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                {s.missing > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">{s.missing.toLocaleString('fa-IR')} بدون کد</span>}
                {s.duplicate > 0 && <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">{s.duplicate.toLocaleString('fa-IR')} کد تکراری</span>}
                {s.missing === 0 && s.duplicate === 0 && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">✓ همه کد دارند</span>}
                {!s.editable && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
                    {s.creatable ? 'کد ثابت — فقط افزودن' : 'فقط خواندنی'}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {msg && (
        <div className={'rounded-xl border p-3 text-sm ' + (msg.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700')}>
          {msg.text}
          <button onClick={() => setMsg(null)} className="float-left text-xs opacity-60 hover:opacity-100">بستن</button>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <h2 className="text-sm font-extrabold text-slate-800">{cur?.title}</h2>
          <input
            value={q}
            onChange={e => { setQ(e.target.value); setPage(0); }}
            placeholder="جستجوی کد، عنوان یا زمینه…"
            className="w-56 rounded-lg border border-slate-300 p-1.5 text-xs"
          />
          <div className="flex gap-1 text-[11px]">
            {([['ALL', 'همه'], ['MISSING', 'بدون کد'], ['DUP', 'کد تکراری']] as const).map(([k, lbl]) => (
              <button
                key={k}
                onClick={() => { setOnly(k); setPage(0); }}
                className={'rounded-lg border px-2 py-1 ' + (only === k ? 'border-indigo-400 bg-indigo-50 font-bold text-indigo-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50')}
              >
                {lbl}
              </button>
            ))}
          </div>
          <span className="mr-auto text-[11px] text-slate-400">
            {filtered.length.toLocaleString('fa-IR')} ردیف
            {pending && ' · در حال بارگذاری…'}
          </span>
          {cur?.creatable && (
            <button
              onClick={() => setAdding(a => !a)}
              className={'rounded-lg px-3 py-1.5 text-xs font-bold ' + (adding ? 'bg-slate-200 text-slate-700' : 'bg-emerald-600 text-white hover:bg-emerald-700')}
            >
              {adding ? 'انصراف' : `➕ ${ADD_LABEL[table] ?? 'افزودن'}`}
            </button>
          )}
          {elsewhere && (
            <Link href={elsewhere.href} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">
              ➕ {elsewhere.label}
            </Link>
          )}
        </div>

        {/* فرم افزودن */}
        {adding && cur?.creatable && (
          <div className="border-b border-emerald-100 bg-emerald-50/60 p-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {newFields.map(f => (
                <label key={f.name} className="block">
                  <span className="mb-1 block text-[11px] font-bold text-slate-700">
                    {f.label}{f.required && <span className="text-red-600"> *</span>}
                  </span>
                  {f.kind === 'select' ? (
                    <select
                      value={form[f.name] ?? ''}
                      onChange={e => setForm(v => ({ ...v, [f.name]: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 bg-white p-1.5 text-xs"
                    >
                      <option value="">— انتخاب کنید —</option>
                      {(f.choices ?? options[f.optionsFrom ?? 'degree'] ?? []).map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      dir={f.kind === 'text' ? 'rtl' : 'ltr'}
                      inputMode={f.kind === 'number' ? 'decimal' : undefined}
                      value={form[f.name] ?? ''}
                      onChange={e => setForm(v => ({ ...v, [f.name]: e.target.value }))}
                      className={'w-full rounded-lg border border-slate-300 p-1.5 text-xs ' + (f.kind === 'text' ? '' : 'text-center font-mono')}
                    />
                  )}
                  {f.hint && <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">{f.hint}</span>}
                </label>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                disabled={pending}
                onClick={submitNew}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                ثبت
              </button>
              <button onClick={() => setAdding(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600">انصراف</button>
              <span className="text-[11px] text-slate-500">
                کد را همان‌طور بنویسید که در فایل‌های اکسل مبدأ آمده — تطبیق انتقال داده اول با کد انجام می‌شود.
              </span>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="w-40 p-2.5">کد</th>
                <th className="p-2.5">عنوان</th>
                <th className="p-2.5">زمینه</th>
                <th className="w-32 p-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map(r => {
                const val = dirty[r.id] ?? r.code ?? '';
                const changed = (dirty[r.id] ?? null) !== null && dirty[r.id] !== (r.code ?? '');
                return (
                  <tr key={r.id} className={'border-t border-slate-100 ' + (r.duplicate ? 'bg-red-50/60' : !r.code ? 'bg-amber-50/40' : '')}>
                    <td className="p-2">
                      <input
                        dir="ltr"
                        value={val}
                        disabled={!cur?.editable || pending}
                        onChange={e => setDirty(d => ({ ...d, [r.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter' && changed) save(r, val.trim()); }}
                        placeholder="بدون کد"
                        className={
                          'w-32 rounded border p-1 text-center font-mono disabled:bg-slate-50 disabled:text-slate-500 ' +
                          (r.duplicate ? 'border-red-400 bg-red-50' : !r.code ? 'border-amber-400 bg-amber-50' : 'border-slate-300')
                        }
                      />
                    </td>
                    <td className="p-2 font-medium text-slate-800">
                      {r.title}
                      {r.duplicate && <span className="mr-1 rounded bg-red-100 px-1 text-[10px] text-red-700">کد تکراری</span>}
                    </td>
                    <td className="p-2 text-slate-500">{r.context ?? '—'}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap items-center gap-1">
                        {changed && (
                          <button
                            disabled={pending}
                            onClick={() => save(r, val.trim())}
                            className="rounded bg-indigo-600 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                          >
                            ذخیره
                          </button>
                        )}
                        {cur?.creatable && (
                          <button
                            disabled={pending}
                            onClick={() => remove(r)}
                            title="حذف — فقط اگر هیچ‌جا استفاده نشده باشد"
                            className="rounded border border-red-200 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            حذف
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr><td colSpan={4} className="p-6 text-center text-slate-400">ردیفی نیست.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-center gap-2 border-t border-slate-100 p-2 text-xs">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40">قبلی</button>
            <span className="text-slate-500">صفحهٔ {(page + 1).toLocaleString('fa-IR')} از {pages.toLocaleString('fa-IR')}</span>
            <button disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40">بعدی</button>
          </div>
        )}
      </div>
    </div>
  );
}
