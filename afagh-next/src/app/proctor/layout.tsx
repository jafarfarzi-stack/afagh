import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { logoutAction } from '../login/actions';

export default async function ProctorLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['PROCTOR', 'VAULT_MANAGER', 'ADMIN', 'EDU_EXPERT', 'PROFESSOR']);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white shadow-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between p-3.5 px-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center font-black text-sm shadow-inner">
              آ
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-extrabold text-sm tracking-wide">سامانه هوشمند مراقبین آزمون دانشگاه آفاق</p>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-500/80 text-white">
                  پرتال مراقب
                </span>
              </div>
              <p className="text-xs text-slate-400">{user.name} · نقش: مراقب آزمون و کادر اجرایی</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user.roles.includes('ADMIN') && (
              <Link
                href="/admin/exams"
                className="text-xs bg-indigo-900/90 hover:bg-indigo-800 text-indigo-200 border border-indigo-700/60 px-3 py-1.5 rounded-lg transition-colors font-bold"
              >
                مدیریت امتحانات ←
              </Link>
            )}
            <form action={logoutAction}>
              <button className="text-xs bg-rose-900/80 hover:bg-rose-900 text-rose-200 border border-rose-700/60 px-3 py-1.5 rounded-lg transition-colors font-medium">
                خروج
              </button>
            </form>
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-2 sm:gap-4 px-4 pb-2.5 text-xs sm:text-sm font-medium overflow-x-auto">
          <Link href="/proctor" className="px-3 py-1.5 rounded-lg bg-indigo-800/80 text-white border border-indigo-600/50 transition-colors whitespace-nowrap">
            📷 حضور و غیاب آزمون با QR-Code
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-3 sm:p-5 pb-16">{children}</main>
    </div>
  );
}
