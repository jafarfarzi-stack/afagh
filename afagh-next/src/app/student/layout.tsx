import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { logoutAction } from '../login/actions';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['STUDENT']);
  const nav = [
    { href: '/student', label: 'کارنامهٔ من', icon: '📄' },
    { href: '/student/enroll', label: 'انتخاب واحد', icon: '🛒' },
    { href: '/student/documents', label: 'مدارک من', icon: '📁' },
  ];
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-50">
      <header className="flex items-center justify-between bg-emerald-700 p-4 text-white">
        <div>
          <p className="text-sm font-bold">داشبورد دانشجو</p>
          <p className="text-xs opacity-80">{user.name}</p>
        </div>
        <form action={logoutAction}><button className="text-xs underline opacity-80">خروج</button></form>
      </header>
      <main className="flex-1 p-4 pb-24">{children}</main>
      {/* موبایل-محور (سند §۲۶۶۴): نوار پایین ثابت */}
      <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-md justify-around border-t border-slate-200 bg-white py-2">
        {nav.map(n => (
          <Link key={n.href} href={n.href} className="flex flex-col items-center text-xs text-slate-600">
            <span className="text-lg">{n.icon}</span>{n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
