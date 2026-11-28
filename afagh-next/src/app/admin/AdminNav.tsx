'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { groupedModules, navModules } from '@/lib/admin-modules';
import { normalizeFa, faIncludes } from '@/lib/persian-search';
import type { UniTheme } from '@/lib/university-theme';
import Icon from '@/components/ui/Icon';

/**
 * منوی کشویی سمت راست کارتابل مدیریت — جایگزین نوار افقی قبلی.
 * دکمهٔ ثابت بالا-راست + پنل لغزنده از راست با جست‌وجو؛ فقط نقش‌های مجاز.
 *
 * بازطراحیِ بصری (بدونِ تغییرِ داده، نقش یا مسیر):
 * • شمارندهٔ «تعدادِ ماژولِ هر دسته» از کنارِ برچسب‌ها حذف شد؛ عددِ تزئینی
 * بود و اسکنِ فهرست را کند می‌کرد. شمارش فقط در کارت‌های دسته در داشبورد
 * می‌ماند. هیچ نشانهٔ «کارِ باقی‌مانده» در این فهرست وجود ندارد.
 * • سطحِ روشن (هم‌خانوادهٔ کارت‌های سفیدِ بدنه) + نوارِ رنگیِ برند در هدر از
 * همان توکنِ `navPanel`؛ ردیف‌ها یک کاشیِ ۲۴px برای آیکون دارند تا چشم روی
 * یک محورِ عمودی بماند و اسکن سریع‌تر شود.
 * • جست‌وجو در بالای پنل می‌ماند (sticky) و نتیجه‌ها تخت هستند؛ نامِ دسته
 * زیرِ هر نتیجه به‌عنوان زیرنویس می‌آید، نه سرستون.
 */

/* ── کلاس‌های پایهٔ ردیف‌ها ───────────────────────────────────────────────
 ارتفاعِ کف ۳۶px (`min-h-9`) برای هدفِ لمس، ولی padding عمودی کم تا ردیف‌های
 بیشتری در همان ارتفاعِ دید جا شوند. گذار `ui-t` است (۱۴۰ms روی رنگ/سایه)،
 نه `transition-all`؛ هیچ انیمیشنی روی عرض/ارتفاع نیست. */
const ITEM =
 'group relative flex min-h-[44px] items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] leading-5 ui-t ' +
 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70 ' +
 'focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900';
const ITEM_IDLE =
 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-800/70 dark:hover:text-white';
const ITEM_ACTIVE =
 'bg-indigo-50 font-extrabold text-indigo-800 ring-1 ring-inset ring-indigo-200 ' +
 'dark:bg-indigo-950/60 dark:text-indigo-100 dark:ring-indigo-800/70';
const TILE = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-1 ring-inset';
const TILE_IDLE = 'bg-slate-100 text-slate-500 ring-slate-200/80 group-hover:bg-white dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:group-hover:bg-slate-700/70';
const TILE_ACTIVE = 'bg-white text-indigo-700 ring-indigo-200 dark:bg-indigo-900/60 dark:text-indigo-200 dark:ring-indigo-700/70';
/* سرستونِ کوچکِ کم‌رنگ با خطِ جداکنندهٔ نازک — ۸px فاصله در بالا و پایین. */
const SECTION =
 'mb-2 mt-2 border-t border-slate-200/80 pt-2 text-3xs font-black text-slate-500 dark:border-slate-700/70 dark:text-slate-400';

/** نوارِ لهجهٔ ۳px در لبهٔ inline-start ردیفِ فعال. */
function AccentBar() {
 return (
 <span
 aria-hidden
 className="pointer-events-none absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-indigo-600 dark:bg-indigo-400"
 />
 );
}

