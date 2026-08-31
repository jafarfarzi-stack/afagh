import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { logoutAction } from '../login/actions';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['ADMIN']);
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-indigo-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between p-4">
          <div>
            <p className="font-bold">داشبورد مدیر</p>
            <p className="text-xs opacity-70">{user.name} · نقش‌ها: {user.roles.join('، ')}</p>
          </div>
          <form action={logoutAction}><button className="text-xs underline opacity-70">خروج</button></form>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-4 px-4 pb-3 text-sm font-medium">
          <Link href="/admin" className="hover:underline">📋 کارتابل گردش کار</Link>
          <Link href="/admin/archive" className="hover:underline">🗄️ پذیرش، ثبت‌نام و بایگانی e-KYC</Link>
          <Link href="/admin/payroll" className="hover:underline">💼 حقوق و دستمزد</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-4">{children}</main>
    </div>
  );
}
