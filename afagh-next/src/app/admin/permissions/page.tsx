import { requireRole } from '@/lib/auth';
import AdminPermissionsClient from './AdminPermissionsClient';
import { getPermissionsWorkspaceAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminPermissionsPage() {
  await requireRole(['ADMIN']);
  const workspace = await getPermissionsWorkspaceAction();

  if (!workspace.ok) {
    return (
      <div dir="rtl" className="bg-white rounded-2xl shadow-sm border border-rose-200 p-6 max-w-xl mx-auto text-center space-y-2">
        <div className="text-2xl">⚠️</div>
        <h2 className="font-extrabold text-slate-900">بارگذاری ماتریس دسترسی‌ها ناموفق بود</h2>
        <p className="text-xs text-slate-600 font-bold">{workspace.error}</p>
      </div>
    );
  }

  return <AdminPermissionsClient initial={workspace.data} />;
}
