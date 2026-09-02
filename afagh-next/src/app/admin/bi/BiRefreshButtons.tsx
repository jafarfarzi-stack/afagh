'use client';

import { useState, useTransition } from 'react';
import { biInvalidateAction, biRefreshAction, biRefreshDashboardsAction } from './actions';

export default function BiRefreshButtons() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const run = (fn: () => Promise<unknown>, okText: (r: any) => string) =>
    startTransition(async () => {
      setMsg(null);
      const res = await fn();
      if (res && (res as any).ok) setMsg(okText(res));
      else setMsg('❌ ' + ((res as any)?.error || 'خطا در بازسازی'));
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => run(biRefreshDashboardsAction, r => `✅ داشبورد و امکانات بازسازی شد (${r.staff} استاد، ${r.rooms} کلاس)`)}
        className="rounded-lg bg-indigo-700 px-3 py-1.5 text-sm font-bold text-white hover:bg-indigo-600 disabled:opacity-50"
      >
        🔄 محاسبهٔ دوبارهٔ داشبوردها
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(biRefreshAction, r => `✅ بازسازی کامل انجام شد (${r.staff} استاد، ${r.rooms} کلاس، ${r.wordClouds} ابر کلمه، ${r.durationMs} میلی‌ثانیه)`)}
        className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
        title="بازسازی داشبوردها + ابر کلمات همهٔ اساتید — معمولاً توسط job زمان‌بندی‌شده اجرا می‌شود"
      >
        🌙 بازسازی کامل (job)
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => biInvalidateAction(), () => '🧹 همهٔ کش‌ها پاک شد؛ درخواست بعدی محاسبهٔ تازه می‌گیرد')}
        className="rounded-lg border border-rose-400/50 bg-rose-900/30 px-3 py-1.5 text-sm text-rose-200 hover:bg-rose-900/50 disabled:opacity-50"
      >
        🧹 پاک کردن کش
      </button>
      {msg && <span className="text-xs text-slate-300">{msg}</span>}
    </div>
  );
}
