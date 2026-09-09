'use client';

import Link from 'next/link';
import { ClientTh, useClientTable, type ColumnDef } from '@/components/DataTable';

export type FinanceStudent = {
  studentId: number;
  firstName: string | null;
  lastName: string | null;
  nationalCode: string | null;
  studentCode: string | null;
  majorTitle: string | null;
  degreeTitle: string | null;
  entryYear: number | null;
  charges: number;
  discounts: number;
  sponsorships: number;
  payments: number;
  chequesCleared: number;
  loans: number;
  pendingCheques: number;
  balance: number;
};

const fa = (n: number) => Number(n || 0).toLocaleString('fa-IR');
const faYear = (y: number | null) => (y ? fa(y) : '—');
const money = (n: number) => (n > 0 ? fa(n) : '—');

export default function FinanceTable({ students }: { students: FinanceStudent[] }) {
  const COLS: ColumnDef<FinanceStudent>[] = [
    { key: 'name', label: 'دانشجو', get: s => `${s.firstName || ''} ${s.lastName || ''} ${s.nationalCode || ''}`.trim() },
    { key: 'code', label: 'شمارهٔ دانشجویی', get: s => s.studentCode ?? '' },
    { key: 'major', label: 'رشته', get: s => s.majorTitle ?? '' },
    { key: 'degree', label: 'مقطع', get: s => s.degreeTitle ?? '' },
    { key: 'year', label: 'ورودی', get: s => s.entryYear, numeric: true },
    { key: 'charges', label: 'شهریه', get: s => s.charges, numeric: true },
    { key: 'discounts', label: 'تخفیف', get: s => s.discounts, numeric: true },
    { key: 'sponsorships', label: 'پوشش بنیاد', get: s => s.sponsorships, numeric: true },
    { key: 'payments', label: 'پرداخت', get: s => s.payments, numeric: true },
    { key: 'cheques', label: 'چک وصولی', get: s => s.chequesCleared, numeric: true },
    { key: 'loans', label: 'وام', get: s => s.loans, numeric: true },
    { key: 'pending', label: 'چک در انتظار', get: s => s.pendingCheques, numeric: true },
    { key: 'balance', label: 'مانده', get: s => s.balance, numeric: true },
  ];
  const t = useClientTable(students, COLS);
  const sum = (f: (s: FinanceStudent) => number) => t.visible.reduce((a, s) => a + f(s), 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-right text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs text-slate-500">
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
            <th className="p-2 print:hidden"></th>
          </tr>
        </thead>
        <tbody>
          {t.visible.map(s => (
            <tr key={s.studentId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <td className="p-2">
                <Link href={`/admin/finance/student/${s.studentId}`} className="font-medium text-slate-800 hover:text-emerald-700">
                  {`${s.firstName || ''} ${s.lastName || ''}`.trim() || '—'}
                </Link>
                <p className="text-[11px] text-slate-400">{s.nationalCode || '—'}</p>
              </td>
              <td className="p-2 text-xs text-slate-600">{s.studentCode || '—'}</td>
              <td className="p-2 text-xs text-slate-600">{s.majorTitle || '—'}</td>
              <td className="p-2 text-xs text-slate-600">{s.degreeTitle || '—'}</td>
              <td className="p-2 text-xs text-slate-600">{faYear(s.entryYear)}</td>
              <td className="p-2 text-xs text-slate-700">{fa(s.charges)}</td>
              <td className="p-2 text-xs text-violet-700">{money(s.discounts)}</td>
              <td className="p-2 text-xs text-indigo-700">{money(s.sponsorships)}</td>
              <td className="p-2 text-xs text-emerald-700">{fa(s.payments)}</td>
              <td className="p-2 text-xs text-emerald-700">{money(s.chequesCleared)}</td>
              <td className="p-2 text-xs text-sky-700">{money(s.loans)}</td>
              <td className="p-2 text-xs text-amber-700">{money(s.pendingCheques)}</td>
              <td className={`p-2 text-xs font-bold ${s.balance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                {fa(s.balance)}
              </td>
              <td className="p-2 print:hidden">
                <Link
                  href={`/admin/finance/student/${s.studentId}`}
                  className="rounded-lg bg-slate-100 hover:bg-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700"
                >
                  کارنامهٔ مالی
                </Link>
              </td>
            </tr>
          ))}
          {t.visible.length === 0 && (
            <tr><td colSpan={14} className="p-8 text-center text-xs text-slate-500">دانشجویی با این فیلترها یافت نشد.</td></tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 text-xs font-bold text-slate-800">
            <td className="p-2" colSpan={5}>جمع ({fa(t.visible.length)} نفر)</td>
            <td className="p-2">{fa(sum(s => s.charges))}</td>
            <td className="p-2 text-violet-700">{fa(sum(s => s.discounts))}</td>
            <td className="p-2 text-indigo-700">{fa(sum(s => s.sponsorships))}</td>
            <td className="p-2 text-emerald-700">{fa(sum(s => s.payments))}</td>
            <td className="p-2 text-emerald-700">{fa(sum(s => s.chequesCleared))}</td>
            <td className="p-2 text-sky-700">{fa(sum(s => s.loans))}</td>
            <td className="p-2 text-amber-700">{fa(sum(s => s.pendingCheques))}</td>
            <td className="p-2 text-rose-700">{fa(sum(s => s.balance))}</td>
            <td className="p-2 print:hidden"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
