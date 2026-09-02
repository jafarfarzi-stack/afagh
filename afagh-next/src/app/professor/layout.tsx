import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { electronic_documents } from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';
import { logoutAction } from '../login/actions';

export default async function ProfessorLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['PROFESSOR']);
  const me = await getStaffByUser(user.id);
  const pending = me ? await db.select({ id: electronic_documents.id }).from(electronic_documents).where(eq(electronic_documents.staffId, me.id)) : [];
  const pendingCount = pending.length;

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <header className="bg-slate-900 text-white shadow-md border-b border-slate-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center font-black text-sm text-white shadow">
              آفاق
            </div>
            <div>
              <p className="font-extrabold text-sm sm:text-base">کارتابل جامع اعضای هیئت علمی و اساتید</p>
              <p className="text-xs text-slate-400">{user.name || 'دکتر جمیل احمدی'}{me ? ' · کد پرسنلی: ' + me.staffCode : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <form action={logoutAction}>
              <button className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-slate-300 hover:text-white transition">
                خروج از سامانه
              </button>
            </form>
          </div>
        </div>

        {/* Navigation Bar */}
        <nav className="mx-auto flex max-w-6xl gap-1.5 px-4 pb-3 text-xs flex-wrap items-center">
          <Link
            href="/professor"
            className="px-3 py-1.5 rounded-xl font-bold transition hover:bg-white/10 text-slate-200"
          >
            🏠 داشبورد و کلاس‌ها
          </Link>
          <Link
            href="/professor/schedule"
            className="px-3 py-1.5 rounded-xl font-bold transition hover:bg-white/10 text-slate-200"
          >
            🗓️ برنامه هفتگی تدریس
          </Link>
          <Link
            href="/professor/attendance"
            className="px-3 py-1.5 rounded-xl font-bold transition hover:bg-white/10 text-slate-200"
          >
            📋 ثبت حضور و غیاب
          </Link>
          <Link
            href="/professor/grades"
            className="px-3 py-1.5 rounded-xl font-bold transition hover:bg-white/10 text-slate-200"
          >
            📝 بارم‌بندی و ثبت نمرات
          </Link>
          <Link
            href="/professor/availability"
            className="px-3 py-1.5 rounded-xl font-bold transition bg-amber-400 text-slate-950 hover:bg-amber-300 shadow-xs"
          >
            🗓️ اعلام ساعات حضور ترم
          </Link>
          <Link
            href="/professor/performance"
            className="px-3 py-1.5 rounded-xl font-bold transition hover:bg-white/10 text-slate-200"
          >
            📊 کارنامه عملکرد و ارزیابی
          </Link>
          <Link
            href="/professor/evaluation"
            className="px-3 py-1.5 rounded-xl font-bold transition hover:bg-white/10 text-slate-200"
          >
            📈 کارنامه ارزشیابی دانشجویان
          </Link>
          <Link
            href="/professor/contract"
            className="px-3 py-1.5 rounded-xl font-bold transition hover:bg-white/10 text-slate-200"
          >
            📑 فرم قرارداد حق‌التدریس
          </Link>
          <Link
            href="/professor/documents"
            className="px-3 py-1.5 rounded-xl font-bold transition hover:bg-white/10 text-slate-200"
          >
            اسناد و امضا {pendingCount > 0 && <span className="mr-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black text-slate-900">{pendingCount}</span>}
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl p-4 sm:p-6">{children}</main>
    </div>
  );
}
