import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { logoutAction } from '../login/actions';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['ADMIN', 'EDU_EXPERT', 'ARCHIVE_EXPERT']);
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-indigo-950 text-white shadow-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between p-3.5 px-4">
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
        <nav className="mx-auto flex max-w-6xl gap-2 sm:gap-4 px-4 pb-2.5 text-xs sm:text-sm font-medium overflow-x-auto">
          <Link href="/admin" className="px-3 py-1.5 rounded-lg hover:bg-indigo-900/70 transition-colors whitespace-nowrap">
            📋 کارتابل گردش کار و جبرانی
          </Link>
          <Link href="/admin/students" className="px-3 py-1.5 rounded-lg hover:bg-indigo-900/70 transition-colors whitespace-nowrap">
            🎓 پرونده جامع دانشجویان و پرسنل
          </Link>
          <Link href="/admin/curriculum" className="px-3 py-1.5 rounded-lg hover:bg-indigo-900/70 transition-colors whitespace-nowrap">
            📚 کاتالوگ و سرفصل رشته‌ها
          </Link>
          <Link href="/admin/scheduling" className="px-3 py-1.5 rounded-lg hover:bg-indigo-900/70 transition-colors whitespace-nowrap">
            🗓️ برنامه‌ریزی درسی مدیر گروه
          </Link>
          <Link href="/admin/exams" className="px-3 py-1.5 rounded-lg hover:bg-indigo-900/70 transition-colors whitespace-nowrap">
            📝 مدیریت و برنامه‌ریزی امتحانات
          </Link>
          <Link href="/admin/templates" className="px-3 py-1.5 rounded-lg hover:bg-indigo-900/70 bg-indigo-900/60 border border-indigo-700/50 transition-colors whitespace-nowrap">
            📨 قالب‌های پیامک و ارتباطات
          </Link>
          <Link href="/admin/archive" className="px-3 py-1.5 rounded-lg hover:bg-indigo-900/70 transition-colors whitespace-nowrap">
            🗄️ بایگانی الکترونیک مدارک
          </Link>
          <Link href="/admin/payroll" className="px-3 py-1.5 rounded-lg hover:bg-indigo-900/70 transition-colors whitespace-nowrap">
            💼 حقوق و دستمزد
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-3 sm:p-5 pb-16">{children}</main>
    </div>
  );
}
