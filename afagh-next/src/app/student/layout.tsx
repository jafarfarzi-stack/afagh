import { requireRole } from '@/lib/auth';
import { logoutAction } from '../login/actions';
import StudentNav from './StudentNav';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['STUDENT']);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* هدر اصلی */}
      <header className="bg-emerald-800 text-white shadow-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto flex items-center justify-between p-3.5 px-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center font-bold text-base shadow-inner">
              آ
            </div>
            <div>
              <p className="text-sm font-extrabold tracking-wide">سامانه جامع آموزشی دانشگاه آفاق</p>
              <p className="text-xs text-emerald-200">داشبورد دانشجویی — {user.name}</p>
            </div>
          </div>
          <form action={logoutAction}>
            <button className="text-xs bg-emerald-900/80 hover:bg-emerald-950 text-emerald-100 border border-emerald-700/50 px-3 py-1.5 rounded-lg transition-colors font-medium">
              خروج از حساب
            </button>
          </form>
        </div>
      </header>

      {/* بدنه اصلی صفحات */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-3 sm:p-5 pb-24">{children}</main>

      {/* نوار ناوبری پایین */}
      <StudentNav />
    </div>
  );
}
