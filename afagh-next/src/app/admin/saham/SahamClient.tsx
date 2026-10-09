'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { SahamStat, SahamFilterLookups } from './page';

const FILL_ROWS: { key: keyof SahamStat['fill']; label: string; hint: string }[] = [
  { key: 'teachingMode', label: 'شیوه آموزش', hint: 'بک‌فیل از فایل قدیمی' },
  { key: 'studyType', label: 'نوع تحصیل', hint: 'از فایل قدیمی (COURSTYPE)' },
  { key: 'maritalStatus', label: 'وضعیت تاهل', hint: 'از فایل قدیمی (MARRIED)' },
  { key: 'birthProvince', label: 'استان محل تولد', hint: 'از placeOfBirth + جدول شهر' },
  { key: 'residenceProvince', label: 'استان محل سکونت', hint: 'از آدرس + جدول شهر' },
];

type Kind = 'students' | 'graduates' | 'instructors';

const KIND_TABS: { key: Kind; label: string; hint: string }[] = [
  { key: 'students', label: '🎓 دانشجویان (۵۲ ستون)', hint: 'همهٔ وضعیت‌ها؛ با فیلتر' },
  { key: 'graduates', label: '🎓 دانش‌آموختگان (۴۳ ستون)', hint: 'بازهٔ تاریخ فراغت + شیت نظام وظیفه' },
  { key: 'instructors', label: '👨‍🏫 آموزشگران (۳۷ ستون)', hint: 'اساتید دارای ارائه در نیمسال' },
];

const STATUS_FA: Record<string, string> = {
  ACTIVE: 'فعال', GRADUATED: 'دانش‌آموخته', WITHDRAWN: 'انصرافی', NO_SHOW: 'عدم مراجعه',
  TRANSFERRED: 'انتقالی', SUSPENDED: 'معلق', EXPELLED: 'اخراجی', UNKNOWN: 'نامشخص', DECEASED: 'فوت‌شده',
};

function qs(params: Record<string, string | number | undefined>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
}

