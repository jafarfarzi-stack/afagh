'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  listOfferingsForEditor, saveOfferingEditorAction, getRoomsForEditor,
  type OfferingEditRow,
} from './actions';

const DAYS = [{ v: 0, n: 'شنبه' }, { v: 1, n: 'یک‌شنبه' }, { v: 2, n: 'دوشنبه' }, { v: 3, n: 'سه‌شنبه' }, { v: 4, n: 'چهارشنبه' }, { v: 5, n: 'پنج‌شنبه' }, { v: 6, n: 'جمعه' }];
const sel = 'border border-slate-300 rounded-lg px-1.5 py-1 text-xs bg-white';

export default function OfferingEditorClient({ terms }: { terms: { id: number; title: string; isCurrent: boolean }[] }) {
  const [termId, setTermId] = useState(() => terms.find(t => t.isCurrent)?.id ?? terms[0]?.id ?? 0);
  const [rows, setRows] = useState<OfferingEditRow[]>([]);
  const [rooms, setRooms] = useState<{ id: number; name: string }[]>([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [draft, setDraft] = useState<OfferingEditRow | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termId]);
  const load = async () => {
    setRows(await listOfferingsForEditor(termId).catch(() => []));
    setRooms(await getRoomsForEditor().catch(() => []));
  };
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? rows.filter(r => (r.code + ' ' + r.title).toLowerCase().includes(t)) : rows;
  }, [rows, q]);

  const edit = (r: OfferingEditRow) => { setOpen(r.offeringId); setDraft(JSON.parse(JSON.stringify(r))); setReason(''); setMsg(null); };
  const save = async () => {
    if (!draft) return;
    setBusy(true); setMsg(null);
    const r = await saveOfferingEditorAction({
      offeringId: draft.offeringId, capacity: draft.capacity,
      classRows: draft.classRows.map(c => ({ id: c.id, day: c.day ?? 0, start: c.start ?? '', end: c.end ?? '', roomId: c.roomId })),
      exam: draft.exam ? { id: draft.exam.id, date: draft.exam.date ?? '', start: draft.exam.start ?? '', end: draft.exam.end ?? '' } : null,
      overrideReason: reason,
    }).catch(() => ({ ok: false as const, error: 'خطا' }));
    if (r.ok) { setMsg({ kind: 'ok', text: '✅ ذخیره شد.' }); await load(); setOpen(null); }
    else setMsg({ kind: 'err', text: r.error ?? '' });
    setBusy(false);
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="card">
        <h1 className="font-black">🛠️ تعریف / اصلاح درس در ترم</h1>
        <p className="text-xs text-slate-500 mt-1">ظرفیت، زمان کلاس، سالن و امتحان — با گارد تداخل (برای حوادث، دلیل/حکم لازم است). کارشناس فقط دامنهٔ خودش را می‌بیند.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={termId} onChange={e => setTermId(Number(e.target.value))} className={sel}>
            {terms.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="جست‌وجوی کد/نام…" className={sel + ' w-48'} />
          <button onClick={() => { setOpen(null); load(); }} className="rounded-lg bg-slate-800 px-3 py-1.5 text-white text-xs font-bold">تازه</button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-100 text-slate-600"><tr>
            <th className="p-2 text-right">درس</th><th className="p-2 text-center">گروه</th><th className="p-2 text-center">ظرفیت</th>
            <th className="p-2 text-center">پر شدگی</th><th className="p-2 text-right">زمان کلاس</th><th className="p-2 text-center">امتحان</th><th className="p-2 text-center">عملیات</th>
          </tr></thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.offeringId} className="border-t border-slate-100">
                <td className="p-2"><b>{r.code}</b> {r.title}<div className="text-[10px] text-slate-500">{r.professorName}</div></td>
                <td className="p-2 text-center">{r.groupNumber}</td>
                <td className="p-2 text-center">{r.capacity}</td>
                <td className="p-2 text-center">{r.enrolledCount}</td>
                <td className="p-2 text-slate-600">{r.classRows.map(c => `${DAYS.find(d => d.v === c.day)?.n ?? c.day} ${c.start}–${c.end}`).join('، ') || '—'}</td>
                <td className="p-2 text-slate-600">{r.exam ? `${r.exam.date} ${r.exam.start}` : '—'}</td>
                <td className="p-2 text-center"><button onClick={() => edit(r)} className="rounded-lg bg-indigo-700 px-3 py-1 text-white font-bold">✏️ ویرایش</button></td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={7} className="p-4 text-center text-slate-400">ارائه‌ای نیست.</td></tr>}
          </tbody>
        </table>
      </div>

      {open != null && draft && (
        <div className="rounded-2xl border border-indigo-300 bg-indigo-50/40 p-4 space-y-3">
          <h3 className="text-sm font-black">✏️ {draft.code} {draft.title} (گروه {draft.groupNumber})</h3>
          <label className="block text-xs font-bold text-slate-600">ظرفیت
            <input type="number" value={draft.capacity} onChange={e => setDraft({ ...draft, capacity: Number(e.target.value) })} className={sel + ' w-24'} />
          </label>
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-600">جلسات کلاس (روز / از / تا / سالن)</p>
            {draft.classRows.map((c, i) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2">
                <select value={c.day ?? 0} onChange={e => setDraft({ ...draft, classRows: draft.classRows.map((x, j) => j === i ? { ...x, day: Number(e.target.value) } : x) })} className={sel}>
                  {DAYS.map(d => <option key={d.v} value={d.v}>{d.n}</option>)}
                </select>
                <input type="time" value={c.start ?? ''} onChange={e => setDraft({ ...draft, classRows: draft.classRows.map((x, j) => j === i ? { ...x, start: e.target.value } : x) })} className={sel} />
                <input type="time" value={c.end ?? ''} onChange={e => setDraft({ ...draft, classRows: draft.classRows.map((x, j) => j === i ? { ...x, end: e.target.value } : x) })} className={sel} />
                <select value={c.roomId ?? ''} onChange={e => setDraft({ ...draft, classRows: draft.classRows.map((x, j) => j === i ? { ...x, roomId: e.target.value ? Number(e.target.value) : null } : x) })} className={sel}>
                  <option value="">— سالن —</option>
                  {rooms.map(r2 => <option key={r2.id} value={r2.id}>{r2.name}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold text-slate-600">امتحان:</p>
            <input type="text" value={draft.exam?.date ?? ''} onChange={e => setDraft({ ...draft, exam: draft.exam ? { ...draft.exam, date: e.target.value } : { id: null, date: e.target.value, start: '', end: '' } })} placeholder="تاریخ (1405/../..)" className={sel + ' w-32'} />
            <input type="time" value={draft.exam?.start ?? ''} onChange={e => setDraft({ ...draft, exam: draft.exam ? { ...draft.exam, start: e.target.value } : { id: null, date: '', start: e.target.value, end: '' } })} className={sel} />
            <input type="time" value={draft.exam?.end ?? ''} onChange={e => setDraft({ ...draft, exam: draft.exam ? { ...draft.exam, end: e.target.value } : { id: null, date: '', start: '', end: e.target.value } })} className={sel} />
            {draft.exam && draft.exam.date && (
              <button onClick={() => setDraft({ ...draft, exam: null })} className="text-[11px] text-rose-600 font-bold">حذف امتحان</button>
            )}
          </div>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="دلیل در صورت تداخل (حکم/مجوز) — در غیر این صورت خالی…" className={sel + ' w-full'} />
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={busy} className="rounded-xl bg-emerald-700 px-5 py-2 text-white font-black text-xs disabled:opacity-50">ذخیره</button>
            <button onClick={() => setOpen(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold">انصراف</button>
            {msg && <span className={'text-xs font-black ' + (msg.kind === 'ok' ? 'text-emerald-700' : 'text-rose-700')}>{msg.text}</span>}
          </div>
        </div>
      )}
    </div>
  );
}