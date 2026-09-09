'use client';

import { ClientTh, useClientTable, type ColumnDef } from '@/components/DataTable';

export type StaffRow = {
  userId: number;
  code: string;
  name: string;
  family: string;
  staffCode: string | null;
  dept: string | null;
  rank: string | null;
  type: string | null;
};

export default function StaffTable({
  rows,
  headUserIds,
  ledBy,
  toggleAction,
}: {
  rows: StaffRow[];
  headUserIds: number[];
  ledBy: Record<number, string[]>;
  toggleAction: (fd: FormData) => void;
}) {
  const heads = new Set(headUserIds);
  const COLS: ColumnDef<StaffRow>[] = [
    { key: 'name', label: 'نام', get: r => `${r.name} ${r.family}` },
    { key: 'code', label: 'کد', get: r => r.staffCode ?? '' },
    { key: 'dept', label: 'گروه', get: r => r.dept ?? '' },
    { key: 'rank', label: 'رتبه/نوع', get: r => r.rank ?? r.type ?? '' },
    { key: 'led', label: 'مدیر کدام گروه', get: r => (ledBy[r.userId] ?? []).join('، ') },
  ];
  const t = useClientTable(rows, COLS);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-right text-xs">
        <thead>
          <tr className="text-slate-500">
            {COLS.map(c => (
              <ClientTh
                key={c.key}
                col={c}
                sortKey={t.sortKey}
                sortDir={t.sortDir}
                filter={t.filters[c.key] ?? ''}
                onSort={() => t.toggleSort(c.key)}
                onFilter={v => t.setFilter(c.key, v)}
              />
            ))}
            <th className="p-2">نقش مدیر گروه</th>
          </tr>
        </thead>
        <tbody>
          {t.visible.map(r => (
            <tr key={r.userId} className={'border-t border-slate-100' + (heads.has(r.userId) ? ' bg-teal-50' : '')}>
              <td className="p-2 font-medium">{r.name} {r.family}</td>
              <td className="p-2" dir="ltr">{r.staffCode}</td>
              <td className="p-2">{r.dept ?? '—'}</td>
              <td className="p-2">{r.rank ?? r.type ?? '—'}</td>
              <td className="p-2 text-slate-600">{(ledBy[r.userId] ?? []).join('، ') || '—'}</td>
              <td className="p-2">
                <form action={toggleAction}>
                  <input type="hidden" name="userId" value={r.userId} />
                  <input type="hidden" name="assign" value={heads.has(r.userId) ? '0' : '1'} />
                  <button className={heads.has(r.userId) ? 'text-red-600 hover:underline' : 'text-teal-700 hover:underline'}>
                    {heads.has(r.userId) ? 'گرفتن نقش' : 'دادن نقش'}
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {t.visible.length === 0 && (
            <tr><td colSpan={6} className="p-6 text-center text-slate-400">موردی یافت نشد.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
