'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  bulkSetOfferingEduExpertAction,
  clearTermEduExpertAction,
  setOfferingEduExpertAction,
  type EduExpertAssignInit,
} from './actions';

type Row = EduExpertAssignInit['rows'][number];

const SOURCE_LABEL: Record<string, string> = {
  offering: 'تخصیص کلاس',
  scope: 'از نقش‌ها',
  none: '—',
};

export default function EduExpertAssignClient({ init }: { init: EduExpertAssignInit }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [termId, setTermId] = useState(
    () => init.terms.find((t) => t.isCurrent)?.id ?? init.terms[init.terms.length - 1]?.id ?? 0,
  );
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkExpert, setBulkExpert] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [query, setQuery] = useState('');
  /* پیش‌فرض: فقط درس‌هایی که واقعاً کلاس/اتاق دارند. در دادهٔ واقعی حدودِ ۸۰٪
     درس‌های یک ترم هنوز هیچ سانس/اتاقی ندارند و فقط جدول را شلوغ می‌کنند؛ با
     برداشتنِ تیک، همهٔ درس‌های ترم برمی‌گردند (برای تخصیصِ پیش از برنامه‌ریزی). */
  const [scheduledOnly, setScheduledOnly] = useState(true);

  const rows = useMemo(() => {
    const q = query.trim();
    return init.rows.filter((r) => {
      if (scheduledOnly && !r.hasSchedule) return false;
      if (!q) return true;
      return (
        r.courseTitle.includes(q) ||
        String(r.offeringId).includes(q) ||
        r.rooms.some((n) => n.includes(q))
      );
    });
  }, [init.rows, query, scheduledOnly]);

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.offeringId));
  /* تخصیصِ گروهی فقط روی ردیف‌های دیده‌شده اعمال می‌شود؛ وگرنه اگر کاربر
     فیلتر را عوض کند، ردیف‌های انتخاب‌شدهٔ پنهان هم بی‌خبر تخصیص می‌خوردند. */
  const visibleSelected = rows.filter((r) => selected.has(r.offeringId));

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (allChecked) {
        const next = new Set(prev);
        rows.forEach((r) => next.delete(r.offeringId));
        return next;
      }
      const next = new Set(prev);
      rows.forEach((r) => next.add(r.offeringId));
      return next;
    });
  }

  async function assignOne(offeringId: number, userId: number | null) {
    setMsg(null);
    const res = await setOfferingEduExpertAction(offeringId, userId);
    if (res.ok) {
      setMsg({ ok: true, text: 'ذخیره شد.' });
      router.refresh();
    } else {
      setMsg({ ok: false, text: res.error ?? 'خطا' });
    }
  }

  async function doBulk() {
    if (!visibleSelected.length) {
      setMsg({ ok: false, text: 'هیچ کلاسی انتخاب نشده.' });
      return;
    }
    setMsg(null);
    const res = await bulkSetOfferingEduExpertAction(visibleSelected.map((r) => r.offeringId), bulkExpert);
    if (res.ok) {
      setMsg({ ok: true, text: `${res.updated ?? 0} کلاس به‌روز شد.` });
      setSelected(new Set());
      router.refresh();
    } else {
      setMsg({ ok: false, text: res.error ?? 'خطا' });
    }
  }

  async function doClearAll() {
    if (!termId) return;
    setMsg(null);
    const res = await clearTermEduExpertAction(termId);
    if (res.ok) {
      setMsg({ ok: true, text: `${res.updated ?? 0} تخصیص آزاد شد (بازگشت به نقش‌ها).` });
      setSelected(new Set());
      router.refresh();
    } else {
      setMsg({ ok: false, text: res.error ?? 'خطا' });
    }
  }

  const assignedCount = init.rows.filter((r) => r.source === 'offering').length;
  const fromScopeCount = init.rows.filter((r) => r.source === 'scope').length;
  const noneCount = init.rows.filter((r) => r.source == null).length;
  const scheduledCount = init.rows.filter((r) => r.hasSchedule).length;

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block mb-1 font-bold">ترم</span>
            <select
              className="input"
              value={termId}
              onChange={(e) => {
                setTermId(Number(e.target.value));
                startTransition(() => {
                  const p = new URLSearchParams();
                  p.set('term', e.target.value);
                  router.push(`?${p.toString()}`);
                });
              }}
            >
              {init.terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                  {t.isCurrent ? ' (جاری)' : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="block mb-1 font-bold">جستجوی درس</span>
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="نام درس، شمارهٔ ارائه یا نام اتاق (مثل «انساني»)"
            />
          </label>

          <div className="flex-1" />

          <label className="text-sm">
            <span className="block mb-1 font-bold">کارشناس آموزش برای انتخاب‌شده‌ها</span>
            <select
              className="input"
              value={bulkExpert ?? ''}
              onChange={(e) => setBulkExpert(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— بدون کارشناس (آزاد کن) —</option>
              {init.candidates.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <button className="btn btn-primary" onClick={doBulk} disabled={pending || !visibleSelected.length}>
            تخصیص به {visibleSelected.length} کلاس
          </button>
          <button className="btn" onClick={doClearAll} disabled={pending}>
            آزاد کردن همهٔ ترم
          </button>
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-slate-600">
          <span>کل درس‌های ترم: <b>{init.rows.length}</b></span>
          <span className="text-slate-800">دارای کلاس/اتاق: <b>{scheduledCount}</b></span>
          <span className="text-indigo-700">تخصیص صریح: <b>{assignedCount}</b></span>
          <span className="text-emerald-700">از نقش‌ها: <b>{fromScopeCount}</b></span>
          <span className="text-amber-700">بدون کارشناس: <b>{noneCount}</b></span>
          <label className="flex items-center gap-1.5 font-bold text-slate-800">
            <input
              type="checkbox"
              checked={scheduledOnly}
              onChange={(e) => setScheduledOnly(e.target.checked)}
            />
            فقط کلاس‌های دارای برنامه (اتاق)
          </label>
        </div>

        {msg && (
          <div className={`text-sm font-bold ${msg.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
            {msg.text}
          </div>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-white">
            <tr>
              <th className="p-2 w-8">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="انتخاب همه" />
              </th>
              <th className="p-2 text-right">#</th>
              <th className="p-2 text-right">درس</th>
              <th className="p-2 text-right">گروه</th>
              <th className="p-2 text-right">کلاس (اتاق)</th>
              <th className="p-2 text-right">گروه سازنده</th>
              <th className="p-2 text-right">کارشناس آموزش</th>
              <th className="p-2 text-right">منبع</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.offeringId} className="border-b border-slate-200 hover:bg-slate-50">
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={selected.has(r.offeringId)}
                    onChange={() => toggle(r.offeringId)}
                    aria-label={`انتخاب ${r.courseTitle}`}
                  />
                </td>
                <td className="p-2 text-slate-500">{r.offeringId}</td>
                <td className="p-2 font-bold">{r.courseTitle}</td>
                <td className="p-2">{r.groupNumber}</td>
                <td className="p-2 font-bold text-slate-800">
                  {r.rooms.length ? r.rooms.join(' · ') : <span className="text-slate-400 font-normal">بدون اتاق</span>}
                </td>
                <td className="p-2 text-slate-600">{r.departmentName ?? '—'}</td>
                <td className="p-2">
                  <select
                    className="input text-xs"
                    value={r.assignedUserId ?? ''}
                    onChange={(e) => assignOne(r.offeringId, e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">
                      {r.resolvedUserId && r.source === 'scope'
                        ? `— از نقش‌ها (${init.candidates.find((c) => c.userId === r.resolvedUserId)?.name ?? r.resolvedUserId}) —`
                        : '— بدون کارشناس —'}
                    </option>
                    {init.candidates.map((c) => (
                      <option key={c.userId} value={c.userId}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2">
                  <span
                    className={
                      r.source === 'offering'
                        ? 'text-indigo-700 font-bold'
                        : r.source === 'scope'
                          ? 'text-emerald-700'
                          : 'text-slate-400'
                    }
                  >
                    {SOURCE_LABEL[r.source ?? 'none']}
                  </span>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-slate-500">
                  کلاسی یافت نشد.
                  {scheduledOnly && init.rows.length > 0 && (
                    <span className="block mt-1 text-xs">
                      ({init.rows.length} درس هست، ولی هیچ‌کدام برنامه/اتاق ندارند — تیکِ «فقط کلاس‌های دارای برنامه» را بردارید.)
                    </span>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card p-4 text-xs leading-6 text-slate-600 space-y-1">
        <p><b>چطور کار می‌کند:</b></p>
        <p>۰. ستونِ «کلاس (اتاق)» از برنامهٔ هفتگی می‌آید؛ درس‌هایی که هنوز هیچ سانس/اتاقی ندارند با تیکِ بالای جدول پنهان می‌شوند (برای دیدنشان تیک را بردارید).</p>
        <p>۱. اگر برای کلاس کارشناس انتخاب شود («تخصیص کلاس»)، همان برنده است.</p>
        <p>۲. اگر انتخاب نشود، کارشناس از <b>تخصیص نقش‌ها</b> (دانشگاه/دانشکده/گروه/رشته) پایین می‌آید — دقیق‌ترین دامنه برنده است.</p>
        <p>۳. «بدون کارشناس» یعنی هیچ‌کدام؛ آن کلاس در کارتابل هیچ کارشناسی نمی‌آید.</p>
        <p>۴. «آزاد کردن همهٔ ترم» فقط تخصیص‌های صریح را برمی‌دارد و به حالت «از نقش‌ها» برمی‌گردد.</p>
      </div>
    </div>
  );
}
