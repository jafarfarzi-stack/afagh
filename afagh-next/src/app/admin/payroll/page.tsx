import { requireRole } from '@/lib/auth';
import { currentTerm, getOverview } from '@/lib/payroll-engine';
import LivePayrollClient from './LivePayrollClient';
import PayrollEngineClient from './PayrollEngineClient';

export const dynamic = 'force-dynamic';

type Tab = 'live' | 'simulator';

/**
 * میز کار حق‌التدریس:
 *   • «محاسبهٔ واقعی» — دادهٔ زنده از موتور مالی (payroll-engine) روی PostgreSQL
 *   • «شبیه‌ساز سناریو» — پیش‌نمایش رابط کاربری با دادهٔ نمونه (بدون نوشتن در دیتابیس)
 */
export default async function PayrollPage(props: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireRole(['ADMIN', 'EDU_EXPERT', 'FINANCE_EXPERT', 'FINANCE']);
  const isFinance = user.roles.some(r => r === 'FINANCE_EXPERT' || r === 'FINANCE');

  const sp = await props.searchParams;
  const tab: Tab = sp?.tab === 'simulator' ? 'simulator' : 'live';

  if (tab === 'simulator') return <PayrollEngineClient />;

  const term = await currentTerm();
  const overview = term ? await getOverview(term.id) : null;

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <a
          href="/admin/payroll?tab=live"
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-white"
        >
          محاسبهٔ واقعی
        </a>
        <a
          href="/admin/payroll?tab=simulator"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700"
        >
          شبیه‌ساز سناریو (دادهٔ نمونه)
        </a>
      </div>

      {isFinance && (
        <a
          href="/admin/student-finance"
          className="flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 text-sm text-emerald-900 hover:bg-emerald-100 transition-colors"
        >
          <span className="font-bold">💳 امور مالی دانشجویان — شهریه، دفتر مالی و بدهی دانشجویان</span>
          <span className="font-extrabold">←</span>
        </a>
      )}

      {!term ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          ترم جاری مشخص نیست. ابتدا در «مدیریت ترم‌ها» یک ترم را به‌عنوان ترم جاری علامت بزنید.
        </div>
      ) : null}

      {term && overview ? (
        <LivePayrollClient initialTerm={overview.term} initialList={overview.list} initialTotals={overview.totals} />
      ) : null}
    </div>
  );
}
