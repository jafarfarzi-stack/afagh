'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import {
  DISCIPLINE_DECISIONS, DISCIPLINE_STATUSES, DISCIPLINE_VIOLATION_TYPES,
  disciplineQuery, statusBadgeClass, decisionBadgeClass,
  type DisciplineCaseRow, type DisciplineStudentHit, type DisciplineFilters,
} from '@/lib/discipline';

type Msg = { text: string; kind: 'ok' | 'error' } | null;

function pad2(n: number): string { return n < 10 ? `0${n}` : String(n); }

/** تاریخ میلادی → شمسی (ساده، بدون وابستگی — برای نمایش ستون تاریخ) */
function toJalali(iso: string | Date | null): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  // الگوریتم Jalaali (fa_IR) — دقت برای محدودهٔ کاربردی کافی است
  const gy = d.getFullYear(), gm = d.getMonth() + 1, gd = d.getDate();
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100)
    + Math.floor((gy2 + 399) / 400) - 80 + gd + g_d_m[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return `${jy}/${pad2(jm)}/${pad2(jd)}`;
}

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `خطا (${res.status})`);
  return data;
}

export default function DisciplineClient() {
  const [rows, setRows] = useState<DisciplineCaseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, startTransition] = useTransition();

  const [filters, setFilters] = useState<DisciplineFilters>({ q: '', status: '' });
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DisciplineCaseRow | null>(null);

  const load = useCallback(async (f: DisciplineFilters, p: number) => {
    setLoading(true);
    try {
      const qs = disciplineQuery({ ...f, page: p });
      const data = await api(`/api/admin/discipline?${qs}`);
      setRows(data.rows || []);
      setTotal(data.total || 0);
      setPage(data.page || p);
    } catch (e: any) {
      setMsg({ text: e.message, kind: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(filters, 1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applyFilters = () => startTransition(() => load(filters, 1));
  const onPage = (p: number) => startTransition(() => load(filters, p));

  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-slate-800">کمیته انضباطی</h1>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg"
        >
          ＋ پرونده جدید
        </button>
      </div>

      {msg && (
        <div className={`px-3 py-2 rounded-lg text-sm border ${msg.kind === 'ok'
          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
          : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
          {msg.text}
        </div>
      )}

      {/* فیلترها */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
        <label className="text-xs text-slate-500 space-y-1">
          <span className="block">جست‌وجو (نام/شماره)</span>
          <input
            value={filters.q || ''}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
            placeholder="نام یا شماره دانشجو…"
          />
        </label>
        <label className="text-xs text-slate-500 space-y-1">
          <span className="block">وضعیت</span>
          <select
            value={filters.status || ''}
            onChange={(e) => { setFilters({ ...filters, status: e.target.value }); startTransition(() => load({ ...filters, status: e.target.value }, 1)); }}
            className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white"
          >
            <option value="">همه</option>
            {DISCIPLINE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-500 space-y-1">
          <span className="block">از تاریخ</span>
          <input type="date" value={filters.dateFrom || ''}
            onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-slate-500 space-y-1">
          <span className="block">تا تاریخ</span>
          <input type="date" value={filters.dateTo || ''}
            onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
        </label>
        <button
          onClick={applyFilters}
          disabled={busy}
          className="bg-slate-700 hover:bg-slate-800 text-white text-sm px-4 py-1.5 rounded-lg disabled:opacity-50"
        >
          اعمال فیلتر
        </button>
      </div>

      {/* جدول */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm rt">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="p-2 text-right">#</th>
              <th className="p-2 text-right">دانشجو</th>
              <th className="p-2 text-right">شماره</th>
              <th className="p-2 text-right">نوع تخلف</th>
              <th className="p-2 text-right">تاریخ</th>
              <th className="p-2 text-right">وضعیت</th>
              <th className="p-2 text-right">تصمیم</th>
              <th className="p-2 text-right">اسناد</th>
              <th className="p-2 text-right">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="p-6 text-center text-slate-400">در حال بارگذاری…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="p-6 text-center text-slate-400">پرونده‌ای یافت نشد.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-2 text-slate-500">{r.id}</td>
                <td className="p-2 font-medium">{r.studentName}</td>
                <td className="p-2 font-mono text-xs">{r.studentCode}</td>
                <td className="p-2">{r.violationType}</td>
                <td className="p-2 text-xs">{toJalali(r.caseDate)}</td>
                <td className="p-2"><span className={`px-2 py-0.5 rounded-full text-xs ${statusBadgeClass(r.status)}`}>{r.status}</span></td>
                <td className="p-2">
                  {r.committeeDecision
                    ? <span className={`px-2 py-0.5 rounded-full text-xs ${decisionBadgeClass(r.committeeDecision)}`}>{r.committeeDecision}</span>
                    : <span className="text-slate-300 text-xs">—</span>}
                </td>
                <td className="p-2 text-center text-xs">{r.documentCount}</td>
                <td className="p-2 whitespace-nowrap">
                  <button
                    onClick={() => { setEditing(r); setShowForm(true); }}
                    className="text-blue-600 hover:underline text-xs ml-2"
                  >ویرایش</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* صفحه‌بندی */}
      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button disabled={page <= 1} onClick={() => onPage(page - 1)}
            className="px-3 py-1 border border-slate-300 rounded-lg disabled:opacity-40">قبلی</button>
          <span className="text-slate-600">صفحه {page} از {pageCount}</span>
          <button disabled={page >= pageCount} onClick={() => onPage(page + 1)}
            className="px-3 py-1 border border-slate-300 rounded-lg disabled:opacity-40">بعدی</button>
        </div>
      )}

      {showForm && (
        <CaseForm
          editing={editing}
          onClose={() => setShowForm(false)}
          onSaved={(m) => { setMsg({ text: m, kind: 'ok' }); setShowForm(false); startTransition(() => load(filters, page)); }}
        />
      )}
    </div>
  );
}

// ═══════════ فرم ایجاد/ویرایش (مودال) ═══════════

function CaseForm({ editing, onClose, onSaved }: {
  editing: DisciplineCaseRow | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [studentQuery, setStudentQuery] = useState(editing?.studentName || '');
  const [hits, setHits] = useState<DisciplineStudentHit[]>([]);
  const [picked, setPicked] = useState<DisciplineStudentHit | null>(
    editing ? { studentId: editing.studentId, studentCode: editing.studentCode, name: editing.studentName, entryYear: null } : null,
  );
  const [violationType, setViolationType] = useState(editing?.violationType || '');
  const [description, setDescription] = useState(editing?.description || '');
  const [reporterName, setReporterName] = useState(editing?.reporterName || '');
  const [caseDate, setCaseDate] = useState(() => {
    if (editing?.caseDate) return editing.caseDate.slice(0, 10);
    const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  });
  const [status, setStatus] = useState(editing?.status || DISCIPLINE_STATUSES[0]);
  const [decision, setDecision] = useState(editing?.committeeDecision || '');
  const [decisionNotes, setDecisionNotes] = useState(editing?.decisionNotes || '');
  const [busy, startTransition] = useTransition();
  const [err, setErr] = useState('');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchStudents = (q: string) => {
    setStudentQuery(q);
    setPicked(null);
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) { setHits([]); return; }
    debounce.current = setTimeout(async () => {
      try {
        const data = await api(`/api/admin/discipline?action=students&q=${encodeURIComponent(q.trim())}`);
        setHits(data.hits || []);
      } catch { setHits([]); }
    }, 300);
  };

  const save = () => startTransition(async () => {
    setErr('');
    try {
      if (editing) {
        await api(`/api/admin/discipline?id=${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status,
            committeeDecision: decision || null,
            decisionNotes: decisionNotes || null,
          }),
        });
        onSaved('پرونده به‌روزرسانی شد.');
      } else {
        if (!picked) { setErr('دانشجو را از لیست جست‌وجو انتخاب کنید.'); return; }
        if (!violationType.trim()) { setErr('نوع تخلف الزامی است.'); return; }
        await api('/api/admin/discipline', {
          method: 'POST',
          body: JSON.stringify({
            studentId: picked.studentId,
            violationType: violationType.trim(),
            description: description || null,
            reporterName: reporterName || null,
            caseDate,
          }),
        });
        onSaved('پرونده جدید ثبت شد.');
      }
    } catch (e: any) {
      setErr(e.message || 'خطا در ذخیره');
    }
  });

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-800">{editing ? `ویرایش پرونده #${editing.id}` : 'پرونده انضباطی جدید'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
        </div>

        {err && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{err}</div>}

        {!editing && (
          <div className="space-y-1">
            <label className="text-xs text-slate-500">دانشجو</label>
            <input
              value={picked ? `${picked.name} (${picked.studentCode})` : studentQuery}
              onChange={(e) => searchStudents(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              placeholder="نام یا شماره دانشجو… (حداقل ۲ حرف)"
            />
            {hits.length > 0 && !picked && (
              <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-slate-100">
                {hits.map((h) => (
                  <button key={h.studentId} type="button"
                    onClick={() => { setPicked(h); setHits([]); setStudentQuery(h.name); }}
                    className="w-full text-right px-3 py-2 text-sm hover:bg-blue-50">
                    {h.name} <span className="text-xs text-slate-400 font-mono">{h.studentCode}</span>
                    {h.entryYear ? <span className="text-xs text-slate-400"> — ورود {h.entryYear}</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <label className="block text-xs text-slate-500 space-y-1">
          <span className="block">نوع تخلف</span>
          <input list="violation-types" value={violationType} onChange={(e) => setViolationType(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="مثلاً تقلب در امتحان…" />
          <datalist id="violation-types">
            {DISCIPLINE_VIOLATION_TYPES.map((v) => <option key={v} value={v} />)}
          </datalist>
        </label>

        <label className="block text-xs text-slate-500 space-y-1">
          <span className="block">شرح تخلف</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-slate-500 space-y-1">
            <span className="block">گزارش‌دهنده</span>
            <input value={reporterName} onChange={(e) => setReporterName(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="block text-xs text-slate-500 space-y-1">
            <span className="block">تاریخ تخلف</span>
            <input type="date" value={caseDate} onChange={(e) => setCaseDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-slate-500 space-y-1">
            <span className="block">وضعیت</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
              {DISCIPLINE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="block text-xs text-slate-500 space-y-1">
            <span className="block">تصمیم کمیته</span>
            <select value={decision} onChange={(e) => setDecision(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">— بدون تصمیم —</option>
              {DISCIPLINE_DECISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
        </div>

        <label className="block text-xs text-slate-500 space-y-1">
          <span className="block">توضیحات تصمیم</span>
          <textarea value={decisionNotes} onChange={(e) => setDecisionNotes(e.target.value)} rows={2}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-600">انصراف</button>
          <button onClick={save} disabled={busy}
            className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
            {busy ? 'در حال ذخیره…' : 'ذخیره'}
          </button>
        </div>
      </div>
    </div>
  );
}
