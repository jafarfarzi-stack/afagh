'use client';

import { useRouter } from 'next/navigation';
import { clearTourState, HOME_PATH, type Surface } from './tour-steps';

/**
 * دکمهٔ «نمایش دوبارهٔ تور آشنایی» — در صفحهٔ راهنما.
 *
 * کلید نسخهٔ تور را پاک می‌کند و با `?tour=1` به صفحهٔ اولِ همان کارتابل
 * برمی‌گردد؛ `RoleTour` با دیدن این پارامتر، تور را بدون توجه به وضعیت ذخیره‌شده
 * اجرا می‌کند. پنجرهٔ راهنما بسته می‌شود و مسیر عوض می‌شود، پس کاربر دقیقاً
 * همان چیزی را می‌بیند که بار اول دیده بود.
 */
export default function TourReplayButton({
  surface,
  className,
}: {
  surface: Surface;
  className?: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        clearTourState(surface);
        router.push(`${HOME_PATH[surface]}?tour=1`);
      }}
      className={
        className ??
        'inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-2xs font-black text-indigo-700 shadow-sm transition-colors hover:border-indigo-400 hover:bg-indigo-50'
      }
    >
      <span aria-hidden>🎬</span>
      نمایش دوبارهٔ تور آشنایی
    </button>
  );
}
