'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PORTAL_THEME, type NavGroup, type PortalSurface } from '@/lib/portal-nav';

/**
 * سایدبارِ مشترکِ سه کارتابل — **تنها** جزیرهٔ کلاینتِ ناوبری (برای `usePathname`).
 *
 * چرا این‌جا: کارتابل استاد در دسکتاپ هیچ ناوبری نداشت، مدیر گروه نوارِ قرصیِ
 * بریده داشت و سایدبار دانشجو زیر سربرگِ چسبان می‌رفت. این پوسته همان الگوی
 * سایدبارِ پنل مدیریت است (`lg:w-64 xl:w-72` + `sticky top-[6.5rem]` + اسکرولِ
 * داخلی) تا هر سه کارتابل یک رفتار داشته باشند.
 *
 * CSS-only و بدون وابستگیِ تازه: نه جست‌وجو، نه جمع‌شدن، نه localStorage. زیر
 * `lg` کاملاً پنهان است؛ ناوبریِ موبایل همان نوار پایین/شیتِ هر کارتابل مانده.
 *
 * تطبیقِ مقصد فعال: بلندترین پیشوند برنده است تا در `/professor/grades/123`
 * ردیفِ «نمرات» روشن بماند و نه «داشبورد». اسلشِ پایانی قبل از مقایسه حذف
 * می‌شود و مقصدهای `exact` فقط با برابریِ کامل فعال می‌شوند.
 */

const strip = (href: string) => (href.length > 1 ? href.replace(/\/+$/, '') : href);

export default function PortalNav({
  groups,
  surface,
  help,
}: {
  groups: NavGroup[];
  surface: PortalSurface;
  /** لینکِ راهنمای کارتابل (اختیاری) — همان لینکی که در شیتِ موبایل هست. */
  help?: { href: string; label: string };
}) {
  const th = PORTAL_THEME[surface];
  const pathname = strip(usePathname());

  const activeHref = groups
    .flatMap(g => g.items)
    .filter(it => {
      const href = strip(it.href);
      return it.exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');
    })
    .map(it => strip(it.href))
    .sort((a, b) => b.length - a.length)[0];

  const itemBase =
    'group relative flex min-h-[44px] items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] leading-5 ui-t ' +
    'focus-visible:outline-none focus-visible:ring-2';

  return (
    <aside
      className={`hidden lg:flex lg:flex-col lg:w-64 xl:w-72 lg:shrink-0 lg:sticky lg:top-[6.5rem] lg:max-h-[calc(100dvh-8rem)] lg:overflow-hidden lg:rounded-2xl lg:border lg:shadow-e1 bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-100 print:hidden ${th.border}`}
    >
      {/* سربرگ — نوارِ رنگیِ همان لهجهٔ کارتابل (نیلی/فیروزه‌ای/زمردی) */}
      <div className={`flex shrink-0 items-center justify-between gap-2 border-b border-black/10 px-3 py-2.5 dark:border-white/10 ${th.panel}`}>
        <p className="flex min-w-0 items-center gap-2 text-[13px] font-extrabold">
          <span aria-hidden className="text-sm leading-none">🧭</span>
          <span className="truncate">{th.sheetTitle}</span>
        </p>
      </div>

      <nav
        aria-label={th.navLabel}
        className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden overscroll-contain px-2 py-2"
      >
        {groups.map((group, groupIndex) => (
          <div key={group.key}>
            <p
              className={`mb-1 px-2.5 pb-1 text-3xs font-black uppercase tracking-wider ${th.muted} ${
                groupIndex > 0
                  ? 'mt-2 border-t border-slate-200/80 pt-2 dark:border-slate-700/70'
                  : 'mt-1'
              }`}
            >
              {group.title}
            </p>
            {group.items.map(it => {
              const active = activeHref === strip(it.href);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  prefetch={false}
                  title={it.label}
                  aria-current={active ? 'page' : undefined}
                  className={`${itemBase} ${th.focus} ${active ? `${th.active} ring-1 ring-inset` : th.hover}`}
                >
                  {active && (
                    <span
                      aria-hidden
                      className={`pointer-events-none absolute inset-y-1.5 start-0 w-[3px] rounded-full ${th.accent}`}
                    />
                  )}
                  <span
                    aria-hidden
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[13px] leading-none ring-1 ring-inset ${
                      active ? th.tileActive : th.tile
                    }`}
                  >
                    {it.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {help && (
        <div className={`shrink-0 border-t p-2 ${th.border}`}>
          <Link
            href={help.href}
            prefetch={false}
            className={`${itemBase} ${th.focus} font-bold ${th.hover}`}
          >
            <span
              aria-hidden
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[13px] leading-none ring-1 ring-inset ${th.tile}`}
            >
              📖
            </span>
            <span className="min-w-0 flex-1 truncate">{help.label}</span>
          </Link>
        </div>
      )}
    </aside>
  );
}
