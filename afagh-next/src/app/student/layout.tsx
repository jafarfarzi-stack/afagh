import { requireRole } from '@/lib/auth';
import { logoutAction } from '../login/actions';
import StudentNav from './StudentNav';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['STUDENT']);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-50 shadow-xl border-x border-slate-100">
      <header className="flex items-center justify-between bg-emerald-700 p-4 text-white shadow-sm">
        <div>
          <p className="text-sm font-bold">داشبورد دانشجو</p>
          <p className="text-xs opacity-85">{user.name}</p>
        </div>
        <form action={logoutAction}>
          <button className="text-xs underline bg-emerald-800/60 hover:bg-emerald-800 px-2.5 py-1 rounded-md transition-colors">
            خروج
          </button>
        </form>
      </header>
      <main className="flex-1 p-4 pb-24">{children}</main>
      {/* نوار ناوبری پایین با ۴ بخش تفکیک‌شده */}
      <StudentNav />
    </div>
  );
}
