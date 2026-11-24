'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import PrintButton from '@/components/PrintButton';

/**
 * نوار کنترل «صدور لیست حضور و غیاب» — سمت کلاینت تا جستجو/فیلتر بلافاصله باشد:
 *  · جستجوی درس (کد/عنوان) و استاد (کد/نام) با نرمال‌سازی فارسی
 *  · فیلتر دانشکده و گروه آموزشی
 *  · چک‌باکس «عکسدار»: تیک = چاپ لیست همراه عکس، بدون تیک = ماتریس جلسات
 * ناوبری با router.push — همهٔ وضعیت در URL می‌ماند تا چاپ/اشتراک درست باشد.
 */

export type PickerTerm = { id: number; title: string; isCurrent: number | null };
export type PickerOffering = {
  id: number;
  displayTitle: string;
  codes: string;
  groupNumber: number | null;
  faculty: string;
  department: string;
  profs: string;
  profCodes: string;
  mergedCount: number;
};

/** نرمال‌سازی متن فارسی برای جستجو — ی/ك عربی، نیم‌فاصله، ارقام فارسی/عربی */
function normFa(s: string): string {
  return (s ?? '')
    .replace(/[يﻱﻲ]/g, 'ی')
    .replace(/[كﻙﻚ]/g, 'ک')
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/‌/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export default function AttendanceControls({
  terms,
  offerings,
  selectedTerm,
  selectedCid,
  photos,
  sortKey,
}: {
  terms: PickerTerm[];
  offerings: PickerOffering[];
  selectedTerm: number | null;
  selectedCid: number | null;
  photos: boolean;
  sortKey: 'name' | 'code' | 'row';
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [prof, setProf] = useState('');
  const [faculty, setFaculty] = useState('');
  const [dept, setDept] = useState('');

  const go = (cid: number | null, newPhotos: boolean, termId: number | null, newSort: string) => {
    const params = new URLSearchParams();
    if (termId) params.set('term', String(termId));
    if (cid) params.set('cid', String(cid));
    if (newPhotos) params.set('photos', '1');
    if (newSort && newSort !== 'name') params.set('sort', newSort);
    // جستجو/فیلتر بعد از هر پیمایش ریست می‌شود تا «لیست قبلی» باقی نماند
    setQ(''); setProf(''); setFaculty(''); setDept('');
    router.push(`/admin/attendance-list?${params.toString()}`);
  };

  const facultyOpts = useMemo(
    () => [...new Set(offerings.map(o => o.faculty).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fa')),
    [offerings],
  );
  const deptOpts = useMemo(
    () => [...new Set(offerings.filter(o => !faculty || o.faculty === faculty).map(o => o.department).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'fa')),
    [offerings, faculty],
  );

  const filtered = useMemo(() => {
    const nq = normFa(q);
    const np = normFa(prof);
    return offerings.filter(o => {
      if (faculty && o.faculty !== faculty) return false;
      if (dept && o.department !== dept) return false;
      if (nq && !(normFa(o.displayTitle).includes(nq) || normFa(o.codes).includes(nq))) return false;
      if (np && !(normFa(o.profCodes).includes(np) || normFa(o.profs).includes(np))) return false;
      return true;
    });
  }, [offerings, faculty, dept, q, prof]);

  const filtersActive = q !== '' || prof !== '' || faculty !== '' || dept !== '';

  return (
    <div className="card p-4 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-sm font-black text-slate-900 sm:text-base">صدور لیست حضور و غیاب</h1>
          <p className="mt-0.5 text-2xs font-bold text-slate-500">
            جستجوی درس/استاد، انتخاب کلاس و چاپ — کلاس‌های ادغامی یک لیست مشترک می‌گیرند
          </p>
        </div>
        <PrintButton />
      </div>

      {/* ترم + چک‌باکس عکسدار */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
          نیمسال
          <select
            value={selectedTerm ?? ''}
            onChange={e => go(selectedCid, photos, Number(e.target.value) || null, sortKey)}
            className="border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
          >
            {terms.map(t => (
              <option key={t.id} value={t.id}>{t.title}{t.isCurrent === 1 ? ' (جاری)' : ''}</option>
            ))}
          </select>
        </label>
        <label
          title="تیک: چاپ لیست همراه عکس دانشجویان — بدون تیک: ماتریس جلسات"
          className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-900 hover:bg-slate-50"
        >
          <input
            type="checkbox"
            checked={photos}
            onChange={e => go(selectedCid, e.target.checked, selectedTerm, sortKey)}
            className="h-4 w-4 accent-slate-900"
          />
          عکسدار
        </label>
        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
          مرتب‌سازی
          <select
            value={sortKey}
            onChange={e => go(selectedCid, photos, selectedTerm, e.target.value)}
            className="border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
          >
            <option value="name">نام خانوادگی</option>
            <option value="code">شماره دانشجویی</option>
            <option value="row">ترتیب ثبت‌نام</option>
          </select>
        </label>
        {filtersActive && (
          <button
            type="button"
            onClick={() => { setQ(''); setProf(''); setFaculty(''); setDept(''); }}
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            پاک‌کردن فیلترها
          </button>
        )}
      </div>

      {/* جستجو و فیلترها */}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="جستجوی درس — کد یا عنوان"
          className="border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
        />
        <input
          type="search"
          value={prof}
          onChange={e => setProf(e.target.value)}
          placeholder="استاد — کد یا نام"
          className="border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
        />
        <select
          value={faculty}
          onChange={e => { setFaculty(e.target.value); setDept(''); }}
          className="border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
        >
          <option value="">همهٔ دانشکده‌ها</option>
          {facultyOpts.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select
          value={dept}
          onChange={e => setDept(e.target.value)}
          className="border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
        >
          <option value="">همهٔ گروه‌های آموزشی</option>
          {deptOpts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* فهرست کلاس‌ها — انتخاب با کلیک */}
      <div className="mt-3 rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-72 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-xs font-bold text-slate-500">کلاسی با این جستجو/فیلتر پیدا نشد.</div>
        ) : filtered.map(o => (
          <button
            key={o.id}
            type="button"
            onClick={() => go(o.id, photos, selectedTerm, sortKey)}
            className={`block w-full text-right px-3 py-2 transition ${o.id === selectedCid ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black">{o.displayTitle}</span>
              {o.mergedCount > 1 && (
                <span className={`rounded px-1.5 py-0.5 text-2xs font-black ${o.id === selectedCid ? 'bg-white/20' : 'bg-amber-100 text-amber-800'}`}>
                  ادغامی × {o.mergedCount}
                </span>
              )}
              {o.groupNumber != null && <span className={`text-2xs font-bold ${o.id === selectedCid ? 'text-slate-200' : 'text-slate-500'}`}>گروه {o.groupNumber}</span>}
            </span>
            <span className={`mt-0.5 block text-2xs font-bold ${o.id === selectedCid ? 'text-slate-200' : 'text-slate-500'}`}>
              {[o.codes, o.department, o.faculty, o.profs ? `استاد: ${o.profs}` : '', o.profCodes ? `(${o.profCodes})` : ''].filter(Boolean).join(' — ')}
            </span>
          </button>
        ))}
        {filtered.length > 0 && (
          <div className="px-3 py-1.5 text-2xs font-bold text-slate-400">{filtered.length} کلاس</div>
        )}
      </div>
    </div>
  );
}
