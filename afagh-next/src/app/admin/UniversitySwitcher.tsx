'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setUniversityCookie } from './university-actions';
import { uniDot } from '@/lib/university-scope';

export default function UniversitySwitcher({
  universities, currentCode, buttonClass,
}: {
  universities: { code: string; title: string; kind: string }[];
  currentCode: string;
  buttonClass?: string;
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
  }, [open ]);
  if (!universities || universities.length < 2) return null;
  const cur = universities.find(u => u.code === currentCode) ?? universities[0];
  const pick = async (code: string) => {
    if (code === currentCode || busy) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await setUniversityCookie(code);
    } finally {
      setBusy(false);
      setOpen(false);
      router.refresh();
    }
  };
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(o => !o)}
        title="دانشگاه فعال — همهٔ لیست‌ها بر اساس این انتخاب فیلتر می‌شود"
        className={`${buttonClass ?? 'bg-indigo-700 hover:bg-indigo-600 border-indigo-500'} text-white border rounded-lg px-2 py-1.5 text-xs font-bold cursor-pointer disabled:opacity-60 flex items-center gap-1.5`}
      >
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${uniDot(cur.code)} ring-1 ring-white/40`} />
        <span className="max-w-36 truncate">{cur.title}{cur.kind === 'DISSOLVED' ? ' (منحله)' : ''}</span>
        <span className="text-[10px] opacity-70">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 min-w-52 max-w-72 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
          {universities.map(u => {
            const active = u.code === currentCode;
            return (
              <button
                key={u.code}
                type="button"
                onClick={() => pick(u.code)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-right text-xs transition-colors ${
                  active ? 'bg-slate-700 font-extrabold text-white' : 'text-slate-200 hover:bg-slate-800'
                }`}
              >
                <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${uniDot(u.code)}`} />
                <span className="flex-1 truncate">
                  {u.title}{u.kind === 'DISSOLVED' ? ' (منحله)' : ''}
                </span>
                {active && <span className="text-emerald-400 font-bold">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
