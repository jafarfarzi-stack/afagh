'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ShowcaseSlide } from '@/lib/login-showcase';

const GRADIENTS = [
  'from-emerald-700 via-teal-800 to-slate-900',
  'from-indigo-800 via-indigo-900 to-slate-900',
  'from-amber-600 via-orange-800 to-stone-900',
  'from-cyan-700 via-sky-900 to-slate-900',
];

/** اسلایدر صفحه ورود — چرخش خودکار ۵ ثانیه‌ای + نقطه و فلش */
export default function ShowcaseSlider({ slides }: { slides: ShowcaseSlide[] }) {
  const [idx, setIdx] = useState(0);
  const n = slides.length;
  const go = useCallback((d: number) => setIdx(i => (i + d + n) % n), [n]);

  useEffect(() => {
    if (n < 2) return;
    const t = setInterval(() => setIdx(i => (i + 1) % n), 5000);
    return () => clearInterval(t);
  }, [n]);

  if (!n) return null;
  const s = slides[idx];
  const body = (
    <div className="relative h-52 sm:h-64 overflow-hidden rounded-3xl shadow-2xl border border-white/20">
      {s.imageUrl ? (
        <img src={s.imageUrl} alt={s.title} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-l ${GRADIENTS[idx % GRADIENTS.length]}`} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
      <div className="absolute bottom-0 right-0 left-0 p-5 sm:p-6">
        <p className="text-white font-black text-base sm:text-xl leading-8">{s.title}</p>
        {s.subtitle ? <p className="text-white/80 text-xs sm:text-sm mt-1 leading-6">{s.subtitle}</p> : null}
      </div>
      {n > 1 && (
        <>
          <button type="button" aria-label="قبلی" onClick={() => go(1)}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/40 hover:bg-black/60 text-white w-8 h-8 text-sm backdrop-blur">‹</button>
          <button type="button" aria-label="بعدی" onClick={() => go(-1)}
            className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/40 hover:bg-black/60 text-white w-8 h-8 text-sm backdrop-blur">›</button>
          <div className="absolute top-3 left-3 flex gap-1.5">
            {slides.map((_, i) => (
              <button key={i} type="button" aria-label={`اسلاید ${i + 1}`} onClick={() => setIdx(i)}
                className={`h-2 rounded-full transition-all ${i === idx ? 'w-6 bg-white' : 'w-2 bg-white/50 hover:bg-white/80'}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );

  // پیوند داخلی با <a> ساده تا تب/پارامتر حفظ شود
  return s.linkUrl ? <a href={s.linkUrl} className="block">{body}</a> : body;
}
