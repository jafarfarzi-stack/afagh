import { requireRole } from '@/lib/auth';
import { getExamWorkspaceAction } from './actions';
import ExamPlanningClient from './ExamPlanningClient';

export const dynamic = 'force-dynamic';

export default async function AdminExamsPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'VAULT_MANAGER']);

  const workspace = await getExamWorkspaceAction();
  if (!workspace.ok) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-rose-200 p-6 max-w-md text-center space-y-2">
          <div className="text-2xl">⚠️</div>
          <h2 className="font-extrabold text-slate-900">بارگذاری کارتابل امتحانات ناموفق بود</h2>
          <p className="text-xs text-slate-600 font-bold">{workspace.error}</p>
        </div>
      </div>
    );
  }

  return <ExamPlanningClient initial={workspace.data} />;
}
