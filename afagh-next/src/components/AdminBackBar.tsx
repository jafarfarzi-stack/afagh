'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { resolveBackTarget } from '@/lib/admin-back';
import { BACK_BTN_CLASS, BACK_HOME_CLASS } from '@/lib/back-button';

/**
 * نوارِ «بازگشت به کارتابل» برای شاخهٔ مدیریت — **دو سطحی**.
 *
 * چرا دو سطحی؟ کارتابل‌های کارشناسی خودشان زیرصفحه دارند
 * (`/admin/finance/pos`، `/admin/exams/handover`، `/admin/scheduling/…`).
 * پیش‌تر تنها دکمهٔ بازگشت به `/admin` (داشبورد کل) می‌رفت؛ یعنی کارشناسی که
 * داخل زیرصفحهٔ کارتابل مالی بود، با یک کلیک کارتابل خودش را هم از دست می‌داد
 * و باید از منو دوباره «مالی» را باز می‌کرد. کاربر این را «در اکثر کارتابل‌های
 * کارشناسان اعمال نشده» توصیف کرد.
 *
 * فهرست ماژول‌ها از `ADMIN_MODULES` می‌آید (منبع واحد حقیقت) تا با تغییر منو
 * این نوار هم خودکار به‌روز شود و لازم نباشد در ۶۰+ صفحه دستی لینک بگذاریم.
 * منطق محاسبهٔ هدف در `lib/admin-back.ts` است تا تست‌پذیر باشد.
 */
export default function AdminBackBar({
  modules,
  homeHref = '/admin',
  homeLabel = 'داشبورد مدیریت',
}: {
  /** فهرست ماژول‌های مجازِ همین کاربر — `{href, title}` */
  modules: { href: string; title: string }[];
  homeHref?: string;
  homeLabel?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  let target = resolveBackTarget(pathname, modules, homeHref, homeLabel);
  // صفحات تک‌گزارش زیر /admin/reports/[id] وقتی با scope=finance باز می‌شوند
  // باید به مرکز گزارش‌های مالی برگردند، نه مرکز گزارش‌های آموزشی.
  if (pathname?.startsWith('/admin/reports/') && searchParams.get('scope') === 'finance') {
    const fin = modules.find((m) => m.href === '/admin/finance/reports');
    target = { href: '/admin/finance/reports', title: fin?.title ?? 'مرکز گزارش‌های مالی', isHome: false };
  }
  // روی خودِ داشبورد، «بازگشت به داشبورد» معنا ندارد
  if (!target) return null;

  return (
    <div className="mb-2 flex flex-wrap items-center justify-end gap-1.5 print:hidden">
      {/* 📍 سمت چپ صفحه — سامانه RTL است، پس justify-end = لبهٔ چپ.
          میان‌بر داشبورد اول می‌آید تا در چیدمان راست‌به‌چپ، دکمهٔ اصلی
          («بازگشت به کارتابل») دورترین عنصر در سمت چپ باشد. */}
      {!target.isHome && (
        <Link
          href={homeHref}
          title={homeLabel}
          prefetch={false}
          className={BACK_HOME_CLASS}
        >
          <span aria-hidden>🏠</span>
          {homeLabel}
        </Link>
      )}

      <Link
        href={target.href}
        title={`بازگشت به ${target.title}`}
        prefetch={false}
        className={BACK_BTN_CLASS}
      >
        <span aria-hidden>→</span>
        بازگشت به {target.title}
      </Link>
    </div>
  );
}
