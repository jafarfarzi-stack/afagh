'use client';

import { useState, useTransition } from 'react';
import { previewSanjeshAction, commitSanjeshAction } from './actions';

const DEFAULT_STRUCTURE = JSON.stringify([
  { name: 'nationalCode', start: 0, length: 10, target: 'nationalCode' },
  { name: 'studentCode', start: 10, length: 14, target: 'studentCode' },
  { name: 'previousMajorCode', start: 120, length: 6, target: 'previousMajorCode' },
  { name: 'previousMajorTitle', start: 126, length: 40, target: 'previousMajorTitle' },
], null, 2);

export default function SanjeshImportPage() {
  const [structure, setStructure] = useState(DEFAULT_STRUCTURE);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ count: number; sample: Record<string, string>[] } | null>(null);
  const [result, setResult] = useState<{ updated: number; notFound: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const buildFd = () => {
    const fd = new FormData();
    fd.set('structure', structure);
    if (file) fd.set('file', file);
    return fd;
  };

  const onPreview = () => {
    setError(''); setResult(null);
    startTransition(async () => {
      const r = await previewSanjeshAction(buildFd());
      if (!r.ok) { setError(r.error || 'خطا'); return; }
      setPreview({ count: r.count!, sample: r.sample! });
    });
  };

  const onCommit = () => {
    if (!confirm('آیا از ثبت اطلاعات رشتهٔ قبلی برای دانشجویان اطمینان دارید؟')) return;
    setError(''); setPreview(null);
    startTransition(async () => {
      const r = await commitSanjeshAction(buildFd());
      if (!r.ok) { setError(r.error || 'خطا'); return; }
      setResult({ updated: r.updated!, notFound: r.notFound!, total: r.total! });
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-black text-slate-900">درون‌ریزی رشتهٔ قبلی از فایل سنجش</h1>
        <p className="mt-1 text-xs leading-6 text-slate-600">
          ساختار ستون‌های فایل سنجش (JSON) را وارد کنید و فایل ثابت‌عرض را بارگذاری کنید. سیستم بر اساس کد ملی یا
          شمارهٔ دانشجویی، دانشجو را پیدا کرده و رشتهٔ قبلی، عنوان و نسبت آن را ثبت می‌کند. نسبت به‌صورت خودکار
          پیشنهاد می‌شود و در صفحهٔ «دانشجویان جبرانی» قابل اصلاح است.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <label className="text-xs font-bold text-slate-700 space-y-1 block">
          <span className="block">ساختار ستون‌ها (JSON)</span>
          <textarea
            value={structure}
            onChange={e => setStructure(e.target.value)}
            rows={12}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-mono"
            dir="ltr"
          />
        </label>
        <label className="text-xs font-bold text-slate-700 space-y-1 block">
          <span className="block">فایل داده (ثابت‌عرض)</span>
          <input type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} className="text-xs" />
        </label>
        <div className="flex gap-2">
          <button onClick={onPreview} disabled={pending} className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50">
            پیش‌نمایش
          </button>
          <button onClick={onCommit} disabled={pending} className="rounded-lg bg-indigo-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-800 disabled:opacity-50">
            ثبت در سیستم
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800 border border-red-200 font-bold">⛔ {error}</p>}

      {preview && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-2">
          <h3 className="font-extrabold text-sm text-slate-900">پیش‌نمایش ({preview.count} رکورد)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] rt">
              <thead className="bg-slate-100">
                <tr>{Object.keys(preview.sample[0] || {}).map(k => <th key={k} className="p-1 text-right">{k}</th>)}</tr>
              </thead>
              <tbody>
                {preview.sample.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    {Object.keys(preview.sample[0] || {}).map(k => <td key={k} className="p-1 font-mono" dir="ltr">{r[k]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result && (
        <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 border border-emerald-200 font-bold">
          ✅ {result.updated} دانشجو به‌روزرسانی شد، {result.notFound} یافت نشد (از {result.total} رکورد).
        </div>
      )}
    </div>
  );
}
