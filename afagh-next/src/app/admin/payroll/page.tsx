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
export default async function PayrollPage(props: { searchParams?: { tab?: string } }) {
  await requireRole(['ADMIN', 'EDU_EXPERT']);

  const tab: Tab = props.searchParams?.tab === 'simulator' ? 'simulator' : 'live';

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
