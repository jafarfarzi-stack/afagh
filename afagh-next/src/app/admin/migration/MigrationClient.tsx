'use client';

import { useEffect, useState } from 'react';
import BatchesTab from './BatchesTab';
import CodeMapTab from './CodeMapTab';
import GradesTab from './GradesTab';
import TuitionTab from './TuitionTab';
import { ImportReport, Msg, ReportBox, Uploader, fmt } from './ui';

type Entity = { id: string; title: string; sample: string };
type DomainDef = { id: string; title: string; hint: string };
type Run = { id: number; entity: string; fileName: string; mode: string; status: string; total: number; inserted: number; existing: number; invalid: number; at: string | null };

const MODE_FA: Record<string, string> = { DRY: 'تحلیل', COMMIT: 'ثبت', IMPORT: 'واردسازی' };

export default function MigrationClient(props: {
  entities: Entity[];
  domains: DomainDef[];
  sources: { code: string; title: string }[];
  formulas: React.ComponentProps<typeof TuitionTab>['formulas'];
  compareRuns: React.ComponentProps<typeof TuitionTab>['runs'];
  financialCount: number;
  gradeStats: { status: string; count: number }[];
}) {
  const [tab, setTab] = useState<'core' | 'codes' | 'tuition' | 'grades' | 'batches' | 'history'>('core');
  const [sourceCode, setSourceCode] = useState(props.sources[0]?.code ?? 'LEGACY');

  const tabs = [
    { id: 'core', title: '📦 دادهٔ پایه' },
    { id: 'codes', title: '🔗 تطبیق کدها' },
    { id: 'tuition', title: '💰 شهریه و مالی' },
    { id: 'grades', title: '🎯 نمرات' },
    { id: 'batches', title: '↩ ناحیهٔ موقت و واگرد' },
    { id: 'history', title: '🕘 تاریخچه' },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={'rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ' +
                (tab === t.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
              {t.title}
            </button>
          ))}
        </div>
        <div className="ms-auto flex items-center gap-2">
          <label className="text-[11px] text-slate-500">سرور مبدأ:</label>
          <input className="input w-40 py-1 text-xs" dir="ltr" value={sourceCode}
            onChange={e => setSourceCode(e.target.value.toUpperCase())} list="afagh-sources" />
          <datalist id="afagh-sources">
            {props.sources.map(s => <option key={s.code} value={s.code}>{s.title}</option>)}
          </datalist>
        </div>
      </div>

      {tab === 'core' && <CoreTab entities={props.entities} sourceCode={sourceCode} />}
      {tab === 'codes' && <CodeMapTab domains={props.domains} sourceCode={sourceCode} />}
      {tab === 'tuition' && <TuitionTab sourceCode={sourceCode} formulas={props.formulas} runs={props.compareRuns} financialCount={props.financialCount} />}
      {tab === 'grades' && <GradesTab sourceCode={sourceCode} stats={props.gradeStats} />}
      {tab === 'batches' && <BatchesTab sourceCode={sourceCode} />}
      {tab === 'history' && <HistoryTab />}
    </div>
  );
}

