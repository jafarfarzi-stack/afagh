'use client';

import { useCallback, useEffect, useState } from 'react';
import { addCodeAction, autoSuggestAction, confirmSuggestionsAction, saveMapAction } from './actions';
import { ImportReport, Msg, ReportBox, Stat, Uploader, fmt } from './ui';

type DomainDef = { id: string; title: string; hint: string };
type MapRow = {
  id: number; domain: string; legacyCode: string; legacyTitle: string | null;
  targetCode: string | null; targetTitle: string | null; confidence: string | null; status: string; note: string | null;
};
type Option = { id: number | null; code: string; title: string };
type Stats = { domain: string; title: string; total: number; confirmed: number; suggested: number; unmapped: number };

const STATUS_FA: Record<string, string> = {
  UNMAPPED: 'بدون تطبیق', SUGGESTED: 'پیشنهاد سامانه', CONFIRMED: 'تأییدشده', IGNORED: 'نادیده‌گرفته',
};
const STATUS_CLS: Record<string, string> = {
  UNMAPPED: 'bg-red-100 text-red-700', SUGGESTED: 'bg-amber-100 text-amber-800',
  CONFIRMED: 'bg-emerald-100 text-emerald-700', IGNORED: 'bg-slate-100 text-slate-500',
};

export default function CodeMapTab({ domains, sourceCode }: { domains: DomainDef[]; sourceCode: string }) {
  const [domain, setDomain] = useState(domains[0]?.id ?? 'MAJOR');
  const [maps, setMaps] = useState<MapRow[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [stats, setStats] = useState<Stats[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [report, setReport] = useState<(ImportReport & { error?: string }) | null>(null);
  const [busy, setBusy] = useState('');
  const [newCode, setNewCode] = useState({ legacyCode: '', legacyTitle: '' });

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/migration/codemaps?sourceCode=${encodeURIComponent(sourceCode)}&domain=${domain}`);
    if (!r.ok) { setMsg({ kind: 'err', text: 'خواندن نگاشت‌ها ناموفق بود.' }); return; }
    const j = await r.json();
    setMaps(j.maps ?? []); setOptions(j.options ?? []); setStats(j.stats ?? []);
  }, [domain, sourceCode]);

  useEffect(() => { load(); }, [load]);

  async function onSelect(row: MapRow, targetCode: string) {
    setMaps(m => m.map(x => x.id === row.id ? { ...x, targetCode: targetCode || null, status: targetCode ? 'CONFIRMED' : 'UNMAPPED' } : x));
    const res = await saveMapAction({ id: row.id, targetCode: targetCode || null });
    if (!res.ok) { setMsg({ kind: 'err', text: res.error ?? 'ذخیره نشد.' }); }
    load();
  }

  async function onIgnore(row: MapRow) {
    await saveMapAction({ id: row.id, targetCode: null, status: 'IGNORED' });
    load();
  }

  async function runAuto() {
    setBusy('auto');
    const r = await autoSuggestAction(sourceCode, domain as never);
    setBusy('');
    setMsg({ kind: 'ok', text: `پیشنهاد خودکار: ${fmt(r.confirmed)} مورد با اطمینان بالا تأیید شد، ${fmt(r.suggested)} پیشنهاد برای بازبینی، ${fmt(r.untouched)} بدون معادل.` });
    load();
  }

  async function confirmAll() {
    setBusy('confirm');
    const r = await confirmSuggestionsAction(sourceCode, domain as never, 0);
    setBusy('');
    setMsg({ kind: 'ok', text: `${fmt(r.confirmed)} پیشنهاد تأیید شد.` });
    load();
  }

  async function addCode() {
    if (!newCode.legacyCode.trim()) return;
    await addCodeAction({ sourceCode, domain: domain as never, ...newCode });
    setNewCode({ legacyCode: '', legacyTitle: '' });
    load();
  }

  const cur = domains.find(d => d.id === domain);
  const curStat = stats.find(s => s.domain === domain);
  const shown = maps.filter(m =>
    (filter === 'ALL' || m.status === filter) &&
    (!q.trim() || (m.legacyCode + ' ' + (m.legacyTitle ?? '') + ' ' + (m.targetTitle ?? '')).includes(q.trim())));

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div>
          <h3 className="font-bold">میز تطبیق کدها</h3>
          <p className="mt-1 text-xs leading-6 text-slate-500">
            سیستم قدیمی هر چیزی را با کد خودش می‌شناسد (رشتهٔ «۱۱۰۲»، مقطع «K»، ترم «۹۹۱»). اینجا هر کد قدیمی
            به موجودیت سامانهٔ جدید وصل می‌شود. موتور واردسازی نمرات، مالی و دانشجو از همین جدول می‌خواند —
            یک‌بار تطبیق، همه‌جا درست. کدهای دیده‌شده در فایل‌ها خودکار به این جدول اضافه می‌شوند.
          </p>
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          {stats.map(s => (
            <button key={s.domain} onClick={() => setDomain(s.domain)}
              className={'rounded-xl border p-2 text-right transition-colors ' + (s.domain === domain ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50')}>
              <p className="text-xs font-bold text-slate-700">{s.title}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                {fmt(s.total)} کد · <span className="text-emerald-600">{fmt(s.confirmed)} تأیید</span>
                {s.suggested > 0 && <> · <span className="text-amber-600">{fmt(s.suggested)} پیشنهاد</span></>}
                {s.unmapped > 0 && <> · <span className="text-red-600">{fmt(s.unmapped)} باز</span></>}
              </p>
            </button>
          ))}
        </div>

        <div className="grid gap-2 md:grid-cols-12 md:items-center">
          <select className="input md:col-span-3" value={domain} onChange={e => setDomain(e.target.value)}>
            {domains.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
          <select className="input md:col-span-2" value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="ALL">همه</option>
            <option value="UNMAPPED">بدون تطبیق</option>
            <option value="SUGGESTED">پیشنهاد سامانه</option>
            <option value="CONFIRMED">تأییدشده</option>
            <option value="IGNORED">نادیده‌گرفته</option>
          </select>
          <input className="input md:col-span-3" placeholder="جست‌وجو در کد یا عنوان…" value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn-ghost md:col-span-2" disabled={!!busy} onClick={runAuto}>{busy === 'auto' ? '…' : '✨ پیشنهاد خودکار'}</button>
          <button className="btn-primary md:col-span-2" disabled={!!busy} onClick={confirmAll}>{busy === 'confirm' ? '…' : '✓ تأیید همهٔ پیشنهادها'}</button>
        </div>

        {cur && <p className="text-[11px] text-slate-400">{cur.hint}{curStat ? ` — ${fmt(curStat.total)} کد در این دامنه` : ''}</p>}
        {msg && <Msg kind={msg.kind === 'ok' ? 'ok' : msg.kind === 'err' ? 'err' : 'info'}>{msg.text}</Msg>}
      </div>

      <div className="card space-y-3">
        <Uploader
          kind="codes" sourceCode={sourceCode} templateKind="codes" mappable
          label="واردسازی جدول تطبیق از اکسل"
          actions={[{ id: 'imp', title: 'واردسازی', url: '/api/admin/migration/import', primary: true }]}
          onDone={r => { setReport(r); load(); }}
        />
        <div className="flex flex-wrap gap-2">
          <a className="btn-ghost" href={`/api/admin/migration/export?kind=codes&sourceCode=${encodeURIComponent(sourceCode)}`}>⬇ خروجی اکسل همهٔ نگاشت‌ها</a>
          <a className="btn-ghost" href={`/api/admin/migration/export?kind=codes&sourceCode=${encodeURIComponent(sourceCode)}&domain=${domain}`}>⬇ خروجی همین دامنه</a>
        </div>
        <ReportBox report={report} />
      </div>

      <div className="card overflow-x-auto">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold">کدهای «{cur?.title}» ({fmt(shown.length)})</h3>
          <div className="ms-auto flex gap-2">
            <input className="input w-32 text-xs" placeholder="کد قدیمی" value={newCode.legacyCode} onChange={e => setNewCode(s => ({ ...s, legacyCode: e.target.value }))} />
            <input className="input w-40 text-xs" placeholder="عنوان قدیمی" value={newCode.legacyTitle} onChange={e => setNewCode(s => ({ ...s, legacyTitle: e.target.value }))} />
            <button className="btn-ghost text-xs" onClick={addCode}>+ افزودن</button>
          </div>
        </div>
        <table className="w-full text-right text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="p-2">کد قدیمی</th><th className="p-2">عنوان قدیمی</th>
              <th className="p-2">معادل در سامانهٔ جدید</th><th className="p-2">اطمینان</th>
              <th className="p-2">وضعیت</th><th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-slate-400">کدی برای نمایش نیست — یک فایل وارد کنید یا دستی اضافه کنید.</td></tr>}
            {shown.map(m => (
              <tr key={m.id} className="border-t border-slate-100">
                <td className="p-2 font-mono" dir="ltr">{m.legacyCode}</td>
                <td className="p-2">{m.legacyTitle}</td>
                <td className="p-2">
                  <select className="input py-1 text-xs" value={m.targetCode ?? ''} onChange={e => onSelect(m, e.target.value)}>
                    <option value="">— انتخاب کنید —</option>
                    {options.map(o => <option key={o.code} value={o.code}>{o.title} ({o.code})</option>)}
                  </select>
                </td>
                <td className="p-2 text-slate-500">{Number(m.confidence ?? 0) > 0 ? `${fmt(Math.round(Number(m.confidence)))}٪` : '—'}</td>
                <td className="p-2"><span className={'badge ' + (STATUS_CLS[m.status] ?? '')}>{STATUS_FA[m.status] ?? m.status}</span></td>
                <td className="p-2">
                  {m.status !== 'IGNORED' && <button className="text-[11px] text-slate-400 hover:text-red-600" onClick={() => onIgnore(m)}>نادیده بگیر</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <Stat label="کل کدهای این مبدأ" value={stats.reduce((s, x) => s + x.total, 0)} />
      </div>
    </div>
  );
}
