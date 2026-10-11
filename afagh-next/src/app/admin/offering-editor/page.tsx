import { requireRole } from '@/lib/auth';
import { listTermsForEditor } from './actions';
import OfferingEditorClient from './OfferingEditorClient';

export const dynamic = 'force-dynamic';

/** تعریف / اصلاح ارائهٔ درس در ترم (ظرفیت، زمان کلاس، سالن، امتحان) — با گارد تداخل */
export default async function OfferingEditorPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  const terms = await listTermsForEditor().catch(() => []);
  return (
    <div className="max-w-6xl mx-auto space-y-4 p-4">
      <OfferingEditorClient terms={terms} />
    </div>
  );
}