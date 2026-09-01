import { requireRole } from '@/lib/auth';
import { logoutAction } from '../login/actions';
import StudentNav, { StudentSidebar } from './StudentNav';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['STUDENT']);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col" dir="rtl">
      {/* هدر اصلی */}
      <header className="bg-emerald-800 text-white shadow-md sticky top-0 z-40 print:hidden">
        <div className="max-w-7xl mx-auto flex items-center justify-between p-3.5 px-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center font-bold text-base shadow-inner">
              آ
            </div>
            <div>
              <p className="text-sm font-extrabold tracking-wide">سامانه جامع آموزشی دانشگاه آفاق</p>
              <p className="text-xs text-emerald-200">میز کاربری دانشجو — {user.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/Afagh_ERP_Comprehensive_User_Manual.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex text-xs bg-emerald-700/80 hover:bg-emerald-700 text-emerald-100 border border-emerald-600 px-3 py-1.5 rounded-lg transition-colors font-medium items-center gap-1.5"
            >
              <span>📖</span>
              <span>راهنمای سیستم</span>
            </a>
            <form action={logoutAction}>
              <button className="text-xs bg-emerald-900/90 hover:bg-emerald-950 text-emerald-100 border border-emerald-700/60 px-3 py-1.5 rounded-lg transition-colors font-medium">
                خروج از حساب
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* بدنه دو ستونه دسکتاپ: سایدبار سمت راست + محتوای اصلی */}
      <div className="flex-1 max-w-7xl w-full mx-auto flex flex-col md:flex-row">
        {/* سایدبار عمودی سمت راست (دسکتاپ) */}
        <StudentSidebar user={{ name: user.name }} />

        {/* محتوای اصلی صفحه */}
        <main className="flex-1 min-w-0 p-3 sm:p-5 md:p-6 pb-24 md:pb-8">
          {children}
        </main>
      </div>

      {/* نوار ناوبری پایین فقط برای موبایل */}
      <StudentNav />
    </div>
  );
}
