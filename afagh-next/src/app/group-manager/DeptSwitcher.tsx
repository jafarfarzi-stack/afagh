'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import type { HeadedDept } from '@/lib/group-manager';

/**
 * جعبهٔ تعویض گروه — فقط وقتی دیده می‌شود که شخص مدیر بیش از یک گروه باشد
 * (حالت رایج: مدیر گروه تخصصی خودش + مدیر گروه دروس عمومی و مشترک).
 * انتخاب در کوکی می‌نشیند تا در همهٔ صفحه‌های پنل یکسان بماند.
 */
export default function DeptSwitcher({ depts, activeId }: { depts: HeadedDept[]; activeId: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const pick = (id: number) =>
    start(() => {
      document.cookie = `gm_dept=${id}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    });

  return (
    <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 pb-2 text-xs">
      <span className="opacity-70">گروه فعال:</span>
      {depts.map(d => (
        <button
          key={d.id}
          disabled={pending}
          onClick={() => pick(d.id)}
          className={
            'rounded-lg border px-2.5 py-1 transition-colors disabled:opacity-50 ' +
            (d.id === activeId
              ? 'border-white bg-white font-bold text-teal-900'
              : 'border-teal-700 bg-teal-800/60 text-teal-100 hover:bg-teal-800')
          }
        >
          {d.name}
          {d.kind === 'GENERAL' && <span className="mr-1 opacity-70">(عمومی)</span>}
        </button>
      ))}
    </div>
  );
}
