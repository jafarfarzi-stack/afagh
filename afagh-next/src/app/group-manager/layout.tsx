import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { logoutAction } from '../login/actions';

export default async function GroupManagerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['DEP_HEAD']);
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-teal-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 p-4">
          <div>
            <p className="font-bold">پنل مدیر گروه</p>
            <p className="text-xs opacity-70">{user.name} · نقش‌ها: {user.roles.join('، ')}</p>
          </div>
          <form action={logoutAction}><button className="text-xs underline opacity-70">خروج</button></form>
        </div>
        <nav className="mx-auto flex max-w-6xl flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-sm">
          <Link href="/group-manager/courses" className="hover:underline">دروس گروه</Link>
          <Link href="/group-manager/offerings" className="hover:underline">ارائه‌های ترم</Link>
          <Link href="/group-manager/classrooms" className="hover:underline">کلاس‌ها</Link>
          {user.roles.includes('ADMIN') && <Link href="/admin" className="hover:underline">کارتابل مدیر</Link>}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-4">{children}</main>
    </div>
  );
}
