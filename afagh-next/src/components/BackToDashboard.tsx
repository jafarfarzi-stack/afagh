'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * دکمهٔ «بازگشت به داشبورد/کارتابل» — در همهٔ زیرصفحه‌های هر پنل.
 *
 * چرا کامپوننت کلاینت است؟ چیدمان (layout) در App Router مسیر جاری را نمی‌بیند،
 * پس نمی‌تواند بداند کاربر روی ریشهٔ پنل است یا داخل یک ماژول. با `usePathname`
 * همین یک قطعه در layout هر پنل گذاشته می‌شود و روی **همهٔ** زیرصفحه‌ها ظاهر
 * می‌گردد — بدون نیاز به تکرار در ده‌ها `page.tsx`.
 *
 * روی ریشهٔ همان پنل (`/admin`، `/professor`، `/student`) رندر نمی‌شود، چون
 * دکمهٔ «بازگشت به جایی که همین‌جا هستید» بی‌معناست.
 */
export default function BackToDashboard({
  href,
  label = 'بازگشت به داشبورد',
  className = '',
  wrapClassName = 'mb-2',
}: {
  /** ریشهٔ پنل — مثلاً `/admin` */
  href: string;
  label?: string;
  /** کلاس خودِ لینک (برای هم‌رنگ شدن با تم هر پنل) */
  className?: string;
  /** کلاس ظرف بیرونی (فاصله/چیدمان) */
  wrapClassName?: string;
}) {
  const pathname = usePathname();
  // ریشه یا هر مسیری که به آن برمی‌گردیم → دکمه لازم نیست
  if (pathname === href) return null;

  return (
    <div className={`print:hidden ${wrapClassName}`}>
      <Link
        href={href}
        className={
          className ||
          'inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 shadow-xs transition hover:border-indigo-300 hover:text-indigo-700'
        }
      >
        <span aria-hidden>→</span>
        {label}
      </Link>
    </div>
  );
}
