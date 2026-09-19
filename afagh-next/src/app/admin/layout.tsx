import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { logoutAction } from '../login/actions';
import AdminNav from './AdminNav';
import UniversitySwitcher from './UniversitySwitcher';
import { getCurrentUniversity, listUniversities, uniTheme } from '@/lib/university-scope';

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
  const unis = await listUniversities();
  const curUni = await getCurrentUniversity();
  const th = uniTheme(curUni.code);
  return (
    <div className="min-h-screen bg-slate-100" data-uni={curUni.code}>
      <header className={`${th.header} text-white shadow-md transition-colors`}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 p-3.5 px-4">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg ${th.badge} flex items-center justify-center font-bold text-sm shadow-inner`}>
              {curUni.title.slice(0, 1)}
            </div>
            <div>
              <p className="font-extrabold text-sm tracking-wide">داشبورد مدیریت جامع {curUni.title}</p>
              <p className="text-xs opacity-80">{user.name} · نقش‌ها: {user.roles.join('، ')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <UniversitySwitcher
              universities={unis.map(u => ({ code: u.code, title: u.title, kind: u.kind }))}
              currentCode={curUni.code}
              buttonClass={th.badge}
            />
            <form action={logoutAction}>
              <button className={`text-xs ${th.soft} border ${th.ring} px-3 py-1.5 rounded-lg transition-colors font-medium`}>
                خروج
              </button>
            </form>
          </div>
        </div>
        <AdminNav roles={user.roles} theme={th} />
      </header>
      <main className="mx-auto max-w-6xl p-3 sm:p-5 pb-16">{children}</main>
    </div>
  );
}
