'use client';

import type { ReactNode } from 'react';

/**
 * `<select>` فیلترِ تابلوی هفتگی که با تغییر، فرم را خودکار ارسال می‌کند.
 *
 * چرا لازم شد: فرمِ فیلتر یک GET معمولی با دکمهٔ «نمایش» است. وقتی کاربر
 * دانشکده یا گروه را عوض می‌کرد، مقدارِ قبلیِ `room` در همان فرم می‌ماند و
 * پس از ارسال، تابلوی همان کلاسِ قدیمی (که حالا خارج از فیلتر است) نمایش
 * داده می‌شد — کاربر این را «فیلتر دانشکده/گروه اعمال نمی‌شود» می‌دید.
 *
 * `resets` نام فیلدهایی است که با تغییرِ این سلکت باید خالی شوند؛ مثلاً
 * تغییرِ دانشکده `room` را پاک می‌کند تا انتخابِ کهنه به فیلترِ تازه قفل نشود.
 */
export default function FilterSelect({
  name,
  defaultValue,
  className,
  resets = [],
  children,
}: {
  name: string;
  defaultValue?: string | number;
  className?: string;
  resets?: string[];
  children: ReactNode;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue === undefined ? undefined : String(defaultValue)}
      className={className}
      onChange={(e) => {
        const form = e.currentTarget.form;
        if (!form) return;
        for (const r of resets) {
          const el = form.elements.namedItem(r);
          if (el && 'value' in (el as HTMLSelectElement)) {
            (el as HTMLSelectElement).value = '';
          }
        }
        // requestSubmit باعث می‌شود دکمهٔ «نمایش» و اعتبارسنجیِ مرورگر هم دخیل باشند.
        form.requestSubmit();
      }}
    >
      {children}
    </select>
  );
}
