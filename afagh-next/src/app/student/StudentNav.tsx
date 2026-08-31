'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function StudentNav() {
  const pathname = usePathname();

  const nav = [
    { href: '/student', label: 'کارنامه کل تحصیلی', icon: '📄', exact: true },
    { href: '/student/virtual-classes', label: 'کلاس مجازی (BBB)', icon: '💻', exact: false },
    { href: '/student/enroll', label: 'انتخاب واحد', icon: '🛒', exact: false },
    { href: '/student/schedule', label: 'برنامه هفتگی', icon: '📅', exact: false },
    { href: '/student/exam-card', label: 'کارت آزمون و ارزشیابی', icon: '📇', exact: false },
    { href: '/student/chart', label: 'چارت سرفصل', icon: '🗺️', exact: false },
    { href: '/student/requests', label: 'کارتابل کمیسیون', icon: '📋', exact: false },
    { href: '/student/documents', label: 'مدارک من', icon: '📁', exact: false },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
      <div className="max-w-5xl mx-auto flex items-center justify-around py-2 px-2 sm:px-4">
        {nav.map(n => {
          const isActive = n.exact ? pathname === n.href : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex flex-col sm:flex-row items-center gap-0.5 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl transition-all ${
                isActive
                  ? 'bg-emerald-50 text-emerald-800 font-bold shadow-sm border border-emerald-200/60 scale-105'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span className="text-lg sm:text-base">{n.icon}</span>
              <span className="text-[11px] sm:text-xs leading-tight">{n.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
