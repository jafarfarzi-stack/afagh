'use client';

import React, { useMemo, useState, useTransition } from 'react';
import { resetSettingAction, saveSettingsAction } from '@/lib/settings-actions';
import { SECRET_MASK, type SettingView } from '@/lib/settings-shared';

interface Props {
  settings: SettingView[];
  groups: string[];
}

const SOURCE_BADGE: Record<string, { text: string; cls: string }> = {
  db: { text: 'تنظیم‌شده در پنل', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  env: { text: 'از ENV', cls: 'bg-sky-100 text-sky-800 border-sky-300' },
  default: { text: 'پیش‌فرض', cls: 'bg-slate-100 text-slate-600 border-slate-300' },
};

export default function SettingsClient({ settings, groups }: Props) {
  const [activeGroup, setActiveGroup] = useState<string>(groups[0]);
  const [values, setValues] = useState<Record<string, string>>(
    () => Object.fromEntries(settings.map(s => [s.key, s.value])),
  );
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const byGroup = useMemo(
    () => settings.filter(s => s.group === activeGroup),
    [settings, activeGroup],
  );
  const dirtyCount = Object.values(dirty).filter(Boolean).length;

  const setValue = (key: string, v: string) => {
    setValues(prev => ({ ...prev, [key]: v }));
    setDirty(prev => ({ ...prev, [key]: true }));
  };

  const flash = (ok: boolean, text: string) => {
    setToast({ ok, text });
    setTimeout(() => setToast(null), 5000);
  };

  const handleSaveGroup = () => {
    const payload: Record<string, string> = {};
    for (const s of byGroup) {
      if (s.envOnly) continue;
      if (!dirty[s.key]) continue;
      payload[s.key] = values[s.key] ?? '';
    }
    if (!Object.keys(payload).length) return flash(false, 'تغییری برای ذخیره وجود ندارد.');
    startTransition(async () => {
      const res = await saveSettingsAction(payload);
      flash(res.ok, res.message);
      if (res.ok) setDirty(prev => {
        const next = { ...prev };
        for (const k of Object.keys(payload)) next[k] = false;
        return next;
      });
    });
  };

  const handleReset = (key: string) => {
    startTransition(async () => {
      const res = await resetSettingAction(key);
      flash(res.ok, res.message);
    });
  };

  return (
    <div className="space-y-5" dir="rtl">
      <header className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h1 className="text-xl font-black text-slate-800">پیکربندی سامانه</h1>
        <p className="text-sm text-slate-600 mt-2 leading-7">
          هیچ نشانی، کلید یا توکنی در کد سامانه ثابت نیست. هر مقدار ابتدا از این پنل خوانده می‌شود؛
          اگر اینجا تنظیم نشده باشد از <b>متغیر محیطی (ENV)</b> و در نهایت از مقدار پیش‌فرض استفاده می‌شود.
          مقادیر محرمانه هرگز به مرورگر ارسال نمی‌شوند و به شکل <span className="font-mono">{SECRET_MASK}</span> نمایش داده می‌شوند.
        </p>
      </header>

      {toast && (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-bold border ${
            toast.ok ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-rose-50 text-rose-800 border-rose-300'
          }`}
        >
          {toast.text}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {groups.map(g => {
          const count = settings.filter(s => s.group === g).length;
          return (
            <button
              key={g}
              onClick={() => setActiveGroup(g)}
              className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${
                activeGroup === g
                  ? 'bg-indigo-700 text-white border-indigo-700'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {g} <span className="opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-100">
          {byGroup.map(s => {
            const badge = SOURCE_BADGE[s.source];
            return (
              <div key={s.key} className="p-4 md:flex md:items-start md:gap-6">
                <div className="md:w-1/3 mb-2 md:mb-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-800">{s.label}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.text}</span>
                    {s.envOnly && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full border bg-amber-100 text-amber-800 border-amber-300">
                        فقط ENV
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono mt-1 ltr:text-left" dir="ltr">
                    {s.key} · ENV: {s.env}
                  </div>
                  {s.help && <p className="text-xs text-slate-500 mt-1 leading-6">{s.help}</p>}
                </div>

                <div className="md:flex-1 flex items-center gap-2">
                  {s.type === 'boolean' ? (
                    <select
                      disabled={s.envOnly || pending}
                      value={values[s.key] ?? 'false'}
                      onChange={e => setValue(s.key, e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-100"
                    >
                      <option value="true">فعال</option>
                      <option value="false">غیرفعال</option>
                    </select>
                  ) : (
                    <input
                      dir="ltr"
                      type={s.type === 'secret' ? 'password' : s.type === 'number' ? 'number' : 'text'}
                      disabled={s.envOnly || pending}
                      value={values[s.key] ?? ''}
                      placeholder={s.envOnly ? 'در فایل .env تنظیم می‌شود' : 'خالی = استفاده از ENV/پیش‌فرض'}
                      onChange={e => setValue(s.key, e.target.value)}
                      onFocus={e => {
                        if (s.type === 'secret' && e.target.value === SECRET_MASK) setValue(s.key, '');
                      }}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono disabled:bg-slate-100"
                    />
                  )}

                  {!s.envOnly && s.source === 'db' && (
                    <button
                      onClick={() => handleReset(s.key)}
                      disabled={pending}
                      title="حذف مقدار پنل و بازگشت به ENV/پیش‌فرض"
                      className="shrink-0 text-xs px-3 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
                    >
                      بازنشانی
                    </button>
                  )}
                  {dirty[s.key] && <span className="shrink-0 text-amber-600 text-lg leading-none" title="ذخیره نشده">●</span>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-slate-50 border-t border-slate-200 p-4 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {dirtyCount > 0 ? `${dirtyCount} تغییر ذخیره‌نشده` : 'همهٔ تغییرات ذخیره شده‌اند'}
          </span>
          <button
            onClick={handleSaveGroup}
            disabled={pending || !byGroup.some(s => dirty[s.key])}
            className="px-6 py-2.5 rounded-xl bg-indigo-700 text-white font-bold text-sm hover:bg-indigo-800 disabled:opacity-40"
          >
            {pending ? 'در حال ذخیره…' : 'ذخیرهٔ این بخش'}
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500 leading-6">
        نکته: مقادیر گروه «زیرساخت» پیش از اتصال به دیتابیس لازم‌اند، بنابراین فقط از طریق فایل
        <span className="font-mono mx-1">.env</span> یا متغیرهای محیطی داکر قابل تغییرند.
      </p>
    </div>
  );
}
