'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type TabItem = { href: string; label: string; icon?: string; exact?: boolean };

/**
 * نوار پایین موبایل (Bottom tab) — ۳ تا ۵ مقصد اصلی برای دسترسی سریع با شست
 * (الگوی Material Design 3 + توصیهٔ NN/g به ناوبری مرکب). فقط روی موبایل
 * (md:hidden) نمایش داده می‌شود؛ دسکتاپ منوی افقی خودش را نگه می‌دارد.
 */
export default function MobileTabBar({
  items,
  activeClass = 'text-indigo-700',
}: {
  items: TabItem[];
  activeClass?: string;
}) {
  const pathname = usePathname();
  return (
    <nav
      dir="rtl"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 shadow-[0_-2px_16px_rgba(0,0,0,0.06)] print:hidden"
      aria-label="ناوبری اصلی موبایل"
    >
      <div className="max-w-md mx-auto flex items-stretch justify-around px-1 py-1">
        {items.map(it => {
          const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors ${
                active ? `${activeClass} font-bold` : 'text-slate-500'
              }`}
            >
              {it.icon && <span className="text-base leading-none">{it.icon}</span>}
              <span className="text-[11px] leading-tight text-center">{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
