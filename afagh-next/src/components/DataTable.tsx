'use client';

/**
 * سرستون‌های مرتب‌شونده + فیلتر ستونی — مشترک همه لیست‌های افراد.
 * دو حالت:
 *  ۱) کلاینتی (داده کامل دست مرورگر است): useClientTable
 *  ۲) سروری (صفحه‌بندی سمت سرور): ServerTh + FilterBox که با nav/canonical URL کار می‌کند
 */

import { useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc';

export type ColumnDef<T> = {
  /** کلید یکتای ستون (برای سورت سروری هم همین به سرور می‌رود) */
  key: string;
  label: string;
  /** خواندن مقدار نمایشی/مقایسه‌ای از ردیف */
  get: (row: T) => string | number | null | undefined;
  /** عددی است؟ (مرتب‌سازی عددی به‌جای رشته‌ای) */
  numeric?: boolean;
  /** آیا این ستون فیلتر متنی دارد؟ */
  filterable?: boolean;
  /** آیا این ستون سورت دارد؟ (پیش‌فرض true) */
  sortable?: boolean;
  className?: string;
};

/* ── حالت کلاینتی ── */

export function useClientTable<T>(rows: T[], columns: ColumnDef<T>[]) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filters, setFilters] = useState<Record<string, string>>({});

  const toggleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else {
      setSortKey(null);
    }
  };

  const setFilter = (key: string, v: string) =>
    setFilters(prev => {
      const next = { ...prev };
      if (!v.trim()) delete next[key];
      else next[key] = v.trim();
      return next;
    });

  const visible = useMemo(() => {
    const byKey = new Map(columns.map(c => [c.key, c]));
    let out = rows;
    const fKeys = Object.keys(filters);
    if (fKeys.length) {
      out = out.filter(r =>
        fKeys.every(k => {
          const col = byKey.get(k);
          if (!col) return true;
          const v = col.get(r);
          return String(v ?? '').includes(filters[k]);
        }),
      );
    }
    if (sortKey) {
      const col = byKey.get(sortKey);
      if (col) {
        const dir = sortDir === 'asc' ? 1 : -1;
        out = [...out].sort((a, b) => {
          const va = col.get(a);
          const vb = col.get(b);
          if (col.numeric) {
            const na = va == null || va === '' ? Number.NaN : Number(va);
            const nb = vb == null || vb === '' ? Number.NaN : Number(vb);
            if (Number.isNaN(na) && Number.isNaN(nb)) return 0;
            if (Number.isNaN(na)) return 1;
            if (Number.isNaN(nb)) return -1;
            return (na - nb) * dir;
          }
          return String(va ?? '').localeCompare(String(vb ?? ''), 'fa') * dir;
        });
      }
    }
    return out;
  }, [rows, columns, sortKey, sortDir, filters]);

  return { visible, sortKey, sortDir, filters, toggleSort, setFilter };
}

/** سرستون کلاینتی: کلیک = سورت، باکس زیر = فیلتر */
export function ClientTh<T>({
  col, sortKey, sortDir, filter, onSort, onFilter,
}: {
  col: ColumnDef<T>;
  sortKey: string | null;
  sortDir: SortDir;
  filter: string;
  onSort: () => void;
  onFilter: (v: string) => void;
}) {
  const active = sortKey === col.key;
  return (
    <th className={`p-2 align-top ${col.className ?? ''}`}>
      {col.sortable === false ? (
        <span>{col.label}</span>
      ) : (
        <button onClick={onSort} title="مرتب‌سازی" className={`font-bold hover:text-indigo-700 ${active ? 'text-indigo-700' : ''}`}>
          {col.label} {active ? (sortDir === 'asc' ? '▲' : '▼') : <span className="opacity-30">⇅</span>}
        </button>
      )}
      {col.filterable !== false && (
        <input
          value={filter}
          onChange={e => onFilter(e.target.value)}
          onClick={e => e.stopPropagation()}
          placeholder={`فیلتر ${col.label}…`}
          className="mt-1 block w-full min-w-16 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-normal"
        />
      )}
    </th>
  );
}

/* ── حالت سروری (صفحه‌بندی سمت سرور) ── */

/** سرستون سروری: کلیک = nav با sort=key:dir */
export function ServerTh({
  label, sortKey, activeKey, dir, onSort, filter, onFilter, onApply, filterPlaceholder,
}: {
  label: string;
  sortKey: string;
  activeKey: string | null;
  dir: SortDir;
  onSort: () => void;
  filter?: string;
  onFilter?: (v: string) => void;
  onApply?: () => void;
  filterPlaceholder?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <th className="p-2 align-top">
      <button onClick={onSort} title="مرتب‌سازی" className={`font-bold hover:text-indigo-700 ${active ? 'text-indigo-700' : ''}`}>
        {label} {active ? (dir === 'asc' ? '▲' : '▼') : <span className="opacity-30">⇅</span>}
      </button>
      {onFilter && (
        <input
          value={filter ?? ''}
          onChange={e => onFilter(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onApply?.(); } }}
          placeholder={filterPlaceholder ?? `فیلتر ${label}…`}
          className="mt-1 block w-full min-w-16 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-normal"
        />
      )}
    </th>
  );
}
