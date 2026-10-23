'use client';

import { useEffect, useState } from 'react';

/**
 * آواتار کاربر برای هدر پنل‌ها و هیرو داشبورد.
 *
 * عکس از مسیر امن و احراز هویت‌شدهٔ `/api/photo/[userId]` خوانده می‌شود
 * (هر کاربر عکس خودش را می‌بیند). اگر عکسی ثبت نشده باشد یا مسیر خطا
 * بدهد، همان حرف اول نام روی زمینهٔ رنگی نمایش داده می‌شود تا چیدمان
 * هدر به‌هم نریزد.
 */
export default function UserAvatar({
  userId,
  hasPhoto,
  name,
  className = 'w-9 h-9',
  fallbackClass = 'bg-emerald-600',
  fallbackTextClass = 'text-white',
  fallbackInitialClass = 'font-black text-sm',
  alt = 'عکس من',
}: {
  userId: number;
  hasPhoto?: boolean | null;
  name?: string | null;
  className?: string;
  fallbackClass?: string;
  fallbackTextClass?: string;
  fallbackInitialClass?: string;
  alt?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [userId]);

  const initial = (name ?? '').trim().slice(0, 1) || '؟';
  if (hasPhoto && Number.isInteger(userId) && userId > 0 && !failed) {
    return (
      <img
        src={`/api/photo/${userId}`}
        alt={alt}
        className={`${className} rounded-full object-cover ring-2 ring-white/40 shadow-md shrink-0 bg-white/10`}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div
      className={`${className} ${fallbackClass} rounded-full flex items-center justify-center ${fallbackInitialClass} ${fallbackTextClass} ring-2 ring-white/40 shadow-md shrink-0`}
      aria-hidden
    >
      {initial}
    </div>
  );
}
