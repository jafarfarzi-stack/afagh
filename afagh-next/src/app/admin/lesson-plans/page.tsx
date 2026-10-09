import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { listLessonPlanStatus } from '@/app/professor/lesson-plan/actions';
import LessonPlansClient from './LessonPlansClient';

export const dynamic = 'force-dynamic';

export default async function LessonPlansPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'VICE_EDU']);
  const uni = await getCurrentUniversity().catch(() => null);
  const universityId = uni?.id ?? null;
  const rows = universityId ? await listLessonPlanStatus(universityId) : [];

  return (
    <div className="space-y-4" dir="rtl">
      <LessonPlansClient
        universityId={universityId}
        universityTitle={uni?.title ?? 'دانشگاه'}
        initialRows={rows.map((r: { offeringId: number; courseTitle: string; professorName: string; status: string; sessionsCount: number; weightsSum: number; updatedAt: unknown }) => ({
          offeringId: r.offeringId,
          courseTitle: r.courseTitle,
          professorName: r.professorName,
          status: r.status,
          sessionsCount: r.sessionsCount,
          weightsSum: r.weightsSum,
          updatedAt: r.updatedAt ? String(r.updatedAt) : null,
        }))}
      />
    </div>
  );
}