function CoreTab({ entities, sourceCode }: { entities: Entity[]; sourceCode: string }) {
  const [entity, setEntity] = useState(entities[0]?.id ?? 'student');
  const [report, setReport] = useState<(ImportReport & { error?: string; willInsert?: number; existing?: number }) | null>(null);
  const cur = entities.find(e => e.id === entity);

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div>
          <h3 className="font-bold">دادهٔ پایه: دانشجو، درس، ترم، ثبت‌نام و مالی</h3>
          <p className="mt-1 text-xs leading-6 text-slate-500">
            فایل <b>اکسل (xlsx)</b> یا CSV خروجی سیستم قدیمی را انتخاب کنید. اول <b>تحلیل اولیه</b> بگیرید
            (چیزی نوشته نمی‌شود)، پس از رفع خطاها <b>ثبت نهایی</b>. تکرار بی‌خطر است؛ ردیف‌های موجود دوباره ثبت نمی‌شوند.
            ترتیب پیشنهادی: دانشجویان ← دروس ← ترم‌ها ← نمرات ← مالی.
          </p>
        </div>
        <div className="grid gap-2 md:grid-cols-12 md:items-center">
          <select className="input md:col-span-3" value={entity} onChange={e => { setEntity(e.target.value); setReport(null); }}>
            {entities.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
          <div className="md:col-span-9">
            <Uploader
              kind={entity} sourceCode={sourceCode} templateKind={entity} label=""
              actions={[
                { id: 'dry', title: 'تحلیل اولیه', url: '/api/admin/migration/dry-run', extra: { entity } },
                { id: 'commit', title: 'ثبت نهایی', url: '/api/admin/migration/commit', primary: true, extra: { entity } },
              ]}
              onDone={r => setReport(r)}
            />
          </div>
        </div>
        {cur && <p className="text-[11px] text-slate-400">ستون‌های نمونه: <span dir="ltr">{cur.sample}</span></p>}
      </div>

      {report && !report.error && (
        <div className="card space-y-2">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <div className="rounded-xl bg-slate-50 p-2 text-center"><p className="text-xl font-bold text-slate-700">{fmt(report.total)}</p><p className="text-[11px] text-slate-500">ردیف فایل</p></div>
            <div className="rounded-xl bg-slate-50 p-2 text-center"><p className="text-xl font-bold text-emerald-600">{fmt(report.willInsert ?? 0)}</p><p className="text-[11px] text-slate-500">ثبت‌شده / ثبت‌خواهدشد</p></div>
            <div className="rounded-xl bg-slate-50 p-2 text-center"><p className="text-xl font-bold text-slate-400">{fmt(report.existing ?? 0)}</p><p className="text-[11px] text-slate-500">موجود (نادیده)</p></div>
            <div className="rounded-xl bg-slate-50 p-2 text-center"><p className="text-xl font-bold text-red-600">{fmt(report.invalid)}</p><p className="text-[11px] text-slate-500">نامعتبر</p></div>
            <div className="rounded-xl bg-slate-50 p-2 text-center"><p className="text-xl font-bold text-amber-500">{fmt(report.warnings?.length ?? 0)}</p><p className="text-[11px] text-slate-500">هشدار</p></div>
          </div>
          {report.errors?.length > 0 && (
            <Msg kind="err">
              <p className="mb-1 font-bold">خطاها:</p>
              {report.errors.slice(0, 8).map((e, i) => <p key={i}>{e.row ? `خط ${e.row}: ` : ''}{e.msg}</p>)}
            </Msg>
          )}
          {report.warnings?.length > 0 && (
            <Msg kind="warn">
              <p className="mb-1 font-bold">هشدارها:</p>
              {report.warnings.slice(0, 6).map((w, i) => <p key={i}>{w.row ? `خط ${w.row}: ` : ''}{w.msg}</p>)}
            </Msg>
          )}
        </div>
      )}
      {report?.error && <div className="card"><ReportBox report={report} /></div>}
    </div>
  );
}

function HistoryTab() {
  const [runs, setRuns] = useState<Run[]>([]);
  useEffect(() => { fetch('/api/admin/migration/runs').then(r => r.ok ? r.json() : []).then(setRuns).catch(() => {}); }, []);
  return (
    <div className="card overflow-x-auto">
      <h3 className="mb-2 text-sm font-bold">تاریخچهٔ عملیات مهاجرت</h3>
      <table className="w-full text-right text-xs">
        <thead><tr className="text-slate-500"><th className="p-2">#</th><th className="p-2">نوع</th><th className="p-2">فایل</th><th className="p-2">حالت</th><th className="p-2">ردیف</th><th className="p-2">ثبت</th><th className="p-2">موجود/به‌روز</th><th className="p-2">نامعتبر</th><th className="p-2">زمان</th></tr></thead>
        <tbody>
          {runs.length === 0 && <tr><td colSpan={9} className="p-4 text-center text-slate-400">هنوز عملیاتی اجرا نشده.</td></tr>}
          {runs.map(r => (
            <tr key={r.id} className="border-t border-slate-100">
              <td className="p-2 font-mono">{r.id}</td>
              <td className="p-2">{r.entity}</td>
              <td className="p-2" dir="ltr">{r.fileName}</td>
              <td className="p-2"><span className={'badge ' + (r.mode === 'COMMIT' ? 'bg-indigo-100 text-indigo-800' : r.mode === 'IMPORT' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600')}>{MODE_FA[r.mode] ?? r.mode}</span></td>
              <td className="p-2">{fmt(r.total)}</td>
              <td className="p-2 font-bold text-emerald-700">{fmt(r.inserted)}</td>
              <td className="p-2 text-slate-400">{fmt(r.existing)}</td>
              <td className="p-2 text-red-600">{fmt(r.invalid)}</td>
              <td className="p-2 text-slate-500" dir="ltr">{r.at ? new Date(r.at).toLocaleString('fa-IR') : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
