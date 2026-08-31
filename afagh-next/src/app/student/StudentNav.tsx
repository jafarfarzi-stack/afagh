'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function StudentNav() {
  const pathname = usePathname();

  const nav = [
    { href: '/student', label: 'کارنامه کل تحصیلی', icon: '📄', exact: true },
    { href: '/student/enroll', label: 'انتخاب واحد زنده', icon: '🛒', exact: false },
    { href: '/student/requests', label: 'کارتابل و کمیسیون', icon: '📋', exact: false },
    { href: '/student/documents', label: 'مدارک و بایگانی', icon: '📁', exact: false },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
      <div className="max-w-5xl mx-auto flex items-center justify-around py-2 px-3">
        {nav.map(n => {
          const isActive = n.exact ? pathname === n.href : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex flex-col sm:flex-row items-center gap-1 sm:gap-2 px-3 sm:px-4 py-1.5 rounded-xl transition-all ${
                isActive
                  ? 'bg-emerald-50 text-emerald-800 font-bold shadow-sm border border-emerald-200/60'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span className="text-xl sm:text-lg">{n.icon}</span>
              <span className="text-xs sm:text-sm">{n.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
