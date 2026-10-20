import { requireRole } from '@/lib/auth';
import { currentTerm } from '@/lib/payroll-engine';
import { getScopedOverview } from '@/lib/payroll-approvals';
import { getCurrentUniversity } from '@/lib/university-scope';
import { getSetting } from '@/lib/settings';
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
  // زنجیرهٔ تأیید فیش: مدیر گروه (دامنهٔ گروه خودش) + معاونت آموزشی هم کارتابل را می‌بینند
  const user = await requireRole(['ADMIN', 'EDU_EXPERT', 'VICE_EDU', 'FINANCE_EXPERT', 'FINANCE', 'DEP_HEAD']);
  const isFinance = user.roles.some(r => r === 'FINANCE_EXPERT' || r === 'FINANCE');

  const sp = await props.searchParams;
  const tab: Tab = sp?.tab === 'simulator' ? 'simulator' : 'live';

  if (tab === 'simulator') {
    // نام دانشگاه برای سربرگ ابلاغیه/فیش — از دانشگاه فعال و سپس تنظیمات سراسری (بدون هاردکد)
    const uni = await getCurrentUniversity().catch(() => null);
    const uniTitle = uni?.title && uni.title !== '—'
      ? uni.title
      : (await getSetting('UNIVERSITY_NAME').catch(() => '')) || null;
    return <PayrollEngineClient universityTitle={uniTitle} />;
  }

  const term = await currentTerm();
  // نمای دامنه‌دار: مدیر گروهِ خالص فقط فیش‌های گروه خودش را می‌بیند (داخل getScopedOverview)
  const overview = term ? await getScopedOverview().catch(() => null) : null;

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
        <a
          href="/admin/payroll/coverage"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700"
        >
          پوشش فرمول‌ها
        </a>
        <a
          href="/admin/payroll/teaching-roles"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700"
        >
          نقش تدریس در درس‌ها
        </a>
        <a
          href="/admin/payroll/roles"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700"
        >
          سمت‌ها و انتساب ترمی
        </a>
        <a
          href="/admin/payroll/decrees"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700"
        >
          ابلاغ‌های آموزشی
        </a>
        <a
          href="/admin/payroll/thesis"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700"
        >
          دفتر پایان‌نامه
        </a>
        <a
          href="/admin/payroll/regulations"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700"
        >
          نسخه‌های آیین‌نامه
        </a>
        <a
          href="/admin/payroll/exam-payments"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700"
        >
          پرداخت‌های امتحانی
        </a>
        <a
          href="/admin/payroll/objections"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700"
        >
          اعتراض‌ها
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
        <LivePayrollClient initialTerm={overview.term} initialList={overview.list} initialTotals={overview.totals} userRoles={user.roles} />
      ) : null}
    </div>
  );
}
