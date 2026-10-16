'use client';

import { useEffect, useRef } from 'react';

/**
 * پل چاپ ↔ دارک‌مود
 *
 * نگاشت‌های دارک‌مود در globals.css با `!important` روی کلاس‌های پایه نشسته‌اند
 * و قوانین `@media print` نمی‌توانند آنها را بزنند؛ نتیجه این می‌شود که کاربرِ
 * حالت شب، سند رسمی را با متن روشن روی زمینهٔ خاکستری/تیره می‌گیرد.
 *
 * راه‌حل: درست قبل از چاپ، کلاس `dark` از `<html>` برمی‌داشته می‌شود تا همهٔ
 * نگاشت‌ها به‌طور خودکار به حالت روشن برگردند، و بعد از چاپ (بستن دیالوگ) با
 * همان وضعیت قبلی برمی‌گردد. با `beforeprint` (پنجرهٔ چاپ مرورگر و
 * `window.print()`) و `matchMedia('print')` (مرورگرهای قدیمی‌تر) هر دو پوشش
 * داده می‌شود؛ تمِ ذخیره‌شدهٔ کاربر دست‌نخورده می‌ماند.
 */
export default function PrintThemeGuard() {
  const wasDark = useRef(false);

  useEffect(() => {
    const enterPrint = () => {
      const html = document.documentElement;
      if (html.classList.contains('dark')) {
        wasDark.current = true;
        html.classList.remove('dark');
      }
    };
    const exitPrint = () => {
      if (wasDark.current) {
        document.documentElement.classList.add('dark');
        wasDark.current = false;
      }
    };
    const mq = window.matchMedia('print');
    const onMq = () => (mq.matches ? enterPrint() : exitPrint());

    window.addEventListener('beforeprint', enterPrint);
    window.addEventListener('afterprint', exitPrint);
    mq.addEventListener?.('change', onMq);
    return () => {
      window.removeEventListener('beforeprint', enterPrint);
      window.removeEventListener('afterprint', exitPrint);
      mq.removeEventListener?.('change', onMq);
      // اگر کامپوننت هنگام باز بودن دیالوگ از بین رفت، تم برگردد
      exitPrint();
    };
  }, []);

  return null;
}
