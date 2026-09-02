import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { logoutAction } from '../login/actions';

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
          <Link href="/admin/admissions" className="px-3 py-1.5 rounded-lg hover:bg-indigo-900/70 bg-indigo-900/40 border border-indigo-700/50 transition-colors whitespace-nowrap">
            📥 پذیرش سنجش و فرمول‌ساز
          </Link>
          <Link href="/admin/curriculum" className="px-3 py-1.5 rounded-lg hover:bg-indigo-900/70 transition-colors whitespace-nowrap">
            📚 کاتالوگ و سرفصل رشته‌ها
          </Link>
          <Link href="/admin/regulations" className="px-3 py-1.5 rounded-lg hover:bg-indigo-900/70 bg-indigo-900/40 border border-indigo-700/50 transition-colors whitespace-nowrap">
            ⚖️ مرکز مدیریت آیین‌نامه‌ها
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
          <Link href="/admin/student-cards" className="px-3 py-1.5 rounded-lg hover:bg-indigo-900/70 bg-indigo-900/40 border border-indigo-700/50 transition-colors whitespace-nowrap">
            🪪 کارت دانشجویی
          </Link>
          <Link href="/admin/short-courses" className="px-3 py-1.5 rounded-lg hover:bg-indigo-900/70 bg-indigo-900/40 border border-indigo-700/50 transition-colors whitespace-nowrap">
            🏆 آموزش‌های آزاد و گواهینامه‌ها
          </Link>
          <Link href="/admin/workflows" className="px-3 py-1.5 rounded-lg hover:bg-indigo-900/70 bg-indigo-900/60 border border-indigo-700/50 transition-colors whitespace-nowrap">
            🔀 فرآیندها، SLA و کارتابل (BPM)
          </Link>
          <Link href="/admin/bi" className="px-3 py-1.5 rounded-lg hover:bg-indigo-900/70 bg-indigo-900/60 border border-indigo-700/50 transition-colors whitespace-nowrap">
            📊 هوش تجاری ارزشیابی (BI)
          </Link>
          <Link href="/admin/permissions" className="px-3 py-1.5 rounded-lg hover:bg-indigo-900/70 bg-indigo-900/60 border border-indigo-700/50 transition-colors whitespace-nowrap">
            🛡️ ماتریس دسترسی‌ها (RBAC)
          </Link>
          <Link href="/admin/graduation" className="px-3 py-1.5 rounded-lg hover:bg-indigo-900/70 bg-indigo-900/40 border border-indigo-700/50 transition-colors whitespace-nowrap">
            🎓 فارغ‌التحصیلی و مدارک
          </Link>
          <Link href="/admin/migration" className="px-3 py-1.5 rounded-lg hover:bg-indigo-900/70 bg-indigo-900/40 border border-indigo-700/50 transition-colors whitespace-nowrap">
            🔄 انتقال داده از سیستم قدیمی
          </Link>
          <Link href="/admin/settings" className="px-3 py-1.5 rounded-lg hover:bg-indigo-900/70 bg-indigo-900/60 border border-indigo-700/50 transition-colors whitespace-nowrap">
            ⚙️ پیکربندی سامانه
          </Link>
          <Link href="/manual" className="px-3 py-1.5 rounded-lg hover:bg-emerald-800/80 bg-emerald-700/70 border border-emerald-500/50 text-white font-bold transition-colors whitespace-nowrap">
            📖 راهنمای کاربری و PDF
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-3 sm:p-5 pb-16">{children}</main>
    </div>
  );
}
