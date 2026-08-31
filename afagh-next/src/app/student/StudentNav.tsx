'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function StudentNav() {
  const pathname = usePathname();

  const nav = [
    { href: '/student', label: 'کارنامه و نمرات', icon: '📄', exact: true },
    { href: '/student/enroll', label: 'انتخاب واحد', icon: '🛒', exact: false },
    { href: '/student/requests', label: 'کارتابل درخواست‌ها', icon: '📋', exact: false },
    { href: '/student/documents', label: 'مدارک من', icon: '📁', exact: false },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-md justify-around border-t border-slate-200 bg-white/95 backdrop-blur py-2 shadow-lg">
      {nav.map(n => {
        const isActive = n.exact ? pathname === n.href : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`flex flex-col items-center justify-center transition-colors px-2 py-1 rounded-lg ${
              isActive ? 'text-emerald-700 font-bold scale-105' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span className="text-xl mb-0.5">{n.icon}</span>
            <span className="text-[11px] leading-tight">{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
