'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getTermOfferings,
  previewBroadcastCount,
  sendBroadcast,
  type BroadcastAudience,
  type BroadcastFilters,
  type TermOffering,
} from './actions';
import type { Channel } from '@/lib/messaging';

const CHANNELS: { key: Channel; label: string }[] = [
  { key: 'INAPP', label: '📥 داخل پورتال' },
  { key: 'SMS', label: '📲 پیامک' },
  { key: 'SOROUSH', label: '🟣 سروش' },
  { key: 'BALE', label: '🟢 بله' },
  { key: 'EITAA', label: '🟠 ایتا' },
];

const ROLE_FA = { student: 'دانشجویان', staff: 'اساتید و کارکنان' } as const;

export default function BroadcastClient({ filters }: { filters: BroadcastFilters }) {
  const [role, setRole] = useState<'student' | 'staff' | 'both'>('student');
  const [facultyId, setFacultyId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [majorId, setMajorId] = useState('');
  const [entryYear, setEntryYear] = useState('');
  const [termId, setTermId] = useState(() => filters.terms.find(t => t.isCurrent === 1)?.id?.toString() ?? '');
  const [offeringId, setOfferingId] = useState('');
  const [offerings, setOfferings] = useState<TermOffering[]>([]);
  const [loadingOfferings, setLoadingOfferings] = useState(false);
  const [activeOnly, setActiveOnly] = useState(true);
  const [channels, setChannels] = useState<Channel[]>(['INAPP']);
  const [text, setText] = useState('');
  const [count, setCount] = useState<{ count: number; capped: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const departments = useMemo(
    () => filters.departments.filter(d => !facultyId || d.facultyId === Number(facultyId)),
    [filters.departments, facultyId],
  );
  const majors = useMemo(
    () => filters.majors.filter(m => !departmentId || m.departmentId === Number(departmentId)),
    [filters.majors, departmentId],
  );

  const audience = (): BroadcastAudience => ({
    role,
    facultyId: facultyId ? Number(facultyId) : null,
    departmentId: departmentId ? Number(departmentId) : null,
    majorId: majorId ? Number(majorId) : null,
    entryYear: entryYear ? Number(entryYear) : null,
    termId: termId ? Number(termId) : null,
    offeringId: offeringId ? Number(offeringId) : null,
    activeOnly,
  });

  const loadOfferings = async (tid: string) => {
    setOfferingId('');
    setOfferings([]);
    if (!tid) return;
    setLoadingOfferings(true);
    try {
      setOfferings(await getTermOfferings(Number(tid)));
    } catch {
      setOfferings([]);
    } finally {
      setLoadingOfferings(false);
    }
  };

  // ترم جاری از اول انتخاب است — پس کلاس‌هایش را همان اول بارگذاری کن.
  // (بدون این، فهرست تا «تغییر دستی ترم» همیشه خالی می‌ماند و «۰ کلاس» نشان می‌دهد.)
  useEffect(() => {
    if (termId) loadOfferings(termId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const preview = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await previewBroadcastCount(audience());
      if (r.ok) setCount({ count: r.count, capped: r.capped });
      else setResult(`⛔ ${r.error}`);
    } catch {
      setResult('⛔ خطا در ارتباط با سرور.');
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!text.trim()) {
      setResult('⛔ اول متن پیام را بنویسید.');
      return;
    }
    const ok = window.confirm(
      `پیام به ${count ? count.count.toLocaleString('fa-IR') + ' نفر' : 'مخاطبان فیلترشده'} ارسال شود؟ این عمل قابل بازگشت نیست.`,
    );
    if (!ok) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await sendBroadcast(audience(), channels, text.trim());
      if (r.ok) {
        setResult(`✅ ارسال شد: ${r.sent.toLocaleString('fa-IR')} موفق، ${r.failed.toLocaleString('fa-IR')} ناموفق از ${r.total.toLocaleString('fa-IR')} نفر.`);
      } else {
        setResult(`⛔ ${r.error}`);
      }
    } catch {
      setResult('⛔ خطا در ارتباط با سرور.');
    } finally {
      setBusy(false);
    }
  };

  const toggleChannel = (c: Channel) =>
    setChannels(prev => (prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]));

  const sel = 'w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white';

  return (
    <div className="space-y-4" dir="rtl">
      {/* ── مخاطب ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <h3 className="font-black text-sm text-slate-900">۱️⃣ مخاطبان</h3>
        <div className="flex flex-wrap gap-2">
          {(['student', 'staff', 'both'] as const).map(r => (
            <button
              key={r}
              onClick={() => { setRole(r); setCount(null); }}
              className={`px-4 py-2 rounded-xl text-sm font-black transition ${
                role === r ? 'bg-indigo-700 text-white shadow' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {r === 'both' ? 'دانشجویان + اساتید' : ROLE_FA[r]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <label className="text-xs font-bold text-slate-600">دانشکده
            <select value={facultyId} onChange={e => { setFacultyId(e.target.value); setDepartmentId(''); setMajorId(''); setCount(null); }} className={sel + ' mt-1'}>
              <option value="">همهٔ دانشکده‌ها</option>
              {filters.faculties.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
          {(role === 'student' || role === 'both') && (
            <>
              <label className="text-xs font-bold text-slate-600">گروه آموزشی
                <select value={departmentId} onChange={e => { setDepartmentId(e.target.value); setMajorId(''); setCount(null); }} className={sel + ' mt-1'}>
                  <option value="">همهٔ گروه‌ها</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-600">رشته
                <select value={majorId} onChange={e => { setMajorId(e.target.value); setCount(null); }} className={sel + ' mt-1'}>
                  <option value="">همهٔ رشته‌ها</option>
                  {majors.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-600">ورودی
                <select value={entryYear} onChange={e => { setEntryYear(e.target.value); setCount(null); }} className={sel + ' mt-1'}>
                  <option value="">همهٔ ورودی‌ها</option>
                  {filters.entryYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
            </>
          )}
          {role === 'staff' && (
            <label className="text-xs font-bold text-slate-600">گروه آموزشی (استاد)
              <select value={departmentId} onChange={e => { setDepartmentId(e.target.value); setCount(null); }} className={sel + ' mt-1'}>
                <option value="">همهٔ گروه‌ها</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <input type="checkbox" checked={activeOnly} onChange={e => { setActiveOnly(e.target.checked); setCount(null); }} className="w-4 h-4" />
          فقط فعال‌ها (دانشجوی در حال تحصیل / پروندهٔ پرسنلی فعال)
        </label>
        {/* ── فیلتر کلاس درس در ترم ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 p-2.5">
          <label className="text-xs font-bold text-slate-600">🎓 ترم (برای انتخاب کلاس)
            <select
              value={termId}
              onChange={e => { setTermId(e.target.value); setCount(null); loadOfferings(e.target.value); }}
              className={sel + ' mt-1'}
            >
              <option value="">— بدون فیلتر ترم —</option>
              {filters.terms.map(t => (
                <option key={t.id} value={t.id}>{t.title}{t.isCurrent === 1 ? ' (جاری)' : ''}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600">
            🏫 کلاس درس {offeringId ? `(فقط ثبت‌نام‌شدگان${role !== 'student' ? ' و استاد' : ''} همین کلاس)` : '(اول ترم را انتخاب کنید)'}
            <select
              value={offeringId}
              disabled={!termId || loadingOfferings}
              onChange={e => { setOfferingId(e.target.value); setCount(null); }}
              className={sel + ' mt-1'}
            >
              <option value="">{loadingOfferings ? 'در حال بارگذاری کلاس‌ها…' : `همهٔ کلاس‌ها (${offerings.length.toLocaleString('fa-IR')})`}</option>
              {offerings.map(o => (
                <option key={o.id} value={o.id}>{o.label} ({o.enrolled.toLocaleString('fa-IR')} نفر)</option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={preview} disabled={busy} className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-black text-white hover:bg-slate-900 disabled:opacity-60">
            {busy ? '…' : '🔍 شمارش مخاطبان'}
          </button>
          {count && (
            <span className="text-xs font-black text-indigo-800">
              {count.count.toLocaleString('fa-IR')} نفر
              {count.capped ? ' (سقف ۵٬۰۰۰ — فیلتر را محدودتر کنید)' : ''}
            </span>
          )}
        </div>
      </div>

      {/* ── کانال + متن ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <h3 className="font-black text-sm text-slate-900">۲️⃣ کانال و متن پیام</h3>
        <div className="flex flex-wrap gap-2">
          {CHANNELS.map(c => (
            <button
              key={c.key}
              onClick={() => toggleChannel(c.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition border ${
                channels.includes(c.key)
                  ? 'bg-indigo-700 text-white border-indigo-700'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        {channels.includes('SMS') && (
          <p className="text-[11px] font-bold text-amber-700">⚠️ پیامک هزینه دارد — تعداد مخاطبان را حتماً اول بشمارید.</p>
        )}
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="متن پیام همگانی… (حداکثر ۲۰۰۰ نویسه)"
          className="w-full border border-slate-300 rounded-2xl p-3 text-sm leading-7 focus:border-indigo-600"
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-500">{text.length.toLocaleString('fa-IR')} / ۲۰۰۰ نویسه</span>
          <button onClick={send} disabled={busy} className="rounded-xl bg-indigo-700 px-6 py-2.5 text-sm font-black text-white hover:bg-indigo-800 disabled:opacity-60">
            {busy ? 'در حال ارسال…' : '🚀 ارسال همگانی'}
          </button>
        </div>
      </div>

      {result && (
        <div className="rounded-2xl border p-4 text-xs font-black leading-7 bg-slate-50 border-slate-200 text-slate-800">
          {result}
        </div>
      )}
    </div>
  );
}
