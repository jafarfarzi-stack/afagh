import { requireRole } from '@/lib/auth';
import { getFilterOptions, allowedReportKinds } from '@/app/admin/reports/actions';
import { ALL_REPORT_KINDS } from '@/app/admin/reports/report-helpers';
import { getCurrentUniversity } from '@/lib/university-scope';
import ReportsClient from '@/app/admin/reports/ReportsClient';

export const dynamic = 'force-dynamic';

export default async function AdminFinanceReportsPage() {
  await requireRole(['ADMIN', 'FINANCE_EXPERT', 'FINANCE', 'CASHIER']);

  const currentUniversity = await getCurrentUniversity();
  const currentUniversityId = currentUniversity?.id ?? null;

  const opts = await getFilterOptions({ universityId: currentUniversityId });
  const allowed = await allowedReportKinds(ALL_REPORT_KINDS);

  return (
    <div className="space-y-4">
      <div className="card !p-4 bg-white border-slate-300 shadow-sm flex items-center justify-between">
        <div>
          <h1 className="text-base font-extrabold text-slate-900">💰 مرکز گزارش‌های مالی (سما)</h1>
          <p className="text-xs text-slate-500 mt-0.5">شهریه، تعرفه، صورت‌حساب، کارتابل مالی، حق‌التدریس و BI مالی — همه صفحه‌بندی‌شده با خروجی Excel</p>
        </div>
      </div>
      <ReportsClient opts={opts} initialUniversityId={currentUniversityId ?? 0} allowedKinds={allowed} scope="finance" />
    </div>
  );
}