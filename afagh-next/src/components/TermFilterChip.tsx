'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setTermCookie } from '@/lib/term-scope-actions';

export default function TermFilterChip({
  title,
  universityId,
}: {
  title: string;
  universityId: number | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const clear = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await setTermCookie(null, universityId);
    } finally {
      setBusy(false);
      router.refresh();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs print:hidden">
      <span className="font-bold text-indigo-900">🗓 نیمسال: {title}</span>
      <span className="text-indigo-700/80">همهٔ نماهای این صفحه به همین نیمسال محدود شده‌اند.</span>
      <button
        type="button"
        disabled={busy}
        onClick={clear}
        className="mr-auto rounded-lg border border-indigo-300 bg-white px-2.5 py-1 font-bold text-indigo-800 hover:bg-indigo-100 disabled:opacity-60"
      >
        پاک کردن فیلتر
      </button>
    </div>
  );
}