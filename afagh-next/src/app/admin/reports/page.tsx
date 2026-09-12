import { requireRole } from '@/lib/auth';
import { getFilterOptions } from './actions';
import ReportsClient from './ReportsClient';

export const dynamic = 'force-dynamic';

export default async function AdminReportsPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'ARCHIVE_EXPERT', 'MILITARY_OFFICER']);
  const opts = await getFilterOptions();

  return (
    <div className="space-y-4">
      <div className="card !p-4 bg-white border-slate-300 shadow-sm flex items-center justify-between">
        <div>
          <h1 className="text-base font-extrabold text-slate-900">📑 مرکز گزارش‌های آموزشی (سما)</h1>
          <p className="text-xs text-slate-500 mt-0.5">فعال ترم، خلاصه وضعیت، تفکیک دانشکده/رشته، مشروطی، برترها، تکمیلی... — همه صفحه‌بندی‌شده با خروجی Excel</p>
        </div>
      </div>
      <ReportsClient opts={opts} />
    </div>
  );
}
