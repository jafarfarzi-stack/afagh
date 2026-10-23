import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { listTermsForConflicts } from '@/lib/schedule-conflicts';
import ScheduleConflictsClient from './ScheduleConflictsClient';

export const dynamic = 'force-dynamic';

/**
 * «گزارش تداخل‌های واقعی برنامهٔ هفتگی» — ابزارِ کارشناس آموزش.
 *
 * چرا صفحهٔ جدا (و نه فقط یک خط در عارضه‌یابیِ برنامه‌ریزی)؟ چون آنجا فقط
 * عدد می‌دهد؛ اینجا کارشناس باید بتواند یک‌به‌یک **بررسی** کند، تصمیم بگیرد
 * که ادغامی است یا نه، و ردی از تصمیم بگذارد تا هفتهٔ بعد همان تداخل دوباره
 * به‌چشم خطای تازه نیاید.
 */
export default async function ScheduleConflictsPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'VICE_EDU']);
  const uni = await getCurrentUniversity().catch(() => null);
  if (!uni || !(uni.id > 0)) {
    return <div className="p-6 text-sm text-rose-700">دانشگاه فعال مشخص نیست.</div>;
  }
  const terms = await listTermsForConflicts(uni.id).catch(() => []);
  return (
    <div className="max-w-7xl mx-auto space-y-4 p-4 md:p-6">
      <ScheduleConflictsClient terms={terms} />
    </div>
  );
}
