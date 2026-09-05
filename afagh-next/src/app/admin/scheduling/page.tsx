import { requireRole } from '@/lib/auth';
import { getSchedulingWorkspaceAction } from './actions';
import DepartmentPlanningClient from './DepartmentPlanningClient';

export const dynamic = 'force-dynamic';

export default async function DepartmentPlanningPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  const workspace = await getSchedulingWorkspaceAction();
  if (!workspace.ok) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-rose-200 p-6 max-w-md text-center space-y-2">
          <div className="text-2xl">⚠️</div>
          <h2 className="font-extrabold text-slate-900">بارگذاری کارتابل برنامه‌ریزی درسی ناموفق بود</h2>
          <p className="text-xs text-slate-600 font-bold">{workspace.error}</p>
        </div>
      </div>
    );
  }
  return <DepartmentPlanningClient initial={workspace} />;
}
