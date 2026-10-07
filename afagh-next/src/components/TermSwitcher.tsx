'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setTermCookie } from '@/lib/term-scope-actions';
import type { TermScope } from '@/lib/term-scope';

export default function TermSwitcher({
  terms,
  selectedId,
  effectiveId,
  universityId,
  variant = 'dark',
}: {
  terms: TermScope[];
  selectedId: number | null;
  effectiveId: number | null;
  universityId: number | null;
  variant?: 'dark' | 'light';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!terms || terms.length === 0) return null;

  const current = terms.find(t => t.id === selectedId) ?? null;

  const pick = async (termId: number | null) => {
    if (busy) return;
    setOpen(false);
    if (termId === selectedId) return;
    setBusy(true);
    try {
      await setTermCookie(termId, universityId);
    } finally {
      setBusy(false);
      router.refresh();
    }
  };

  const dark = variant === 'dark';
  const btn = dark
    ? 'bg-white/15 hover:bg-white/25 border-white/25 text-white'
    : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700';
  const panel = dark
    ? 'border-slate-700 bg-slate-900'
    : 'border-slate-200 bg-white';
  const rowIdle = dark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50';
  const rowActive = dark ? 'bg-slate-700 font-extrabold text-white' : 'bg-slate-100 font-extrabold text-slate-900';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(o => !o)}
        title="نیمسال فعال — همهٔ فهرست‌ها و کارنامه‌ها بر اساس این انتخاب فیلتر می‌شوند"
        className={`${btn} border rounded-lg px-2 py-1.5 text-xs font-bold cursor-pointer disabled:opacity-60 flex items-center gap-1.5`}
      >
        <span className="text-[10px] opacity-70">🗓</span>
        <span className="text-[10px] opacity-80">نیمسال</span>
        <span className="max-w-36 truncate">{current ? current.title : 'همهٔ نیمسال‌ها'}</span>
        <span className="text-[10px] opacity-70">▾</span>
      </button>
      {open && (
        <div className={`absolute left-0 top-full mt-1 z-50 min-w-56 max-w-80 overflow-hidden rounded-xl border ${panel} shadow-2xl`}>
          <div className="max-h-80 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => pick(null)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-right text-xs transition-colors ${
                selectedId == null ? rowActive : rowIdle
              }`}
            >
              <span className="flex-1 truncate">همهٔ نیمسال‌ها</span>
              {selectedId == null && <span className="text-emerald-400 font-bold">✓</span>}
            </button>
            <div className="my-1 border-t border-current/10" />
            {terms.map(t => {
              const active = t.id === selectedId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pick(t.id)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-right text-xs transition-colors ${
                    active ? rowActive : rowIdle
                  }`}
                >
                  <span className="flex-1 truncate">
                    {t.title}
                    <span className="opacity-60 font-mono" dir="ltr"> ({t.termCode})</span>
                  </span>
                  {t.isEffectiveCurrent && (
                    <span className="shrink-0 text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                      نیمسال جاری
                    </span>
                  )}
                  {active && <span className="shrink-0 text-emerald-400 font-bold">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}