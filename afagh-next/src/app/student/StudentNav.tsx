'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const NAV_ITEMS = [
  { href: '/student', label: 'داشبورد هوشمند', icon: '📊', exact: true },
  { href: '/student/enroll', label: 'انتخاب واحد', icon: '🛒', exact: false, badge: 'Redis' },
  { href: '/student/exam-card', label: 'کارت آزمون و صندلی', icon: '📇', exact: false },
  { href: '/student/transcript', label: 'کارنامه کل دوره‌ها', icon: '📜', exact: false },
  { href: '/student/virtual-classes', label: 'کلاس آنلاین و LMS', icon: '💻', exact: false, badge: 'BBB' },
  { href: '/student/schedule', label: 'برنامه هفتگی و آزمون', icon: '📅', exact: false },
  { href: '/student/chart', label: 'چارت مصوب سرفصل', icon: '🗺️', exact: false },
  { href: '/student/requests', label: 'میز خدمات و کمیسیون', icon: '📋', exact: false },
  { href: '/student/documents', label: 'مدارک و بایگانی', icon: '📁', exact: false },
];

export function StudentSidebar({ user }: { user: { name: string } }) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col w-64 lg:w-72 bg-white border-l border-slate-200 shadow-xs shrink-0 min-h-[calc(100vh-65px)] sticky top-[65px] self-start print:hidden">
      {/* Student Profile Quick Tile */}
      <div className="p-4 border-b border-slate-100 bg-slate-50/70">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center font-black text-lg shadow-xs">
            {user.name.slice(0, 1) || 'د'}
          </div>
          <div className="overflow-hidden">
            <h3 className="font-black text-slate-900 text-xs sm:text-sm truncate">{user.name}</h3>
            <p className="text-[11px] text-slate-500 font-mono">شماره دانشجویی: 31412001</p>
          </div>
        </div>
      </div>

      {/* Nav links */}
      <div className="p-3 space-y-1 flex-1 overflow-y-auto text-xs">
        <div className="px-3 py-1 text-[10px] font-black text-slate-400 uppercase tracking-wider">
          منوی دسترسی و خدمات
        </div>
        {NAV_ITEMS.map(n => {
          const isActive = n.exact ? pathname === n.href : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center justify-between px-3 py-2.5 rounded-xl font-bold transition-all ${
                isActive
                  ? 'bg-emerald-700 text-white shadow-md shadow-emerald-700/20 translate-x-1'
                  : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base">{n.icon}</span>
                <span>{n.label}</span>
              </div>
              {n.badge && (
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-black ${
                    isActive ? 'bg-emerald-900 text-emerald-100' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {n.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Manual & Help link */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/50 space-y-1">
        <a
          href="/Afagh_ERP_Comprehensive_User_Manual.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-emerald-800 hover:bg-emerald-50 transition"
        >
          <div className="flex items-center gap-2">
            <span>📖</span>
            <span>کتابچه راهنمای سامانه</span>
          </div>
          <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">PDF</span>
        </a>
      </div>
    </aside>
  );
}

export default function StudentNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] print:hidden">
      <div className="max-w-md mx-auto flex items-center justify-around py-1.5 px-1">
        {NAV_ITEMS.slice(0, 5).map(n => {
          const isActive = n.exact ? pathname === n.href : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all ${
                isActive
                  ? 'bg-emerald-50 text-emerald-800 font-bold shadow-xs border border-emerald-200/60 scale-105'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span className="text-base">{n.icon}</span>
              <span className="text-[10px] leading-tight line-clamp-1">{n.label.split(' ')[0]}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
