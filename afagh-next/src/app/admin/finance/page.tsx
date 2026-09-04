import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { listFinanceStudents, listFinanceFilterOptions } from '@/lib/finance-engine';

export const dynamic = 'force-dynamic';

const FINANCE = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'];

const fa = (n: number) => Number(n || 0).toLocaleString('fa-IR');
const faYear = (y: number | null) => (y ? fa(y) : '—');

export default async function FinanceWorklistPage(props: {
  searchParams: Promise<{
    majorId?: string;
    degreeLevelId?: string;
    entryYear?: string;
    q?: string;
    debtors?: string;
  }>;
}) {
  await requireRole(FINANCE);

  const sp = (await props.searchParams) || {};
  const majorId = Number(sp.majorId) || null;
  const degreeLevelId = Number(sp.degreeLevelId) || null;
  const entryYear = Number(sp.entryYear) || null;
  const search = (sp.q || '').trim();
  const onlyDebtors = sp.debtors === '1';

  const [options, students] = await Promise.all([
    listFinanceFilterOptions(),
    listFinanceStudents({ majorId, degreeLevelId, entryYear, search, onlyDebtors, limit: 1000 }),
  ]);

  const totals = students.reduce(
    (acc, s) => ({
      charges: acc.charges + s.charges,
      discounts: acc.discounts + s.discounts,
      sponsorships: acc.sponsorships + s.sponsorships,
      payments: acc.payments + s.payments,
      chequesCleared: acc.chequesCleared + s.chequesCleared,
      loans: acc.loans + s.loans,
      balance: acc.balance + s.balance,
      pendingCheques: acc.pendingCheques + s.pendingCheques,
    }),
    { charges: 0, discounts: 0, sponsorships: 0, payments: 0,
      chequesCleared: 0, loans: 0, balance: 0, pendingCheques: 0 }
  );
  const debtorCount = students.filter((s) => s.balance > 0).length;

  const inputCls =
    'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500';

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          <h1 className="font-extrabold text-slate-800 text-base sm:text-lg">🗂️ کارتابل کارشناس مالی</h1>
          <p className="text-xs text-slate-500 mt-1">
            فهرست کامل دانشجویان با ماندهٔ مالی، فیلتر بر اساس رشته، مقطع و ورودی
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/finance/rules" className="rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700">
            ⚙️ انواع تخفیف، بنیادها و فرمول‌ها
          </Link>
          <Link href="/admin/tuition" className="rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700">
            🧮 موتور شهریه
          </Link>
        </div>
      </div>

      {/* آمار کل */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 print:hidden">
        <div className="card text-center">
          <p className="text-xl font-bold text-slate-800">{fa(students.length)}</p>
          <p className="text-xs text-slate-500">دانشجوی فهرست‌شده</p>
        </div>
        <div className="card text-center">
          <p className="text-xl font-bold text-slate-800">{fa(totals.charges)}</p>
          <p className="text-xs text-slate-500">جمع بدهی (ریال)</p>
        </div>
        <div className="card text-center">
          <p className="text-xl font-bold text-emerald-700">{fa(totals.payments)}</p>
          <p className="text-xs text-slate-500">جمع پرداخت (ریال)</p>
        </div>
        <div className="card text-center">
          <p className="text-xl font-bold text-rose-700">{fa(debtorCount)}</p>
          <p className="text-xs text-slate-500">دانشجوی بدهکار</p>
        </div>
      </div>

      {/* فیلترها */}
      <form method="get" className="card print:hidden">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-slate-600">رشته</span>
            <select name="majorId" defaultValue={majorId ?? ''} className={inputCls}>
              <option value="">همهٔ رشته‌ها</option>
              {options.majors.map((m) => (
                <option key={m.id} value={m.id}>{m.title}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-slate-600">مقطع</span>
            <select name="degreeLevelId" defaultValue={degreeLevelId ?? ''} className={inputCls}>
              <option value="">همهٔ مقاطع</option>
              {options.degrees.map((d) => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-slate-600">ورودی</span>
            <select name="entryYear" defaultValue={entryYear ?? ''} className={inputCls}>
              <option value="">همهٔ ورودی‌ها</option>
              {options.entryYears.map((y) => (
                <option key={y} value={y}>{fa(y)}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[11px] font-medium text-slate-600">جستجو (نام، کد ملی، شمارهٔ دانشجویی)</span>
            <input name="q" defaultValue={search} placeholder="جستجو…" className={inputCls} />
          </label>

          <div className="flex items-end gap-2">
            <button type="submit" className="rounded-lg bg-emerald-700 hover:bg-emerald-800 px-3 py-1.5 text-xs font-medium text-white">
              اعمال فیلتر
            </button>
            <Link href="/admin/finance" className="rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700">
              پاک‌کردن
            </Link>
          </div>
        </div>

        <label className="mt-3 flex items-center gap-2 text-xs text-slate-700">
          <input type="checkbox" name="debtors" value="1" defaultChecked={onlyDebtors} className="accent-emerald-700" />
          فقط دانشجویان بدهکار
        </label>
      </form>

      {/* فهرست دانشجویان */}
      <div className="card">
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
          <h2 className="font-bold text-slate-800">فهرست دانشجویان ({fa(students.length)})</h2>
          <p className="text-[11px] text-slate-500 print:hidden">برای کارنامهٔ مالی روی دانشجو کلیک کنید</p>
        </div>

        {students.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-500">دانشجویی با این فیلترها یافت نشد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="p-2">دانشجو</th>
                  <th className="p-2">شمارهٔ دانشجویی</th>
                  <th className="p-2">رشته</th>
                  <th className="p-2">مقطع</th>
                  <th className="p-2">ورودی</th>
                  <th className="p-2">شهریه</th>
                  <th className="p-2">تخفیف</th>
                  <th className="p-2">پوشش بنیاد</th>
                  <th className="p-2">پرداخت</th>
                  <th className="p-2">چک وصولی</th>
                  <th className="p-2">وام</th>
                  <th className="p-2">چک در انتظار</th>
                  <th className="p-2">مانده</th>
                  <th className="p-2 print:hidden"></th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
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
                    <td className="p-2 text-xs text-violet-700">{s.discounts > 0 ? fa(s.discounts) : '—'}</td>
                    <td className="p-2 text-xs text-indigo-700">{s.sponsorships > 0 ? fa(s.sponsorships) : '—'}</td>
                    <td className="p-2 text-xs text-emerald-700">{fa(s.payments)}</td>
                    <td className="p-2 text-xs text-emerald-700">{s.chequesCleared > 0 ? fa(s.chequesCleared) : '—'}</td>
                    <td className="p-2 text-xs text-sky-700">{s.loans > 0 ? fa(s.loans) : '—'}</td>
                    <td className="p-2 text-xs text-amber-700">{s.pendingCheques > 0 ? fa(s.pendingCheques) : '—'}</td>
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
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 text-xs font-bold text-slate-800">
                  <td className="p-2" colSpan={5}>جمع</td>
                  <td className="p-2">{fa(totals.charges)}</td>
                  <td className="p-2 text-violet-700">{fa(totals.discounts)}</td>
                  <td className="p-2 text-indigo-700">{fa(totals.sponsorships)}</td>
                  <td className="p-2 text-emerald-700">{fa(totals.payments)}</td>
                  <td className="p-2 text-emerald-700">{fa(totals.chequesCleared)}</td>
                  <td className="p-2 text-sky-700">{fa(totals.loans)}</td>
                  <td className="p-2 text-amber-700">{fa(totals.pendingCheques)}</td>
                  <td className="p-2 text-rose-700">{fa(totals.balance)}</td>
                  <td className="p-2 print:hidden"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
