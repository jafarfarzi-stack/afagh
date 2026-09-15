'use client';

import { useState } from 'react';
import { enqueueForSamin, sendToSamin, traceSamin } from './actions';

type Uni = { id: number; code: string; title: string };

export default function SaminClient({
  university, universities, staging, logs, totalStaging,
}: {
  university: any; universities: Uni[];
  staging: { id: number; entityCode: string; personPkInSource: string | null; status: string; traceId: number | null; errorMessage: string | null; createdAt: string | null }[];
  logs: { id: number; entityCode: string; traceId: number | null; status: string; summaryResult: unknown; createdAt: string | null }[];
  totalStaging: number;
}) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-4">
      {msg && <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-2 rounded whitespace-pre-wrap">{msg}</div>}

      <div className="card space-y-3">
        <h3 className="font-bold text-xs">۱) آماده‌سازی صف ثمین از داده داخلی</h3>
        <p className="text-[11px] text-slate-500">
          دانشجویان تاییدشدهٔ دانشگاه «{university.title}» را به صف ثمین (entity 1000) می‌برد. اجرای دوباره تکراری نمی‌سازد.
        </p>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await enqueueForSamin(university.id);
              setMsg(`صف ثمین: ${r.inserted} افزوده، ${r.skipped} تکراری`);
            } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
          }}
          className="bg-indigo-600 text-white px-4 py-1.5 rounded text-xs disabled:opacity-50"
        >
          آماده‌سازی صف (از students)
        </button>
        <span className="text-[11px] text-slate-500">کل صف: {totalStaging}</span>
      </div>

      <div className="card space-y-3">
        <h3 className="font-bold text-xs">۲) ارسال به ثمین</h3>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await sendToSamin(university.id, '1000');
              setMsg(`ارسال شد: trace_id=${r.trace_id ?? r.traceId ?? '—'} status=${r.import_data_status ?? r.status ?? '—'}`);
            } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
          }}
          className="bg-emerald-600 text-white px-4 py-1.5 rounded text-xs disabled:opacity-50"
        >
          ارسال ۵۰تایی (bulk_import_data)
        </button>
      </div>

      <div className="card space-y-2">
        <h3 className="font-bold text-xs">صف ثمین (۵۰ اخیر)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead><tr className="bg-slate-50 border-b"><th className="px-2 py-1 text-right">person_pk</th><th className="px-2 py-1">وضعیت</th><th className="px-2 py-1">trace</th></tr></thead>
            <tbody>
              {staging.map(s => (
                <tr key={s.id} className="border-b">
                  <td className="px-2 py-1 font-mono">{s.personPkInSource}</td>
                  <td className="px-2 py-1">{s.status}</td>
                  <td className="px-2 py-1 font-mono">{s.traceId ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card space-y-2">
        <h3 className="font-bold text-xs">لاگ همگام‌سازی (۲۰ اخیر)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead><tr className="bg-slate-50 border-b"><th className="px-2 py-1">trace</th><th className="px-2 py-1">وضعیت</th><th className="px-2 py-1">نتیجه</th></tr></thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-b">
                  <td className="px-2 py-1 font-mono">{l.traceId ?? '—'}</td>
                  <td className="px-2 py-1">{l.status}</td>
                  <td className="px-2 py-1 whitespace-pre-wrap">{JSON.stringify(l.summaryResult)?.slice(0, 200)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
