'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addOfferingEduExpertAction,
  bulkAddOfferingEduExpertAction,
  bulkSetOfferingEduExpertAction,
  clearTermEduExpertAction,
  removeOfferingEduExpertAction,
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
  /* به‌روزرسانیِ خوش‌بینانهٔ فهرستِ کارشناسانِ هر ردیف، تا بدون رفرشِ کلِ صفحه
     چیپ‌ها فوراً عوض شوند (رفرش هم می‌زنیم، ولی UI منتظرِ آن نمی‌ماند). */
  const [overrides, setOverrides] = useState<Map<number, number[]>>(new Map());

  const nameOf = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of init.candidates) m.set(c.userId, c.name);
    return m;
  }, [init.candidates]);

  const expertIdsOf = (r: Row): number[] => overrides.get(r.offeringId) ?? r.assignedUserIds;

  const rows = useMemo(() => {
    const q = query.trim();
    return init.rows.filter((r) => {
      if (scheduledOnly && !r.hasSchedule) return false;
      if (!q) return true;
      return (
        r.courseTitle.includes(q) ||
        String(r.offeringId).includes(q) ||
        r.rooms.some((n) => n.includes(q)) ||
        expertIdsOf(r).some((id) => (nameOf.get(id) ?? '').includes(q))
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [init.rows, query, scheduledOnly, overrides, nameOf]);

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.offeringId));
  /* تخصیصِ گروهی فقط روی ردیف‌های دیده‌شده اعمال می‌شود؛ وگرنه اگر کاربر
     فیلتر را عوض کند، ردیف‌های انتخاب‌شدهٔ پنهان هم بی‌خبر تخصیص می‌خوردند. */
  const visibleSelected = rows.filter((r) => selected.has(r.offeringId));

  function setRowExperts(offeringId: number, ids: number[]) {
    setOverrides((prev) => new Map(prev).set(offeringId, ids));
  }

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

  async function addOne(r: Row, userId: number) {
    if (!userId) return;
    if (expertIdsOf(r).includes(userId)) {
      setMsg({ ok: false, text: `${nameOf.get(userId) ?? userId} از قبل به این کلاس تخصیص دارد.` });
      return;
    }
    setMsg(null);
    const res = await addOfferingEduExpertAction(r.offeringId, userId);
    if (res.ok) {
      setRowExperts(r.offeringId, [...expertIdsOf(r), userId]);
      setMsg({ ok: true, text: 'کارشناس اضافه شد.' });
      router.refresh();
    } else {
      setMsg({ ok: false, text: res.error ?? 'خطا' });
    }
  }

  async function removeOne(r: Row, userId: number) {
    setMsg(null);
    const res = await removeOfferingEduExpertAction(r.offeringId, userId);
    if (res.ok) {
      setRowExperts(r.offeringId, res.userIds ?? expertIdsOf(r).filter((x) => x !== userId));
      setMsg({ ok: true, text: 'کارشناس حذف شد.' });
      router.refresh();
    } else {
      setMsg({ ok: false, text: res.error ?? 'خطا' });
    }
  }

  async function doBulk(mode: 'replace' | 'add') {
    if (!visibleSelected.length) {
      setMsg({ ok: false, text: 'هیچ کلاسی انتخاب نشده.' });
      return;
    }
    if (mode === 'add' && !bulkExpert) {
      setMsg({ ok: false, text: 'برای «افزودن» اول یک کارشناس انتخاب کنید.' });
      return;
    }
    setMsg(null);
    const ids = visibleSelected.map((r) => r.offeringId);

    if (mode === 'add') {
      const res = await bulkAddOfferingEduExpertAction(ids, bulkExpert as number);
      if (res.ok) {
        setOverrides((prev) => {
          const next = new Map(prev);
          for (const r of visibleSelected) {
            const cur = expertIdsOf(r);
            if (!cur.includes(bulkExpert as number)) next.set(r.offeringId, [...cur, bulkExpert as number]);
          }
          return next;
        });
        setMsg({ ok: true, text: `${nameOf.get(bulkExpert as number) ?? ''} به ${res.updated ?? 0} کلاس اضافه شد (بقیهٔ کارشناسان حفظ شدند).` });
        setSelected(new Set());
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error ?? 'خطا' });
      }
      return;
    }

    const res = await bulkSetOfferingEduExpertAction(ids, bulkExpert);
    if (res.ok) {
      setOverrides((prev) => {
        const next = new Map(prev);
        for (const r of visibleSelected) next.set(r.offeringId, bulkExpert ? [bulkExpert] : []);
        return next;
      });
      setMsg({ ok: true, text: `${res.updated ?? 0} کلاس به‌روز شد (فهرست جایگزین شد).` });
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
      setOverrides(new Map(init.rows.map((r) => [r.offeringId, []])));
      setMsg({ ok: true, text: `${res.updated ?? 0} تخصیص آزاد شد (بازگشت به نقش‌ها).` });
      setSelected(new Set());
      router.refresh();
    } else {
      setMsg({ ok: false, text: res.error ?? 'خطا' });
    }
  }

  const assignedCount = init.rows.filter((r) => r.source === 'offering').length;
  const multiCount = init.rows.filter((r) => r.assignedUserIds.length > 1).length;
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
            <span className="block mb-1 font-bold">جستجو</span>
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="نام درس، شمارهٔ ارائه، نام اتاق یا نام کارشناس"
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

          <button className="btn btn-primary" onClick={() => doBulk('add')} disabled={pending || !visibleSelected.length || !bulkExpert}>
            ＋ افزودن به {visibleSelected.length} کلاس
          </button>
          <button className="btn" onClick={() => doBulk('replace')} disabled={pending || !visibleSelected.length}>
            جایگزینی روی {visibleSelected.length} کلاس
          </button>
          <button className="btn" onClick={doClearAll} disabled={pending}>
            آزاد کردن همهٔ ترم
          </button>
        </div>

        <p className="text-[11px] leading-5 text-slate-600">
          <b>«افزودن»</b> کارشناس را به فهرستِ هر کلاس اضافه می‌کند و کارشناسانِ قبلی را نگه می‌دارد — برای وقتی یک کلاس بین دو یا چند کارشناس مشترک است.
          <b> «جایگزینی»</b> فهرست را با همین یک نفر بازنویسی می‌کند.
        </p>

        <div className="flex flex-wrap gap-4 text-xs text-slate-600">
          <span>کل درس‌های ترم: <b>{init.rows.length}</b></span>
          <span className="text-slate-800">دارای کلاس/اتاق: <b>{scheduledCount}</b></span>
          <span className="text-indigo-700">تخصیص صریح: <b>{assignedCount}</b></span>
          <span className="text-fuchsia-700">چند‌کارشناسه: <b>{multiCount}</b></span>
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
              <th className="p-2 text-right">کارشناسان آموزش</th>
              <th className="p-2 text-right">منبع</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const ids = expertIdsOf(r);
              return (
                <tr key={r.offeringId} className="border-b border-slate-200 hover:bg-slate-50 align-top">
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
                  <td className="p-2 min-w-[260px]">
                    <div className="flex flex-wrap items-center gap-1">
                      {ids.map((id) => (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-800"
                        >
                          {nameOf.get(id) ?? `#${id}`}
                          <button
                            type="button"
                            onClick={() => removeOne(r, id)}
                            disabled={pending}
                            className="text-rose-600 hover:text-rose-800 font-black"
                            aria-label={`حذف ${nameOf.get(id) ?? id}`}
                            title="حذف این کارشناس"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      {!ids.length && (
                        <span className="text-[11px] text-slate-400">
                          {r.resolvedUserId && r.source === 'scope'
                            ? `از نقش‌ها: ${nameOf.get(r.resolvedUserId) ?? r.resolvedUserId}`
                            : 'بدون کارشناس'}
                        </span>
                      )}
                      <select
                        className="input text-[11px] py-0.5 h-7 w-32"
                        value=""
                        onChange={(e) => {
                          const v = e.target.value;
                          e.target.value = '';
                          if (v) addOne(r, Number(v));
                        }}
                        disabled={pending}
                        title="افزودن کارشناس"
                      >
                        <option value="">＋ افزودن…</option>
                        {init.candidates
                          .filter((c) => !ids.includes(c.userId))
                          .map((c) => (
                            <option key={c.userId} value={c.userId}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    </div>
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
                      {ids.length > 1 ? ` (${ids.length} نفر)` : ''}
                    </span>
                  </td>
                </tr>
              );
            })}
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
        <p>۱. هر کلاس می‌تواند <b>چند کارشناس</b> داشته باشد — با «＋ افزودن…» در همان ردیف یکی‌یکی اضافه کنید، یا چند کلاس را تیک بزنید و از دکمهٔ «افزودن» بالای جدول استفاده کنید. با × هر کارشناس را جدا حذف کنید.</p>
        <p>۲. اگر برای کلاس کارشناس انتخاب شود («تخصیص کلاس»)، همان برنده است و تخصیص نقش‌ها نادیده گرفته می‌شود.</p>
        <p>۳. اگر هیچ کارشناسی انتخاب نشود، کارشناس از <b>تخصیص نقش‌ها</b> (دانشگاه/دانشکده/گروه/رشته) پایین می‌آید — دقیق‌ترین دامنه برنده است.</p>
        <p>۴. «بدون کارشناس» یعنی هیچ‌کدام؛ آن کلاس در کارتابل هیچ کارشناسی نمی‌آید.</p>
        <p>۵. «آزاد کردن همهٔ ترم» همهٔ تخصیص‌های صریح (چند‌کارشناسه هم) را برمی‌دارد و به حالت «از نقش‌ها» برمی‌گردد.</p>
      </div>
    </div>
  );
}
