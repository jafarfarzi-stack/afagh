'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { navModules } from '@/lib/admin-modules';

/**
 * ناوبری افقی کارتابل مدیریت — فقط نقش‌های مجاز.
 * روی خود صفحهٔ داشبورد (/admin) پنهان می‌شود چون شبکهٔ کارت‌ها همان
 * ناوبری است؛ در زیرصفحه‌ها برای جابه‌جایی سریع می‌ماند.
 */
export default function AdminNav({ roles }: { roles: string[] }) {
  const pathname = usePathname();
  if (pathname === '/admin') return null;

  return (
    <nav className="mx-auto flex max-w-6xl flex-wrap gap-2 sm:gap-x-3 gap-y-1.5 px-4 pb-2.5 text-xs sm:text-sm font-medium">
      <Link
        href="/admin"
        className="px-3 py-1.5 rounded-lg bg-indigo-900/60 border border-indigo-700/50 hover:bg-indigo-900 transition-colors whitespace-nowrap"
      >
        🏠 داشبورد
      </Link>
      {navModules(roles).map(m => (
        <Link
          key={m.href}
          href={m.href}
          className="px-3 py-1.5 rounded-lg hover:bg-indigo-900/70 transition-colors whitespace-nowrap"
        >
          {m.icon} {m.title}
        </Link>
      ))}
      <Link
        href="/manual"
        className="px-3 py-1.5 rounded-lg hover:bg-emerald-800/80 bg-emerald-700/70 border border-emerald-500/50 text-white font-bold transition-colors whitespace-nowrap"
      >
        📖 راهنمای کاربری و PDF
      </Link>
    </nav>
  );
}
