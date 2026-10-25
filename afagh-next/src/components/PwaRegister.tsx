'use client';

import { useEffect } from 'react';

/**
 * ثبتِ Service Worker برای تجربهٔ اپ‌مانند (نصب روی صفحهٔ اصلی + آفلاین سبک).
 * فقط در محیطِ مرورگر و پس از load اجرا می‌شود تا بارگذاری اولیه کند نشود.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);
  return null;
}
