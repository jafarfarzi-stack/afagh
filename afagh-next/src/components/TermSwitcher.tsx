'use client';

import { useEffect, useRef, useState } from 'react';
import type { TermScope } from '@/lib/term-scope';

/**
 * انتخاب «نیمسال فعال» — با POST ساده به `/api/scope/term`.
 *
 * چرا POST مرورگری و نه Server Action + reload؟ اکشن، صفحهٔ جاری را با کوکی
 * جدید دوباره رندر می‌کند؛ اگر آن رندر به notFound برسد، «صفحه پیدا نشد» تا
 * رفرش دستی می‌ماند. Route Handler کوکی را در پاسخ ۳۰۳ ست می‌کند و مرورگر
 * همان صفحه را با یک GET کامل و کوکی جدید می‌گیرد. (بدون جاوااسکریپت هم
 * کار می‌کند.)
 */
export default function TermSwitcher({
  terms,
  selectedId,
}: {
  terms: TermScope[];
  selectedId: number | null;
  /** دیگر لازم نیست؛ دانشگاه از کوکی معتبر سرور خوانده می‌شود */
  effectiveId?: number | null;
}) {
  const [open, setOpen] = useState(false);
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

  const rowClass = (active: boolean) =>
    `flex w-full items-center gap-2 px-3 py-2 text-right text-xs transition-colors ${active ? 'bg-slate-700 font-extrabold text-white' : 'text-slate-200 hover:bg-slate-800'}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="نیمسال فعال — همهٔ فهرست‌ها و کارنامه‌ها بر اساس این انتخاب فیلتر می‌شوند"
        className="bg-white/15 hover:bg-white/25 border-white/25 text-white border rounded-lg px-2 py-1.5 text-xs font-bold cursor-pointer flex items-center gap-1.5"
      >
        <span className="text-[10px] opacity-70">🗓</span>
        <span className="text-[10px] opacity-80">نیمسال</span>
        <span className="max-w-36 truncate">{current ? current.title : 'همهٔ نیمسال‌ها'}</span>
        <span className="text-[10px] opacity-70">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 min-w-56 max-w-80 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
          <div className="max-h-80 overflow-y-auto py-1">
            <form action="/api/scope/term" method="post" className="block" onSubmit={() => setOpen(false)}>
              <input type="hidden" name="termId" value="" />
              <button type="submit" className={rowClass(selectedId == null)}>
                <span className="flex-1 truncate">همهٔ نیمسال‌ها</span>
                {selectedId == null && <span className="text-emerald-400 font-bold">✓</span>}
              </button>
            </form>
            <div className="my-1 border-t border-current/10" />
            {terms.map(t => {
              const active = t.id === selectedId;
              return (
                <form key={t.id} action="/api/scope/term" method="post" className="block" onSubmit={() => setOpen(false)}>
                  <input type="hidden" name="termId" value={t.id} />
                  <button type="submit" className={rowClass(active)}>
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
                </form>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
