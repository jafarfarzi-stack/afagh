'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import TourOverlay from './TourOverlay';
import { HOME_PATH, TOUR_STEPS, readTourState, writeTourState, type Surface } from './tour-steps';

/**
 * تور آشناییِ نخستین ورود به کارتابل — فقط یک بار (تا نسخهٔ بعدی تور).
 *
 * گیت‌ها (همه پیش از هر رندری):
 *  • فقط صفحهٔ اولِ همان کارتابل (`HOME_PATH`)، نه زیرصفحه‌ها.
 *  • اگر کلید `localStorage` موجود باشد (پیش‌تر دیده/رد شده) هیچ کاری نمی‌کند؛
 *    مگر `?tour=1` که از دکمهٔ «نمایش دوبارهٔ تور» می‌آید.
 *  • با `?tour=0` هرگز اجرا نمی‌شود (برای اسکرین‌شات/پشتیبانی).
 *  • اگر نوار «نسخهٔ کهنه» روی صفحه باشد، تور اجرا نمی‌شود؛ کاربر اول باید
 *    صفحه را بازخوانی کند.
 *  • حساب دمو: تابع آمادهٔ سمت‌کلاینت وجود ندارد (`demo-accounts` سروری است)؛
 *    اگر روزی نشانهٔ `data-demo` روی <html> گذاشته شود، همین‌جا رد می‌شود.
 *
 * کارایی: تا پایان ۶ ثانیه هیچ رندر/لیسنری وجود ندارد — فقط یک `setTimeout`.
 * هیچ polling نیست و لیسنرهای اسکرول/تغییر اندازه تنها هنگام فعال بودن تور در
 * `TourOverlay` نصب و در unmount حذف می‌شوند.
 */

const START_DELAY_MS = 6000;

const hasStaleBanner = () => !!document.querySelector('[data-version-stale]');

export default function RoleTour({ surface }: { surface: Surface }) {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const steps = TOUR_STEPS[surface];
  const total = steps.length;

  useEffect(() => {
    if (pathname !== HOME_PATH[surface]) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get('tour') === '0') return;
    const forced = params.get('tour') === '1';
    if (!forced && readTourState(surface)) return;
    if (hasStaleBanner()) return;
    if (document.documentElement.dataset.demo === '1') return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      // مقصد و شرایط ممکن است در این ۶ ثانیه عوض شده باشند.
      if (hasStaleBanner()) return;
      if (!forced && readTourState(surface)) return;
      if (forced) {
        // پارامتر موقت است؛ آدرس تمیز بماند تا رفرش دوباره تور را باز نکند.
        try {
          window.history.replaceState(null, '', window.location.pathname);
        } catch {
          /* بی‌اثر */
        }
      }
      setIndex(0);
      setActive(true);
    }, START_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pathname, surface]);

  const next = useCallback(() => {
    if (index + 1 >= total) {
      writeTourState(surface, { done: true });
      setActive(false);
      return;
    }
    const nextIndex = index + 1;
    writeTourState(surface, { step: nextIndex + 1 });
    setIndex(nextIndex);
  }, [index, surface, total]);

  const prev = useCallback(() => {
    if (index > 0) setIndex(index - 1);
  }, [index]);

  const skip = useCallback(() => {
    writeTourState(surface, { skipped: true });
    setActive(false);
  }, [surface]);

  if (!active || total === 0) return null;

  return <TourOverlay step={steps[index]} index={index} total={total} onNext={next} onPrev={prev} onSkip={skip} />;
}
