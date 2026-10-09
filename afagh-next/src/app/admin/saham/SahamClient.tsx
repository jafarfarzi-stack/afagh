'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { SahamStat } from './page';

const FILL_ROWS: { key: keyof SahamStat['fill']; label: string; hint: string }[] = [
  { key: 'teachingMode', label: 'شیوه آموزش', hint: 'پیش‌فرض همه «حضوری»' },
  { key: 'studyType', label: 'نوع تحصیل', hint: 'از فایل قدیمی (COURSTYPE)' },
  { key: 'maritalStatus', label: 'وضعیت تاهل', hint: 'از فایل قدیمی (MARRIED)' },
  { key: 'birthProvince', label: 'استان محل تولد', hint: 'دستی — در فایل قدیمی نبود' },
  { key: 'residenceProvince', label: 'استان محل سکونت', hint: 'دستی — در فایل قدیمی نبود' },
];

export default function SahamClient({ stats }: { stats: SahamStat[] }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState('');

  const download = async (id: number) => {
    setBusy(id);
    setErr('');
    try {
      const res = await fetch(`/api/admin/saham/students?universityId=${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'خطای نامشخص' }));
        throw new Error(body.error || 'ساخت فایل ناموفق بود.');
      }
      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') || '';
      const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
      const name = m ? decodeURIComponent(m[1]) : `SAHAM-${id}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'خطای نامشخص');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      {err && (
        <div className="rounded-xl border border-red-300 bg-red-50/70 p-3 text-xs font-bold text-red-800">
          ❌ {err}
        </div>
      )}

      <div className="card !p-0 overflow-hidden">
        <table className="w-full text-right text-xs">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-2.5">دانشگاه / مؤسسه</th>
              <th className="p-2.5">کد سهام</th>
              <th className="p-2.5">دانشجو</th>
              {FILL_ROWS.map(f => <th key={f.key} className="p-2.5 whitespace-nowrap">{f.label}</th>)}
              <th className="p-2.5">خروجی</th>
            </tr>
          </thead>
          <tbody>
            {stats.map(s => {
              const noCode = s.sahamCodeCount === 0;
              return (
                <tr key={s.universityId} className="border-t border-slate-200">
                  <td className="p-2.5">
                    <div className="font-bold text-[13px]">{s.title}</div>
                    <div className="text-[10px] text-slate-500">
                      {s.code}
                      {s.isDissolved && <span className="mr-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[9px]">منحل</span>}
                    </div>
                  </td>
                  <td className="p-2.5">
                    {noCode
                      ? <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">بدون کد</span>
                      : <span className="font-mono text-[11px]">{s.sahamCodeCount.toLocaleString('fa-IR')} واحد</span>}
                  </td>
                  <td className="p-2.5 font-bold">{s.students.toLocaleString('fa-IR')}</td>
                  {FILL_ROWS.map(f => {
                    const n = s.fill[f.key];
                    const pct = s.students ? Math.round((n / s.students) * 100) : 0;
                    return (
                      <td key={f.key} className="p-2.5" title={f.hint}>
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-12 overflow-hidden rounded bg-slate-200">
                            <div
                              className={`h-full ${pct >= 90 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-400'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="font-mono text-[10px] text-slate-600">{pct.toLocaleString('fa-IR')}٪</span>
                        </div>
                      </td>
                    );
                  })}
                  <td className="p-2.5">
                    <button
                      onClick={() => download(s.universityId)}
                      disabled={busy === s.universityId || s.students === 0}
                      className="rounded bg-indigo-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-800 disabled:opacity-40"
                    >
                      {busy === s.universityId ? '⏳ در حال ساخت…' : '⬇️ دانلود اکسل'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card !p-3 text-[11px] leading-6 text-slate-600">
        <b>قبل از ارسال به سهام این‌ها را چک کنید:</b>
        <ul className="mr-4 mt-1 list-disc space-y-0.5">
          <li>ستون «کد دانشکده/واحد» ۱۲ رقمی و با فرمت <span className="font-mono">Text</span> باشد — صفرهای اول نباید حذف شود.</li>
          <li>ستون‌های متنی نباید عدد باشند؛ سهام مقدار را با فهرست بستهٔ خودش مقایسه می‌کند («نام مطابقت نداشت»).</li>
          <li>شمارهٔ ملی تکراری یا خالی = حذف کل رکورد در سامانهٔ سهام؛ این را از فایل جداگانهٔ «نظام وظیفه» می‌فرستید.</li>
          <li>استان/شهر تولد و سکونت در فایل قدیمی نبود و فعلاً خالی است — اگر خالی بماند سهام رد می‌کند؛ از پروندهٔ دانشجویی تکمیل کنید.</li>
        </ul>
        <div className="mt-2 flex flex-wrap gap-3">
          <Link href="/admin/migration" className="font-bold text-indigo-700 underline">تکمیل کدها و نگاشت‌ها</Link>
          <Link href="/admin/students" className="font-bold text-indigo-700 underline">پروندهٔ دانشجویان</Link>
        </div>
      </div>
    </div>
  );
}