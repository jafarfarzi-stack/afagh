import { requireRole } from '@/lib/auth';
import { getPlanForStudent } from '@/app/professor/lesson-plan/actions';
import PlanView from './PlanView';

export const dynamic = 'force-dynamic';

export default async function StudentLessonPlanPage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  await requireRole(['STUDENT']);
  const { offeringId } = await params;
  const id = Number(offeringId);
  if (!Number.isFinite(id)) {
    return (
      <div className="card p-8 text-center" dir="rtl">
        <p className="font-bold text-slate-600">شناسه ارائه درس نامعتبر است.</p>
      </div>
    );
  }
  const data = await getPlanForStudent(id);
  const view = {
    published: data.published,
    plan: data.plan
      ? {
          id: data.plan.id,
          courseMode: data.plan.courseMode ?? '',
          totalSessions: data.plan.totalSessions,
          objectives: data.plan.objectives ?? '',
          resources: data.plan.resources ?? '',
          status: data.plan.status ?? '',
          submittedAt: data.plan.submittedAt ? data.plan.submittedAt.toISOString() : null,
        }
      : null,
    sessions: (data.sessions ?? []).map(s => ({
      id: s.id,
      sessionNo: s.sessionNo,
      sessionKind: s.sessionKind ?? 'THEORY',
      topic: s.topic ?? '',
      details: s.details ?? null,
    })),
    weights: (data.weights ?? []).map(w => ({
      id: w.id,
      title: w.title,
      percent: Number((w as { percent: number | string }).percent),
    })),
  };
  return (
    <div className="space-y-4" dir="rtl">
      <PlanView offeringId={id} data={view} />
    </div>
  );
}
