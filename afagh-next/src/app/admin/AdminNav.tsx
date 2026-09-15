'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { navModules } from '@/lib/admin-modules';

/**
 * منوی کشویی سمت راست کارتابل مدیریت — جایگزین نوار افقی قبلی.
 * دکمهٔ ثابت بالا-راست + پنل لغزنده از راست با جست‌وجو؛ فقط نقش‌های مجاز.
 */
export default function AdminNav({ roles }: { roles: string[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  // با عوض‌شدن مسیر، کشو بسته شود
  useEffect(() => { setOpen(false); }, [pathname]);
  // Escape ببندد
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open ]);

  const modules = useMemo(() => navModules(roles), [roles]);
  const filtered = useMemo(() => {
    const t = q.trim();
    if (!t) return modules;
    return modules.filter(m => m.title.includes(t) || m.desc.includes(t));
  }, [modules, q]);

  return (
    <>
      {/* دکمهٔ ثابت بالا-راست */}
      <button
        onClick={() => setOpen(true)}
        aria-label="باز کردن منوی مدیریت"
        className="fixed top-3 right-3 z-40 flex items-center gap-1.5 rounded-xl bg-indigo-900/90 hover:bg-indigo-900 border border-indigo-600/60 px-3 py-2 text-xs font-bold text-white shadow-lg backdrop-blur transition-colors"
      >
        <span className="text-base leading-none">☰</span>
        منو
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="منوی مدیریت">
          {/* پس‌زمینه */}
          <div className="absolute inset-0 bg-slate-950/60" onClick={() => setOpen(false)} />
          {/* پنل سمت راست */}
          <aside className="absolute top-0 right-0 h-full w-80 max-w-[85vw] bg-indigo-950 text-white shadow-2xl flex flex-col border-l border-indigo-700/50">
            <div className="flex items-center justify-between p-3 border-b border-indigo-800/60">
              <p className="font-extrabold text-sm">🧭 منوی مدیریت</p>
              <button
                onClick={() => setOpen(false)}
                aria-label="بستن منو"
                className="rounded-lg px-2 py-1 text-lg leading-none hover:bg-indigo-900"
              >
                ×
              </button>
            </div>
            <div className="p-3 border-b border-indigo-800/60">
              <input
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="جست‌وجوی ماژول…"
                className="w-full rounded-lg bg-indigo-900/70 border border-indigo-700/60 px-3 py-1.5 text-xs placeholder:text-indigo-400 focus:outline-none focus:border-indigo-400"
              />
            </div>
            <nav className="flex-1 overflow-y-auto p-2 space-y-0.5 text-[13px]">
              <Link
                href="/admin"
                className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-colors ${pathname === '/admin' ? 'bg-indigo-700 font-bold' : 'hover:bg-indigo-900/70'}`}
              >
                <span>🏠</span> داشبورد
              </Link>
              {filtered.map(m => {
                const active = pathname === m.href || pathname.startsWith(m.href + '/');
                return (
                  <Link
                    key={m.href}
                    href={m.href}
                    title={m.desc}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-colors ${active ? 'bg-indigo-700 font-bold' : 'hover:bg-indigo-900/70'}`}
                  >
                    <span>{m.icon}</span>
                    <span className="flex-1">{m.title}</span>
                  </Link>
                );
              })}
              {filtered.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-indigo-400">ماژولی یافت نشد.</p>
              )}
            </nav>
            <div className="p-2 border-t border-indigo-800/60">
              <Link
                href="/manual"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] bg-emerald-700/70 hover:bg-emerald-700 border border-emerald-500/40 font-bold transition-colors"
              >
                <span>📖</span> راهنمای کاربری و PDF
              </Link>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
