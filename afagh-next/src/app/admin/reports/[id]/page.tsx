import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { getFilterOptions, allowedReportKinds } from '../actions';
import { ALL_REPORT_KINDS } from '../report-helpers';
import ReportsClient from '../ReportsClient';

export const dynamic = 'force-dynamic';

/**
 * صفحهٔ اختصاصی هر گزارش: کلیک روی کارت در مرکز گزارشها به این مسیر میآید.
 * فیلترها و دکمهٔ اجرا در همان صفحهاند و نیازی به رفتن به پایین/برگشتن به بالا
 * یا اجرای خودکار قبل از تنظیم فیلترها نیست.
 */
export default async function SingleReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ term?: string; courseCode?: string; scope?: string; auto?: string }>;
}) {
  // Report center routes are shared by the education and finance desks; the
  // ?scope=finance query selects the finance filter/signer set.
  await requireRole(['ADMIN', 'EDU_EXPERT', 'ARCHIVE_EXPERT', 'MILITARY_OFFICER', 'FINANCE_EXPERT', 'FINANCE', 'CASHIER']);

  const { id } = await params;
  if (!ALL_REPORT_KINDS.includes(id)) notFound();

  const sp = await searchParams;
  // لینکهای قدیمی ?kind=... هنوز کار میکنند؛ اسکوپ مالی از طریق query حفظ میشود.
  const scope: 'edu' | 'finance' = sp?.scope === 'finance' ? 'finance' : 'edu';
  const initialAuto = sp?.auto === '1';

  const currentUniversity = await getCurrentUniversity();
  const universityId = currentUniversity?.id ?? null;
  const opts = await getFilterOptions({
    universityId,
    signerForm: scope === 'finance' ? 'finance-report' : 'edu-report',
  });
  const allowed = await allowedReportKinds(ALL_REPORT_KINDS);

  return (
    <div className="space-y-4">
      <ReportsClient
        key={id}
        opts={opts}
        initialUniversityId={universityId ?? 0}
        allowedKinds={allowed}
        scope={scope}
        initialKind={id}
        initialTerm={sp?.term}
        initialExtra={sp?.courseCode ? { courseCode: sp.courseCode } : undefined}
        initialAuto={initialAuto}
        singleReport
      />
    </div>
  );
}