export default function AdminNav({ roles, permissions, theme }: { roles: string[]; permissions?: string[]; theme?: UniTheme }) {
 const th: UniTheme = theme ?? {
 header: 'bg-indigo-950', badge: 'bg-indigo-900/90 hover:bg-indigo-900 border-indigo-600/60',
 ring: 'border-indigo-700/60', soft: 'bg-indigo-900/80 text-indigo-200',
 navPanel: 'bg-indigo-600 text-white border-indigo-500 dark:bg-indigo-950 dark:border-indigo-700/50', navBorder: 'border-indigo-200',
 navHover: 'hover:bg-indigo-500 dark:hover:bg-indigo-900/70', navActive: 'bg-indigo-700 font-bold',
 navMuted: 'text-indigo-200 dark:text-indigo-400',
 navInput: 'bg-white border-indigo-200 dark:bg-indigo-900/70 dark:border-indigo-700/60 placeholder:text-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400',
 };
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
 }, [open]);
 // اسکرول بدنه قفل شود تا کشو روی محتوایِ در حال اسکرول شناور نماند
 useEffect(() => {
 if (!open) return;
 const prev = document.body.style.overflow;
 document.body.style.overflow = 'hidden';
 return () => { document.body.style.overflow = prev; };
 }, [open]);

 const modules = useMemo(() => navModules(roles, permissions), [roles, permissions]);
 const grouped = useMemo(() => groupedModules(roles, permissions), [roles, permissions]);
 // دستهٔ فعال: چون ماژول‌ها دیگر در منو نیستند، باید از روی مسیرِ جاری بفهمیم
 // کاربر داخل کدام دسته است تا همان ردیف برجسته شود. بلندترین href اول بررسی
 // می‌شود تا `/admin/x/y` به‌اشتباه با `/admin/x` تطبیق داده نشود؛ `/admin`
 // خودش (داشبورد) از این محاسبه کنار گذاشته می‌شود چون پیشوندِ همه‌چیز است.
 const activeGroup = useMemo(() => {
 const hit = modules
 .filter(m => m.href !== '/admin')
 .sort((a, b) => b.href.length - a.href.length)
 .find(m => pathname === m.href || pathname.startsWith(m.href + '/'));
 return hit?.group;
 }, [modules, pathname]);
 const filtered = useMemo(() => {
 const t = normalizeFa(q);
 if (!t) return modules;
 return modules.filter(m => faIncludes(m.title, t) || faIncludes(m.desc, t));
 }, [modules, q]);
 // نامِ دسته برای زیرنویسِ نتیجه‌های جست‌وجو (همان دادهٔ `groupedModules`).
 const groupTitles = useMemo(
 () => new Map(grouped.map(g => [g.group.key, g.group.title] as const)),
 [grouped],
 );
 const searching = q.trim() !== '';

 return (
 <>
 {/* دکمهٔ ثابت بالا-راست (موبایل) */}
 <button
 onClick={() => setOpen(true)}
 aria-label="باز کردن منوی مدیریت"
 aria-haspopup="dialog"
 aria-expanded={open}
 className={`lg:hidden fixed top-3 right-3 z-40 flex min-h-[44px] items-center gap-1.5 rounded-xl ${th.badge} px-3 py-2 text-xs font-bold text-white shadow-lg transition-colors`}
 >
 <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
 <path d="M4 7h16M4 12h16M4 17h16" />
 </svg>
 منو
 </button>

 {/* ── پوستهٔ ناوبری ──
 موبایل: کشوی تمام‌قد که فقط با `open` باز می‌شود.
 دسکتاپ (`lg+`): همان محتوا به سایدبارِ دائمیِ چسبان تبدیل می‌شود
 (`lg:static` + `lg:sticky` روی aside) تا کاربر بدون دو کلیک به
 همهٔ ماژول‌ها دسترسی داشته باشد. */}
 <div
 className={`${open ? 'fixed inset-0 z-50' : 'hidden'} lg:static lg:inset-auto lg:z-auto lg:block lg:shrink-0 print:hidden`}
 {...(open ? { role: 'dialog', 'aria-modal': true as const, 'aria-label': 'منوی مدیریت' } : {})}
 >
 {/* پس‌زمینهٔ نیمه‌شفاف (فقط موبایل) */}
 <div className="absolute inset-0 bg-slate-950/60 lg:hidden" onClick={() => setOpen(false)} aria-hidden />
 <aside
 className={`absolute top-0 right-0 h-full w-80 max-w-[85vw] flex flex-col overflow-hidden bg-white text-slate-800 shadow-2xl
 lg:static lg:top-auto lg:right-auto lg:min-h-[calc(100dvh-8rem)] lg:max-h-[calc(100dvh-8rem)] lg:w-64 xl:w-72 lg:max-w-none lg:sticky lg:top-[6.5rem]
 lg:rounded-2xl lg:border lg:border-slate-200 lg:shadow-e1 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700`}
 >
 {/* هدر — نوارِ رنگیِ برند (همان توکنِ `navPanel` که مدیرِ دانشگاه تنظیم می‌کند) */}
 <div className={`${th.navPanel} flex items-center justify-between gap-2 px-3 py-2.5 border-b lg:rounded-t-[15px]`}>
 <p className="flex min-w-0 items-center gap-2 text-[13px] font-extrabold">
 <Icon emoji="🧭" className="h-4 w-4" />
 <span className="truncate">منوی مدیریت</span>
 </p>
 <button
 onClick={() => setOpen(false)}
 aria-label="بستن منو"
 className="lg:hidden inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-white/80 ui-t hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
 >
 <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
 </button>
 </div>

 {/* جست‌وجو — چسبیده به بالای پنل و بیرون از ناحیهٔ اسکرول */}
 <div className={`sticky top-0 z-10 border-b ${th.navBorder} bg-white px-2.5 py-2 dark:border-slate-700 dark:bg-slate-900`}>
 <div className="relative">
 <Icon emoji="🔍" className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
 <input
 autoFocus={open}
 value={q}
 onChange={e => setQ(e.target.value)}
 placeholder="جست‌وجوی ماژول…"
 aria-label="جست‌وجوی ماژول"
 className={`w-full min-h-[44px] rounded-lg border py-2 ps-8 pe-2.5 text-xs focus:outline-none sm:min-h-0 sm:py-1.5 ${th.navInput}`}
 />
 </div>
 </div>

 {/* لیست بخش‌های اصلی (اسکرول‌پذیر)
 ────────────────────────────────────────────────────────────
 ⚠ بازطراحیِ عملکردی: پیش‌تر این‌جا هر ۵۱ ماژول (و زیرماژول) به‌صورت
 فهرستِ آکاردئونی رندر می‌شد. روی دسکتاپ این پنل همیشه باز است
 (`lg:block`)، پس هر ۵۱ لینک در viewport بودند و Next.js برای همه‌شان
 prefetch می‌فرستاد: در HAR یک بارگذاریِ `/admin`، **۱۶۲ درخواست
 `_rsc` برای ۵۱ صفحهٔ متمایز** ثبت شد — یعنی ۵۱ رندرِ کاملِ RSC با
 تمام کوئری‌های دیتابیس، فقط برای اینکه کاربر شاید یکی را کلیک کند.
 شاهدِ قاطع: یک فایل **استاتیک** (`/_next/static/chunks/…js`) ۲٫۲ ثانیه
 در صف ماند؛ دیتابیس نمی‌تواند فایل استاتیک را کند کند، پس گلوگاه
 اشباعِ event-loop نود بود.

 حالا فقط ۸ بخشِ اصلی لینک دارند و هر کدام به صفحهٔ کاشی‌های همان
 دسته (`/admin/c/<key>`) می‌رود؛ ماژول‌ها یک کلیک عقب‌ترند. `prefetch`
 هم عمداً خاموش است تا هیچ رندری در پس‌زمینه اجرا نشود. جست‌وجو باقی
 مانده تا مسیرِ «یک‌کلیکی» به ماژولِ خاص از دست نرود — نتیجهٔ جست‌وجو
 حداکثر چند لینک است، نه ۵۱. */}
 <nav aria-label="ناوبری کارتابل مدیریت" className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden overscroll-contain px-2 py-2">
 <Link
 href="/admin"
 prefetch={false}
 aria-current={pathname === '/admin' ? 'page' : undefined}
 className={`${ITEM} ${pathname === '/admin' ? ITEM_ACTIVE : ITEM_IDLE}`}
 >
 {pathname === '/admin' && <AccentBar />}
 <span aria-hidden className={`${TILE} ${pathname === '/admin' ? TILE_ACTIVE : TILE_IDLE}`}>
 <Icon emoji="🏠" className="h-4 w-4" />
 </span>
 <span className="min-w-0 flex-1 truncate">داشبورد</span>
 </Link>

 {searching ? (
 /* حالت جست‌وجو: فهرستِ تخت با نامِ دسته به‌عنوان زیرنویس (بدون prefetch) */
 filtered.length > 0 ? (
 <>
 <p className={SECTION}>نتایج جست‌وجو</p>
 {filtered.map(m => {
 const active = pathname === m.href || pathname.startsWith(m.href + '/');
 const groupTitle = m.group ? groupTitles.get(m.group) : undefined;
 return (
 <Link
 key={m.href}
 href={m.href}
 prefetch={false}
 title={`${m.title} — ${m.desc}`}
 aria-current={active ? 'page' : undefined}
 className={`${ITEM} ${active ? ITEM_ACTIVE : ITEM_IDLE}`}
 >
 {active && <AccentBar />}
 <span aria-hidden className={`${TILE} ${active ? TILE_ACTIVE : TILE_IDLE}`}>{m.icon}</span>
 <span className="min-w-0 flex-1">
 <span className="block truncate">{m.title}</span>
 <span className="block truncate text-3xs font-normal text-slate-500 dark:text-slate-400">
 {groupTitle ?? m.desc}
 </span>
 </span>
 </Link>
 );
 })}
 </>
 ) : (
 <p className="px-2.5 py-6 text-center text-xs text-slate-500 dark:text-slate-400">ماژولی یافت نشد.</p>
 )
 ) : (
 /* حالت عادی: سرستونِ کم‌رنگ + ۸ بخشِ اصلی، بدونِ شمارندهٔ تعداد */
 grouped.length > 0 && (
 <>
 <p className={SECTION}>بخش‌های کارتابل</p>
 {grouped.map(g => {
 const href = `/admin/c/${g.group.key}`;
 const active = pathname === href || pathname.startsWith(href + '/') || activeGroup === g.group.key;
 return (
 <Link
 key={g.group.key}
 href={href}
 prefetch={false}
 title={`${g.group.title} — ${g.group.desc}`}
 aria-current={active ? 'page' : undefined}
 className={`${ITEM} ${active ? ITEM_ACTIVE : ITEM_IDLE}`}
 >
 {active && <AccentBar />}
 <span aria-hidden className={`${TILE} ${active ? TILE_ACTIVE : TILE_IDLE}`}>{g.group.icon}</span>
 <span className="min-w-0 flex-1 truncate">{g.group.title}</span>
 </Link>
 );
 })}
 </>
 )
 )}
 </nav>

 {/* دکمهٔ راهنما */}
 <div className={`border-t ${th.navBorder} p-2 dark:border-slate-700`}>
 <Link
 href="/help/admin"
 prefetch={false}
 title="راهنمای کاربری کارتابل مدیریت و PDF"
 className={`${ITEM} border border-emerald-200 bg-emerald-50 font-bold text-emerald-800 hover:bg-emerald-100 hover:text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/50`}
 >
 <span aria-hidden className={`${TILE} bg-emerald-100 text-emerald-700 ring-emerald-200/80 dark:bg-emerald-900/60 dark:text-emerald-200 dark:ring-emerald-800/70`}>
 <Icon emoji="📖" className="h-4 w-4" />
 </span>
 <span className="min-w-0 flex-1 truncate">راهنمای کاربری و PDF</span>
 </Link>
 </div>
 </aside>
 </div>
 </>
 );
}
