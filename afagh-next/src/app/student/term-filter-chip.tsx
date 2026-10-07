'use client';

import { useState, useTransition } from 'react';
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
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  function clear() {
    setBusy(true);
    startTransition(async () => {
      try {
        await setTermCookie(null, universityId);
      } finally {
        setBusy(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="print:hidden flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-900">
      <span className="font-bold">نیمسال: {title}</span>
      <button
        type="button"
        onClick={clear}
        disabled={busy || pending}
        className="rounded-lg border border-indigo-300 bg-white px-2 py-0.5 text-[11px] font-bold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
      >
        {busy || pending ? 'در حال پاک کردن…' : 'پاک کردن فیلتر'}
      </button>
    </div>
  );
}