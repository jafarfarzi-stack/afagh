import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { logoutAction } from '../login/actions';
import AdminNav from './AdminNav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole([
    'ADMIN',
    'EDU_EXPERT',
    'ARCHIVE_EXPERT',
    'FINANCE_EXPERT',
    'FINANCE',
    'MILITARY_OFFICER',
    'VAULT_MANAGER',
    'DEP_HEAD',
    'VICE_EDU',
  ]);
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-indigo-950 text-white shadow-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 p-3.5 px-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-700 flex items-center justify-center font-bold text-sm shadow-inner">
              آ
            </div>
            <div>
              <p className="font-extrabold text-sm tracking-wide">داشبورد مدیریت جامع دانشگاه آفاق</p>
              <p className="text-xs text-indigo-300">{user.name} · نقش‌ها: {user.roles.join('، ')}</p>
            </div>
          </div>
          <form action={logoutAction}>
            <button className="text-xs bg-indigo-900/80 hover:bg-indigo-900 text-indigo-200 border border-indigo-700/60 px-3 py-1.5 rounded-lg transition-colors font-medium">
              خروج
            </button>
          </form>
        </div>
        <AdminNav roles={user.roles} />
      </header>
      <main className="mx-auto max-w-6xl p-3 sm:p-5 pb-16">{children}</main>
    </div>
  );
}
