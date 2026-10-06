'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  assignCoursesAction,
  assignMajorsAction,
  listOrphanCourses,
  listOrphanMajors,
  type OrphanCourseRow,
  type OrphanMajorRow,
} from './actions';
import { faNum } from '../curriculum/curriculum-core';

type Mode = 'courses' | 'majors';

/** تعیین تکلیف دروس و رشته‌های بی‌گروه دانشگاه فعال — در همین صفحه */
export default function OrphanCoursesPanel({
  depts,
  total,
}: {
  depts: { id: number; name: string }[];
  total: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('courses');
  const [crows, setCRows] = useState<OrphanCourseRow[]>([]);
  const [mrows, setMRows] = useState<OrphanMajorRow[]>([]);
  const [count, setCount] = useState(total);
  const [mcount, setMCount] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [per] = useState(20);
  const [pages, setPages] = useState(1);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [deptId, setDeptId] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = (m: Mode, p: number, query: string) =>
    start(async () => {
      if (m === 'courses') {
        const r = await listOrphanCourses({ q: query, page: p, per });
        setCRows(r.rows);
        setCount(r.total);
        setPages(Math.max(1, Math.ceil(r.total / r.per)));
      } else {
        const r = await listOrphanMajors({ q: query, page: p, per });
        setMRows(r.rows);
        setMCount(r.total);
        setPages(Math.max(1, Math.ceil(r.total / r.per)));
      }
      setPage(p);
      setSel(new Set());
    });

  const toggleOpen = () => {
    if (!open) {
      load(mode, 1, q);
      if (mcount === null) listOrphanMajors({ page: 1, per: 1 }).then(r => setMCount(r.total));
    }
    setOpen(o => !o);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setPage(1);
    setQ('');
    setSel(new Set());
    setDeptId('');
    load(m, 1, '');
  };

  const rows: { id: number }[] = mode === 'courses' ? crows : mrows;

  const toggle = (id: number) =>
    setSel(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const togglePage = () =>
    setSel(prev => {
      const next = new Set(prev);
      const allIn = rows.every(r => next.has(r.id));
      rows.forEach(r => { if (allIn) next.delete(r.id); else next.add(r.id); });
      return next;
    });

  const doAssign = () =>
    start(async () => {
      if (!deptId) { setMsg({ kind: 'err', text: 'گروه مقصد را انتخاب کنید.' }); return; }
      if (sel.size === 0) { setMsg({ kind: 'err', text: 'هیچ موردی انتخاب نشده است.' }); return; }
      const fd = new FormData();
      fd.set('deptId', deptId);
      if (mode === 'courses') {
        fd.set('courseIds', [...sel].join(','));
        const r = await assignCoursesAction(fd);
        if (r.ok) {
          setMsg({ kind: 'ok', text: `${r.moved?.toLocaleString('fa-IR')} درس به گروه وصل شد.` });
          setDeptId('');
          load('courses', page, q);
          router.refresh();
        } else {
          setMsg({ kind: 'err', text: r.error ?? 'انجام نشد.' });
        }
      } else {
        fd.set('majorIds', [...sel].join(','));
        const r = await assignMajorsAction(fd);
        if (r.ok) {
          setMsg({ kind: 'ok', text: `${r.moved?.toLocaleString('fa-IR')} رشته به گروه وصل شد.` });
          setDeptId('');
          load('majors', page, q);
          router.refresh();
        } else {
          setMsg({ kind: 'err', text: r.error ?? 'انجام نشد.' });
        }
      }
    });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold text-slate-900 text-sm">
          🧩 تعیین تکلیف بی‌گروه‌ها ({faNum(count)} درس{ mcount !== null ? ` · ${faNum(mcount)} رشته` : ''})
        </h3>
        <button
          onClick={toggleOpen}
          className="px-4 py-1.5 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white font-extrabold text-xs"
        >
          {open ? 'بستن فهرست' : '👁 نمایش'}
        </button>
      </div>

      {msg && (
        <div className={'rounded-xl border p-3 text-sm ' + (msg.kind === 'ok'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-red-200 bg-red-50 text-red-700')}>
          {msg.text}
          <button onClick={() => setMsg(null)} className="float-left text-xs opacity-60 hover:opacity-100">بستن</button>
        </div>
      )}

      {open && (
        <>
          <div className="flex gap-1.5">
            {(['courses', 'majors'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition ${mode === m ? 'bg-indigo-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {m === 'courses' ? `📖 دروس (${faNum(count)})` : `🎓 رشته‌ها (${mcount === null ? '…' : faNum(mcount)})`}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && load(mode, 1, q)}
              placeholder={mode === 'courses' ? '🔍 جستجو کد/عنوان درس… (Enter)' : '🔍 جستجو نام/کد رشته… (Enter)'}
              className="border border-slate-300 rounded-lg px-2 py-1.5 w-56"
            />
            <button onClick={() => load(mode, 1, q)} disabled={pending} className="px-3 py-1.5 rounded-lg bg-slate-800 text-white font-bold disabled:opacity-50">
              جستجو
            </button>
            <select value={deptId} onChange={e => setDeptId(e.target.value)} className="border border-amber-300 bg-amber-50 rounded-lg px-2 py-1.5 font-bold">
              <option value="">انتخاب گروه مقصد…</option>
              {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button onClick={doAssign} disabled={pending || sel.size === 0} className="px-4 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold disabled:opacity-50">
              اتصال {sel.size > 0 ? faNum(sel.size) : ''} مورد منتخب
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white text-center">
                  <th className="p-2 border border-slate-800 w-10">
                    <input type="checkbox" checked={rows.length > 0 && rows.every(r => sel.has(r.id))} onChange={togglePage} className="w-4 h-4 accent-emerald-600" />
                  </th>
                  <th className="p-2 border border-slate-800">کد</th>
                  <th className="p-2 border border-slate-800">{mode === 'courses' ? 'عنوان درس' : 'نام رشته'}</th>
                  {mode === 'courses' && <th className="p-2 border border-slate-800">نوع</th>}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={mode === 'courses' ? 4 : 3} className="p-6 text-center text-slate-400 font-bold">
                    {pending ? '⏳ در حال بارگذاری…' : 'ردیفی یافت نشد.'}
                  </td></tr>
                )}
                {mode === 'courses' && crows.map(r => (
                  <tr key={r.id} className={sel.has(r.id) ? 'bg-emerald-50' : 'hover:bg-slate-50'}>
                    <td className="p-2 border border-slate-200 text-center">
                      <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} className="w-4 h-4 accent-emerald-600" />
                    </td>
                    <td className="p-2 border border-slate-200 font-mono text-center font-bold text-indigo-900">{r.code}</td>
                    <td className="p-2 border border-slate-200 font-bold text-right">{r.title}</td>
                    <td className="p-2 border border-slate-200 text-center text-slate-500">{r.courseType ?? '—'}</td>
                  </tr>
                ))}
                {mode === 'majors' && mrows.map(r => (
                  <tr key={r.id} className={sel.has(r.id) ? 'bg-emerald-50' : 'hover:bg-slate-50'}>
                    <td className="p-2 border border-slate-200 text-center">
                      <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} className="w-4 h-4 accent-emerald-600" />
                    </td>
                    <td className="p-2 border border-slate-200 font-mono text-center font-bold text-indigo-900">{r.code ?? '—'}</td>
                    <td className="p-2 border border-slate-200 font-bold text-right">{r.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs">
            <button disabled={page <= 1 || pending} onClick={() => load(mode, page - 1, q)} className="px-3 py-1.5 bg-white border border-slate-300 rounded font-bold disabled:opacity-40">قبلی ▶</button>
            <span className="font-bold">صفحه {faNum(page)} از {faNum(pages)}</span>
            <button disabled={page >= pages || pending} onClick={() => load(mode, page + 1, q)} className="px-3 py-1.5 bg-white border border-slate-300 rounded font-bold disabled:opacity-40">◀ بعدی</button>
          </div>
        </>
      )}
    </div>
  );
}
