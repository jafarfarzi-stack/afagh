'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const NAV_ITEMS = [
  { href: '/student', label: 'داشبورد هوشمند', icon: '📊', exact: true },
  { href: '/student/enroll', label: 'انتخاب واحد', icon: '🛒', exact: false, badge: 'Redis' },
  { href: '/student/exam-card', label: 'کارت آزمون و صندلی', icon: '📇', exact: false },
  { href: '/student/transcript', label: 'کارنامه کل دوره‌ها', icon: '📜', exact: false },
  { href: '/student/finance', label: 'امور مالی و شهریه', icon: '💳', exact: false },
  { href: '/student/virtual-classes', label: 'کلاس آنلاین و LMS', icon: '💻', exact: false, badge: 'BBB' },
  { href: '/student/schedule', label: 'برنامه هفتگی و آزمون', icon: '📅', exact: false },
  { href: '/student/chart', label: 'چارت مصوب سرفصل', icon: '🗺️', exact: false },
  { href: '/student/requests', label: 'میز خدمات و کمیسیون', icon: '📋', exact: false },
  { href: '/student/documents', label: 'مدارک و بایگانی', icon: '📁', exact: false },
  { href: '/student/graduation', label: 'فارغ‌التحصیلی من', icon: '🎓', exact: false },
  { href: '/student/thesis-proposal', label: 'پایان‌نامه و پروپوزال من', icon: '🔬', exact: false },
];

/** مقصدهای نوار پایین موبایل — حداکثر ۵ مقصد پرتکرار + دکمهٔ منو.
 *  «کارت آزمون» از منوی کامل قابل دسترس است؛ جایش دسترسی سریع
 *  «میز خدمات و کمیسیون» آمده چون درخواست‌ها پرتکرارترند. */
const BOTTOM_TAB_HREFS = ['/student', '/student/enroll', '/student/requests', '/student/transcript', '/student/finance'];

/** برچسب نوار پایین — نام کامل خدمت (پیش‌تر فقط کلمهٔ اول بریده می‌شد:
 *  «انتخاب»، «امور»، «میز» که نامخدمت را نامفهوم می‌کرد) */
const TAB_LABELS: Record<string, string> = {
  '/student': 'داشبورد',
  '/student/enroll': 'انتخاب واحد',
  '/student/requests': 'میز خدمات',
  '/student/transcript': 'کارنامه',
  '/student/finance': 'امور مالی',
};

export default function StudentNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (n: (typeof NAV_ITEMS)[number]) =>
    n.exact ? pathname === n.href : pathname.startsWith(n.href);

  return (
    <>
      {/* ⚡ نوار پایین بدون backdrop-blur (بلور روی المان fixed = عامل اصلی تأخیر
          لمسی در موبایل) + touch-action:manipulation برای پاسخ فوری تب‌ها */}
      <nav
        className="ui-bottom-nav lg:hidden fixed inset-x-0 bottom-0 z-50 pb-[env(safe-area-inset-bottom,0px)] print:hidden"
        style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
        aria-label="ناوبری اصلی دانشجو"
      >
        <div className="max-w-md mx-auto flex items-center justify-around py-1.5 px-1">
          {BOTTOM_TAB_HREFS.map(href => NAV_ITEMS.find(n => n.href === href))
            .filter((n): n is (typeof NAV_ITEMS)[number] => !!n)
            .map(n => {
            const active = isActive(n);
            return (
              <Link prefetch={false}
                key={n.href}
                href={n.href}
                style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[2.75rem] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 transition-all active:scale-95 ${
                  active
                    ? 'bg-emerald-50 text-emerald-800 font-extrabold border border-emerald-200/70 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 active:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                <span className="text-base">{n.icon}</span>
                <span className="text-3xs leading-tight line-clamp-2 text-center min-h-[24px] flex items-center">
                  {TAB_LABELS[n.href] ?? n.label}
                </span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="باز کردن منوی کامل"
            className="flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-all"
          >
            <span className="text-base leading-none">☰</span>
            <span className="text-3xs leading-tight">منو</span>
          </button>
        </div>
      </nav>

      {open && (
        <div className="lg:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="منوی دانشجو">
          <div className="absolute inset-0 bg-slate-950/50" onClick={() => setOpen(false)} />
          <aside className="absolute bottom-0 inset-x-0 max-h-[82vh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl flex flex-col pb-[env(safe-area-inset-bottom,0px)]">
            <div aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
            <div className="flex items-center justify-between p-4 border-b border-slate-100 sticky top-0 bg-white">
              <p className="font-extrabold text-slate-900">منوی دانشجو</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="بستن منو"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-xl leading-none text-slate-500 hover:bg-slate-100"
              >
                ×
              </button>
            </div>
            <div className="p-2 space-y-1">
              {NAV_ITEMS.map(n => {
                const active = isActive(n);
                return (
                  <Link prefetch={false}
                    key={n.href}
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl font-bold transition-all ${
                      active
                        ? 'bg-emerald-700 text-white shadow-md'
                        : 'text-slate-700 hover:text-slate-950 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">{n.icon}</span>
                      <span>{n.label}</span>
                    </div>
                    {n.badge && (
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-black ${
                          active ? 'bg-emerald-900 text-emerald-100' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {n.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
              <Link prefetch={false}
                href="/help/student"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:text-emerald-800 hover:bg-emerald-50 transition"
              >
                <div className="flex items-center gap-2.5">
                  <span>📖</span>
                  <span>راهنمای دانشجو</span>
                </div>
                <span className="text-3xs bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">راهنما</span>
              </Link>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
