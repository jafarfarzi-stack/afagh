import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { alumniOf } from '@/lib/alumni';
import { logoutAction } from '../login/actions';

export const dynamic = 'force-dynamic';

// پورتال دانش‌آموختگان — ناحیهٔ ایزولهٔ چهارم سامانه
export default async function AlumniLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['STUDENT']);
  const me = await alumniOf(user.id);
  if (!me) redirect('/student');

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col" dir="rtl">
      <header className="bg-indigo-900 text-white shadow-md sticky top-0 z-40 print:hidden">
        <div className="max-w-6xl mx-auto flex items-center justify-between p-3.5 px-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-700 flex items-center justify-center font-bold text-base shadow-inner">آ</div>
            <div>
              <p className="text-sm font-extrabold tracking-wide">پورتال دانش‌آموختگان دانشگاه آفاق</p>
              <p className="text-xs text-indigo-200">{me.fullName} — {me.majorName ?? '—'} / {me.degreeTitle ?? '—'}</p>
            </div>
          </div>
          <form action={logoutAction}>
            <button className="text-xs bg-indigo-950/90 hover:bg-black text-indigo-100 border border-indigo-700/60 px-3 py-1.5 rounded-lg font-medium">
              خروج از حساب
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto p-4">{children}</main>
      <footer className="text-center text-[11px] text-slate-400 py-4">
        ارتباط شما با دانشگاه پس از فراغت از تحصیل قطع نمی‌شود.
      </footer>
    </div>
  );
}
