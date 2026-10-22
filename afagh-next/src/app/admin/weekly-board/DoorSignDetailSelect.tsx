'use client';

import { useRef } from 'react';

/** نامِ کوکیِ نگه‌دارندهٔ حالتِ کارتِ سردر — بینِ صفحه، تب و پنجرهٔ چاپ مشترک است */
export const DOOR_DETAIL_COOKIE = 'door_sign_detail';

/**
 * انتخابِ «جزئیات کارت سردر» — سه حالت.
 *
 * چرا کلاینت است و چرا خودش فرم را می‌فرستد:
 *  ۱) قبلاً این select فقط یک فیلدِ فرمِ GET بود؛ تا «نمایش» زده نمی‌شد هیچ
 *     اثری نداشت و کاربر فکر می‌کرد انتخابش اعمال شده.
 *  ۲) مهم‌تر: حالت در URL می‌ماند و هر مسیرِ چاپی که پارامتر `d` نداشته باشد
 *     (تبِ دیگر، پنجرهٔ چاپِ تازه، آدرسِ ذخیره‌شده، لینکِ `?print=door`) به
 *     حالتِ پیش‌فرض برمی‌گشت — یعنی «در چاپ اعمال نمی‌شد». حالا انتخاب در کوکی
 *     ذخیره می‌شود و صفحه در نبودِ `d` از کوکی می‌خواند.
 */
export default function DoorSignDetailSelect({ value }: { value: '' | '1' | '2' }) {
  const ref = useRef<HTMLSelectElement>(null);
  return (
    <label className="text-xs font-bold">جزئیات کارت سردر
      <select
        ref={ref}
        name="d"
        defaultValue={value}
        onChange={(e) => {
          // ۱) نگه‌داری برای مسیرهای چاپی که پارامتر ندارند
          document.cookie = `${DOOR_DETAIL_COOKIE}=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
          // ۲) اعمالِ فوری روی همان صفحه (بدون نیاز به دکمهٔ «نمایش»)
          ref.current?.form?.requestSubmit();
        }}
        className="block mt-1 border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
      >
        <option value="">نام درس + استاد + ساعت (کامل)</option>
        <option value="2">نام درس + استاد (بدون ساعت)</option>
        <option value="1">فقط نام درس (درشت‌ترین فونت)</option>
      </select>
    </label>
  );
}
