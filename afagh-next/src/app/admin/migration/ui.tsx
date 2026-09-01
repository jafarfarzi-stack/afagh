'use client';

import { useRef, useState } from 'react';

// ═══ اجزای مشترک میز کار مهاجرت ═══

export type ImportReport = {
  kind: string; fileName: string; sheet: string; total: number;
  inserted: number; updated: number; invalid: number;
  errors: { row: number; msg: string }[]; warnings: { row: number; msg: string }[];
  sample?: Record<string, unknown>[]; sheets?: string[];
};

export const fmt = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString('fa-IR');

export function Stat({ label, value, tone = 'slate' }: { label: string; value: number | string; tone?: 'slate' | 'green' | 'red' | 'amber' | 'indigo' }) {
  const color = {
    slate: 'text-slate-700', green: 'text-emerald-600', red: 'text-red-600',
    amber: 'text-amber-500', indigo: 'text-indigo-600',
  }[tone];
  return (
    <div className="rounded-xl bg-slate-50 p-2 text-center">
      <p className={'text-xl font-bold ' + color}>{typeof value === 'number' ? fmt(value) : value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

export function Msg({ kind, children }: { kind: 'err' | 'ok' | 'warn' | 'info'; children: React.ReactNode }) {
  const cls = {
    err: 'bg-red-50 text-red-800', ok: 'bg-emerald-50 text-emerald-800',
    warn: 'bg-amber-50 text-amber-900', info: 'bg-slate-50 text-slate-700',
  }[kind];
  return <div className={`rounded-xl p-3 text-xs leading-6 ${cls}`}>{children}</div>;
}

/** آپلودر مشترک: انتخاب فایل اکسل/CSV + دکمهٔ عملیات + دانلود قالب */
export function Uploader({
  kind, sourceCode, label, actions, onDone, templateKind,
}: {
  kind: string;
  sourceCode: string;
  label: string;
  templateKind?: string;
  actions: { id: string; title: string; url: string; primary?: boolean; extra?: Record<string, string> }[];
  onDone: (report: ImportReport & { error?: string }) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [name, setName] = useState('');

  async function run(a: { id: string; url: string; extra?: Record<string, string> }) {
    const f = fileRef.current?.files?.[0];
    if (!f) { onDone({ error: 'اول فایل اکسل (xlsx) یا CSV را انتخاب کنید.' } as ImportReport & { error: string }); return; }
    setBusy(a.id);
    const fd = new FormData();
    fd.set('file', f);
    fd.set('kind', kind);
    fd.set('sourceCode', sourceCode);
    for (const [k, v] of Object.entries(a.extra ?? {})) fd.set(k, v);
    try {
      const r = await fetch(a.url, { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({ error: 'پاسخ نامعتبر از سرور' }));
      onDone(r.ok ? j : { ...j, error: j.error || `HTTP ${r.status}` });
    } catch (e) {
      onDone({ error: (e as Error).message } as ImportReport & { error: string });
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="grid gap-2 md:grid-cols-12 md:items-center">
      <label className="md:col-span-3 text-xs font-bold text-slate-600">{label}</label>
      <input
        ref={fileRef} type="file" className="input md:col-span-5"
        accept=".xlsx,.xlsm,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        onChange={e => setName(e.target.files?.[0]?.name ?? '')}
      />
      <div className="md:col-span-4 flex flex-wrap gap-2">
        {actions.map(a => (
          <button key={a.id} disabled={!!busy}
            className={(a.primary ? 'btn-primary' : 'btn-ghost') + ' flex-1 whitespace-nowrap'}
            onClick={() => run(a)}>
            {busy === a.id ? '…' : a.title}
          </button>
        ))}
        {templateKind && (
          <a className="btn-ghost whitespace-nowrap" href={`/api/admin/migration/template?kind=${templateKind}`}>
            ⬇ قالب اکسل
          </a>
        )}
      </div>
      {name && <p className="md:col-span-12 text-[11px] text-slate-400" dir="ltr">{name}</p>}
    </div>
  );
}

export function ReportBox({ report }: { report: (ImportReport & { error?: string }) | null }) {
  if (!report) return null;
  if (report.error) return <Msg kind="err">{report.error}</Msg>;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Stat label="ردیف فایل" value={report.total} />
        <Stat label="ثبت جدید" value={report.inserted} tone="green" />
        <Stat label="به‌روزرسانی" value={report.updated} tone="indigo" />
        <Stat label="نامعتبر" value={report.invalid} tone="red" />
        <Stat label="هشدار" value={report.warnings?.length ?? 0} tone="amber" />
      </div>
      {report.sheets?.length ? <p className="text-[11px] text-slate-400">برگه‌های فایل: {report.sheets.join('، ')} — برگهٔ استفاده‌شده: <b>{report.sheet}</b></p> : null}
      {report.errors?.length > 0 && (
        <Msg kind="err">
          <p className="mb-1 font-bold">خطاها:</p>
          {report.errors.slice(0, 8).map((e, i) => <p key={i}>{e.row ? `خط ${e.row}: ` : ''}{e.msg}</p>)}
          {report.errors.length > 8 && <p>… و {fmt(report.errors.length - 8)} مورد دیگر</p>}
        </Msg>
      )}
      {report.warnings?.length > 0 && (
        <Msg kind="warn">
          <p className="mb-1 font-bold">هشدارها:</p>
          {report.warnings.slice(0, 6).map((w, i) => <p key={i}>{w.row ? `خط ${w.row}: ` : ''}{w.msg}</p>)}
          {report.warnings.length > 6 && <p>… و {fmt(report.warnings.length - 6)} مورد دیگر</p>}
        </Msg>
      )}
    </div>
  );
}