export default function SahamClient({ stats, lookups }: { stats: SahamStat[]; lookups: SahamFilterLookups }) {
  const [kind, setKind] = useState<Kind>('students');
  const [status, setStatus] = useState('');
  const [majorId, setMajorId] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [entryFrom, setEntryFrom] = useState('');
  const [entryTo, setEntryTo] = useState('');
  const [gradFrom, setGradFrom] = useState('');
  const [gradTo, setGradTo] = useState('');
  const [termId, setTermId] = useState('');
  const [limit, setLimit] = useState('5000');
  const [busy, setBusy] = useState<number | null>(null);
  const [preview, setPreview] = useState<Record<number, number | null>>({});
  const [previewBusy, setPreviewBusy] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [warn, setWarn] = useState('');

  const majorsAll = lookups.majors;
  const facultiesAll = lookups.faculties;

  const buildParams = (id: number) => ({
    universityId: id,
    kind,
    status: kind === 'students' ? status || undefined : undefined,
    majorId: majorId || undefined,
    facultyId: facultyId || undefined,
    entryFrom: entryFrom || undefined,
    entryTo: entryTo || undefined,
    gradFrom: kind === 'graduates' ? gradFrom || undefined : undefined,
    gradTo: kind === 'graduates' ? gradTo || undefined : undefined,
    termId: kind === 'instructors' ? termId || undefined : undefined,
    limit: limit || undefined,
  });

  const doPreview = async (id: number) => {
    setPreviewBusy(id);
    setErr('');
    try {
      const res = await fetch(`/api/admin/saham/students?${qs({ ...buildParams(id), preview: 1 })}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'خطا');
      setPreview(p => ({ ...p, [id]: body.total }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'خطای نامشخص');
    } finally {
      setPreviewBusy(null);
    }
  };

  const download = async (id: number) => {
    setBusy(id);
    setErr('');
    setWarn('');
    try {
      const res = await fetch(`/api/admin/saham/students?${qs(buildParams(id))}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'خطای نامشخص' }));
        throw new Error(body.error || 'ساخت فایل ناموفق بود.');
      }
      if (res.headers.get('x-has-more') === '1') {
        setWarn(`⚠️ خروجی به ${Number(res.headers.get('x-row-count')).toLocaleString('fa-IR')} ردیف محدود شد از مجموع ${Number(res.headers.get('x-row-total')).toLocaleString('fa-IR')} — فیلتر را تنگ‌تر کنید یا در چند نوبت دانلود بگیرید.`);
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

  const kindCount = (s: SahamStat) => kind === 'graduates' ? s.graduates : kind === 'instructors' ? s.instructors : s.students;

  return (
    <div className="space-y-3">
      {err && (
        <div className="rounded-xl border border-red-300 bg-red-50/70 p-3 text-xs font-bold text-red-800">
          ❌ {err.length > 500 ? err.slice(0, 500) + '…' : err}
        </div>
      )}
      {warn && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-xs font-bold text-amber-800">
          {warn}
        </div>
      )}

      {/* تب نوع گزارش */}
      <div className="card !p-3">
        <div className="flex flex-wrap gap-2">
          {KIND_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => { setKind(t.key); setPreview({}); setErr(''); setWarn(''); }}
              title={t.hint}
              className={`rounded-xl px-4 py-2 text-xs font-black transition ${kind === t.key ? 'bg-indigo-700 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* فیلترها */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {kind === 'students' && (
            <label className="text-[11px] text-slate-600">وضعیت تحصیلی
              <select value={status} onChange={e => setStatus(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-xs">
                <option value="">همهٔ وضعیت‌ها</option>
                {[...new Set(lookups.statuses.map(s => s.status))].map(st => (
                  <option key={st} value={st}>{STATUS_FA[st] ?? st}</option>
                ))}
              </select>
            </label>
          )}
          {kind !== 'instructors' && (
            <>
              <label className="text-[11px] text-slate-600">رشته
                <select value={majorId} onChange={e => setMajorId(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-xs">
                  <option value="">همهٔ رشته‌ها</option>
                  {majorsAll.slice(0, 500).map(mj => (
                    <option key={mj.id} value={mj.id}>{mj.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] text-slate-600">دانشکده
                <select value={facultyId} onChange={e => setFacultyId(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-xs">
                  <option value="">همهٔ دانشکده‌ها</option>
                  {facultiesAll.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] text-slate-600">ورودی از (سال)
                <input value={entryFrom} onChange={e => setEntryFrom(e.target.value)} placeholder="۱۴۰۰" inputMode="numeric" className="mt-1 w-full rounded border px-2 py-1.5 text-xs" />
              </label>
              <label className="text-[11px] text-slate-600">ورودی تا (سال)
                <input value={entryTo} onChange={e => setEntryTo(e.target.value)} placeholder="۱۴۰۴" inputMode="numeric" className="mt-1 w-full rounded border px-2 py-1.5 text-xs" />
              </label>
            </>
          )}
          {kind === 'graduates' && (
            <>
              <label className="text-[11px] text-slate-600">فراغت از (۱۴۰۳/۰۱/۰۱)
                <input value={gradFrom} onChange={e => setGradFrom(e.target.value)} placeholder="1403/01/01" className="mt-1 w-full rounded border px-2 py-1.5 text-xs font-mono" dir="ltr" />
              </label>
              <label className="text-[11px] text-slate-600">فراغت تا (۱۴۰۴/۱۲/۲۹)
                <input value={gradTo} onChange={e => setGradTo(e.target.value)} placeholder="1404/12/29" className="mt-1 w-full rounded border px-2 py-1.5 text-xs font-mono" dir="ltr" />
              </label>
            </>
          )}
          {kind === 'instructors' && (
            <label className="text-[11px] text-slate-600 col-span-2">نیمسال (فقط اساتید دارای ارائه)
              <select value={termId} onChange={e => setTermId(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-xs">
                <option value="">— انتخاب نیمسال —</option>
                {lookups.terms.map(t => (
                  <option key={t.id} value={t.id}>{t.title}{t.isCurrent ? ' (جاری)' : ''}</option>
                ))}
              </select>
            </label>
          )}
          <label className="text-[11px] text-slate-600">سقف ردیف
            <select value={limit} onChange={e => setLimit(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-xs font-mono" dir="ltr">
              <option value="1000">1,000</option>
              <option value="5000">5,000</option>
              <option value="10000">10,000</option>
              <option value="20000">20,000</option>
            </select>
          </label>
        </div>
      </div>

      <div className="card !p-0 overflow-hidden">
        <table className="w-full text-right text-xs">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-2.5">دانشگاه / مؤسسه</th>
              <th className="p-2.5">کد سهام</th>
              <th className="p-2.5">تعداد ({kind === 'graduates' ? 'آموخته' : kind === 'instructors' ? 'آموزشگر' : 'دانشجو'})</th>
              {FILL_ROWS.map(f => <th key={f.key} className="p-2.5 whitespace-nowrap">{f.label}</th>)}
              <th className="p-2.5">خروجی</th>
            </tr>
          </thead>
          <tbody>
            {stats.map(s => {
              const noCode = s.sahamCodeCount === 0;
              const pv = preview[s.universityId];
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
                  <td className="p-2.5 font-bold">
                    {kindCount(s).toLocaleString('fa-IR')}
                    {pv != null && <div className="text-[10px] font-normal text-emerald-700">فیلتر: {pv.toLocaleString('fa-IR')}</div>}
                  </td>
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
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => doPreview(s.universityId)}
                        disabled={previewBusy === s.universityId}
                        title="شمارش رکوردهای مطابق فیلتر، بدون ساخت فایل"
                        className="rounded border border-slate-300 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                      >
                        {previewBusy === s.universityId ? '…' : '🔍 تعداد'}
                      </button>
                      <button
                        onClick={() => download(s.universityId)}
                        disabled={busy === s.universityId || kindCount(s) === 0}
                        className="rounded bg-indigo-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-800 disabled:opacity-40"
                      >
                        {busy === s.universityId ? '⏳ در حال ساخت…' : '⬇️ دانلود اکسل'}
                      </button>
                    </div>
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
          <li>شمارهٔ ملی تکراری یا خالی = حذف کل رکورد در سامانهٔ سهام.</li>
          <li>اگر تعداد از سقف بیشتر شد، فیلتر را تنگ‌تر کنید (وضعیت/رشته/ورودی) و در چند نوبت دانلود بگیرید.</li>
        </ul>
        <div className="mt-2 flex flex-wrap gap-3">
          <Link href="/admin/migration" className="font-bold text-indigo-700 underline">تکمیل کدها و نگاشت‌ها</Link>
          <Link href="/admin/students" className="font-bold text-indigo-700 underline">پروندهٔ دانشجویان</Link>
        </div>
      </div>
    </div>
  );
}
