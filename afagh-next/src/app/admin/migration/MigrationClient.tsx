'use client';

import { useEffect, useRef, useState } from 'react';

type Entity = { id: string; title: string; sample: string };
type Issue = { row: number; msg: string };
type Report = { entity: string; fileName: string; total: number; invalid: number; willInsert: number; existing: number; errors: Issue[]; warnings: Issue[]; sample: Record<string, unknown>[] };
type Run = { id: number; entity: string; fileName: string; mode: string; status: string; total: number; inserted: number; existing: number; invalid: number; at: string | null };

export default function MigrationClient({ entities }: { entities: Entity[] }) {
  const [entity, setEntity] = useState(entities[0]?.id ?? 'student');
  const [busy, setBusy] = useState<'dry' | 'commit' | ''>('');
  const [report, setReport] = useState<Report | null>(null);
  const [err, setErr] = useState('');
  const [runs, setRuns] = useState<Run[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadRuns() {
    const r = await fetch('/api/admin/migration/runs');
    if (r.ok) setRuns(await r.json());
  }
  useEffect(() => { loadRuns(); }, []);

  async function call(mode: 'dry-run' | 'commit') {
    const f = fileRef.current?.files?.[0];
    if (!f) { setErr('اول فایل CSV را انتخاب کنید.'); return; }
    setErr(''); setBusy(mode === 'dry-run' ? 'dry' : 'commit'); setReport(null);
    const fd = new FormData();
    fd.set('entity', entity); fd.set('file', f);
    const r = await fetch('/api/admin/migration/' + mode, { method: 'POST', body: fd });
    setBusy('');
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error || ('HTTP ' + r.status)); return; }
    setReport(j);
    loadRuns();
  }

  const cur = entities.find(e => e.id === entity);

  return (
    <div className="space-y-4">
      <div className="card grid gap-3 md:grid-cols-4">
        <select className="input" value={entity} onChange={e => setEntity(e.target.value)}>
          {entities.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
        <input ref={fileRef} type="file" accept=".csv,.txt,text/csv" className="input md:col-span-2" />
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" disabled={!!busy} onClick={() => call('dry-run')}>{busy === 'dry' ? '…' : 'تحلیل اولیه'}</button>
          <button className="btn-primary flex-1" disabled={!!busy} onClick={() => call('commit')}>{busy === 'commit' ? '…' : 'ثبت نهایی'}</button>
        </div>
        {cur && <p className="md:col-span-4 text-[11px] text-slate-400">ستون‌های نمونه: <span dir="ltr">{cur.sample}</span></p>}
        {err && <p className="md:col-span-4 rounded-xl bg-red-50 p-2 text-sm text-red-700">{err}</p>}
      </div>

      {report && (
        <div className="card space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5 text-center">
            <div><p className="text-2xl font-bold text-slate-700">{report.total}</p><p className="text-xs text-slate-500">ردیف فایل</p></div>
            <div><p className="text-2xl font-bold text-emerald-600">{report.willInsert}</p><p className="text-xs text-slate-500">ثبت‌شده / ثبت‌خواهد‌شد</p></div>
            <div><p className="text-2xl font-bold text-slate-400">{report.existing}</p><p className="text-xs text-slate-500">موجود (نادیده)</p></div>
            <div><p className="text-2xl font-bold text-red-600">{report.invalid}</p><p className="text-xs text-slate-500">نامعتبر</p></div>
            <div><p className="text-2xl font-bold text-amber-500">{report.warnings.length}</p><p className="text-xs text-slate-500">هشدار</p></div>
          </div>
          {report.errors.length > 0 && (
            <div className="rounded-xl bg-red-50 p-3 text-xs text-red-800">
              <p className="mb-1 font-bold">خطاها:</p>
              {report.errors.slice(0, 10).map((e, i) => <p key={i}>خط {e.row}: {e.msg}</p>)}
              {report.errors.length > 10 && <p>… و {report.errors.length - 10} مورد دیگر</p>}
            </div>
          )}
          {report.warnings.length > 0 && (
            <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
              <p className="mb-1 font-bold">هشدارها:</p>
              {report.warnings.slice(0, 6).map((w, i) => <p key={i}>{w.row ? `خط ${w.row}: ` : ''}{w.msg}</p>)}
              {report.warnings.length > 6 && <p>… و {report.warnings.length - 6} مورد دیگر</p>}
            </div>
          )}
        </div>
      )}

      <div className="card overflow-x-auto">
        <h3 className="mb-2 text-sm font-bold">تاریخچهٔ مهاجرت‌ها</h3>
        <table className="w-full text-right text-xs">
          <thead><tr className="text-slate-500"><th className="p-2">#</th><th className="p-2">نوع</th><th className="p-2">فایل</th><th className="p-2">حالت</th><th className="p-2">ردیف</th><th className="p-2">ثبت‌شده</th><th className="p-2">موجود</th><th className="p-2">نامعتبر</th><th className="p-2">زمان</th></tr></thead>
          <tbody>
            {runs.length === 0 && <tr><td colSpan={9} className="p-3 text-center text-slate-400">هنوز مهاجرتی اجرا نشده.</td></tr>}
            {runs.map(r => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="p-2 font-mono">{r.id}</td>
                <td className="p-2">{r.entity}</td>
                <td className="p-2" dir="ltr">{r.fileName}</td>
                <td className="p-2"><span className={'badge ' + (r.mode === 'COMMIT' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-600')}>{r.mode === 'COMMIT' ? 'ثبت' : 'تحلیل'}</span></td>
                <td className="p-2">{r.total}</td>
                <td className="p-2 font-bold text-emerald-700">{r.inserted}</td>
                <td className="p-2 text-slate-400">{r.existing}</td>
                <td className="p-2 text-red-600">{r.invalid}</td>
                <td className="p-2 text-slate-500" dir="ltr">{r.at ? new Date(r.at).toLocaleString('fa-IR') : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
