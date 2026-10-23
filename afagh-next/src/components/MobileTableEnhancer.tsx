'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * لایهٔ موبایل (طرح چهارلایه): برای هر جدولِ دارای کلاس `rt`، متنِ هر ستونِ
 * سرآیند (thead) را به عنوان `data-label` روی سلول‌های بدنه (td) تزریق می‌کند
 * تا در نمای «کارت به ازای هر سطر» برچسبِ هر فیلد نمایش داده شود.
 *
 * این کار روی DOM پس از رندر انجام می‌شود (فقط setAttribute) و با هدایت‌های
 * سمت کلاینتِ Next نیز همگام می‌شود (بازاجرا به ازای هر تغییر مسیر).
 * صفحه‌ها بازنویسی نمی‌شوند.
 */
export default function MobileTableEnhancer() {
  const pathname = usePathname();

  useEffect(() => {
    const apply = () => {
      const tables = document.querySelectorAll<HTMLTableElement>('table.rt');
      tables.forEach((table) => {
        const headerRow = table.querySelector('thead tr');
        if (!headerRow) return;
        const headers = Array.from(headerRow.querySelectorAll('th')).map((th) =>
          (th.getAttribute('data-label') || th.textContent || '').trim()
        );
        table.querySelectorAll('tbody tr').forEach((tr) => {
          const cells = tr.querySelectorAll('td');
          cells.forEach((td, i) => {
            const label = headers[i];
            if (label && !td.hasAttribute('data-label')) {
              td.setAttribute('data-label', label);
            }
          });
        });
      });
    };

    // اجرای اولیه + تأخیر کوتاه برای صفحاتی که جدول را پس از fetch می‌کشند
    apply();
    const t = window.setTimeout(apply, 300);

    return () => window.clearTimeout(t);
  }, [pathname]);

  return null;
}
