import { requireRole } from '@/lib/auth';
import { groupedModules, FINANCE_SUBGROUPS, EDU_SUBGROUPS, canSeeModule, ADMIN_MODULES } from '@/lib/admin-modules';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const ALL_ADMIN_ROLES = [
  'ADMIN',
  'EDU_EXPERT',
  'ARCHIVE_EXPERT',
  'FINANCE_EXPERT',
  'FINANCE',
  'MILITARY_OFFICER',
  'VAULT_MANAGER',
  'DEP_HEAD',
  'VICE_EDU',
];

/**
 * میان‌برهای پرکاربرد «آموزش» که ماژولشان در دستهٔ دیگری ثبت شده است
 * (برنامه‌ریزی درسی و گزارش‌ها). مسیرها فقط از `ADMIN_MODULES` خوانده می‌شوند؛
 * اگر ماژولی از قبل در همین دسته باشد یا کاربر نقش/مجوزش را نداشته باشد،
 * نمایش داده نمی‌شود — بنابراین هیچ href تکراری ساخته نمی‌شود.
 */
const EDU_CROSS_GROUP_SHORTCUTS = [
  '/admin/weekly-board',
  '/admin/offering-editor',
  '/admin/reports',
];

/** صفحهٔ کاشی‌های یک دسته — /admin/c/edu */
export default async function CategoryPage({ params }: { params: Promise<{ group: string }> }) {
  const user = await requireRole(ALL_ADMIN_ROLES);
  const { group: key } = await params;
  const { getUserPermissionCodes } = await import('@/lib/permissions-enforcer');
  const permissionCodes = await getUserPermissionCodes(user.id).catch(() => []);
  const groups = groupedModules(user.roles, permissionCodes);
  const g = groups.find(x => x.group.key === key);

  if (!g) {
    return (
      <div className="space-y-4">
        <div className="card text-center p-8 text-slate-500 text-sm">دسته‌ای یافت نشد یا دسترسی ندارید.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* سربرگِ دسته: تیتر + شمارش + توضیح در یک بلوکِ منظم */}
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-base font-black tracking-tight text-slate-900 sm:text-lg">
            <span aria-hidden className="text-lg leading-none sm:text-xl">{g.group.icon}</span>
            <span className="truncate">{g.group.title}</span>
          </h1>
          <p className="mt-1 text-2xs font-bold leading-5 text-slate-500 sm:text-xs">{g.group.desc}</p>
        </div>
        <span className="ui-chip shrink-0">{g.modules.length} ماژول</span>
      </div>

      {/* کاشی‌های ماژول — همان الگوی «آیکن + عنوان کوتاه» کارتابل استاد/دانشجو.
          برای دستهٔ مالی، کاشی‌ها بر اساس `subgroup` به سه بخشِ منطقی تقسیم
          می‌شوند (کارتابل / قواعد / ابزارها) تا ۱۰ کاشی مالی درهم نباشند. */}
      {(() => {
        const renderCard = (m: (typeof g.modules)[number]) => (
          <Link
            key={m.href}
            href={m.href}
            title={m.desc ? `${m.title} — ${m.desc}` : m.title}
            prefetch={false}
            className="group relative flex min-h-[96px] flex-col justify-between gap-2 overflow-hidden rounded-xl border border-slate-200/80 bg-white p-3 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-2"
          >
            <span aria-hidden className="pointer-events-none absolute inset-y-0 start-0 w-1 bg-indigo-500 opacity-0 transition-opacity group-hover:opacity-100" />
            <span className="flex items-start gap-2">
              <span
                aria-hidden
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${m.accent} text-base text-white ring-1 ring-inset ring-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,.25)] transition-transform group-hover:scale-[1.03]`}
              >
                {m.icon}
              </span>
              <span className="line-clamp-2 min-w-0 text-[13px] font-extrabold leading-snug text-slate-800">
                {m.title}
              </span>
            </span>
            {m.desc ? (
              <span className="hidden sm:line-clamp-2 text-2xs font-medium leading-[1.45] text-slate-500">
                {m.desc}
              </span>
            ) : null}
          </Link>
        );

        const gridCls = g.group.key === 'fin'
          ? 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3.5'
          : 'grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3.5';

        // میان‌برها همیشه از رجیستری و با همان گاردِ نقش/مجوز فیلتر می‌شوند؛
        // ماژول‌های همین دسته (و تکراری‌ها) کنار گذاشته می‌شوند تا هیچ مقصدی
        // دو کارت نداشته باشد.
        const shortcuts = g.group.key === 'edu'
          ? EDU_CROSS_GROUP_SHORTCUTS.flatMap((href) => {
              const m = ADMIN_MODULES.find((x) => x.href === href);
              if (!m || m.inGrid === false) return [];
              if (!canSeeModule(user.roles, m, permissionCodes)) return [];
              if (g.modules.some((x) => x.href === m.href)) return [];
              return [m];
            })
          : [];

        if (g.group.key !== 'fin') {
          const mainModules = g.group.key === 'edu'
            ? g.modules.filter((m) => !m.subgroup)
            : g.modules;
          return (
            <div className="space-y-5">
              <div className={gridCls}>{mainModules.map(renderCard)}</div>
              {g.group.key === 'edu' && EDU_SUBGROUPS.map((sg) => {
                const mods = g.modules.filter((m) => m.subgroup === sg.key);
                if (mods.length === 0) return null;
                return (
                  <section key={sg.key} className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <span aria-hidden className="text-base leading-none">{sg.icon}</span>
                        <h2 className="text-xs font-black text-slate-800 sm:text-sm">{sg.title}</h2>
                        <span className="hidden truncate text-2xs font-bold text-slate-400 sm:inline">{sg.desc}</span>
                      </div>
                      <span className="ui-chip shrink-0">{mods.length}</span>
                    </div>
                    <div className={gridCls}>{mods.map(renderCard)}</div>
                  </section>
                );
              })}
              {shortcuts.length > 0 && (
                <section className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span aria-hidden className="text-base leading-none">🔗</span>
                      <h2 className="text-xs font-black text-slate-800 sm:text-sm">میان‌برهای پرکاربرد آموزش</h2>
                      <span className="hidden truncate text-2xs font-bold text-slate-400 sm:inline">
                        ابزارهای برنامه‌ریزی و گزارش که در دستهٔ دیگری هستند
                      </span>
                    </div>
                    <span className="ui-chip shrink-0">{shortcuts.length}</span>
                  </div>
                  <div className={gridCls}>{shortcuts.map(renderCard)}</div>
                </section>
              )}
            </div>
          );
        }

        return (
          <div className="space-y-5">
            {FINANCE_SUBGROUPS.map((sg) => {
              const mods = g.modules.filter((m) => (m.subgroup ?? 'tools') === sg.key);
              if (mods.length === 0) return null;
              return (
                <section key={sg.key} className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span aria-hidden className="text-base leading-none">{sg.icon}</span>
                      <h2 className="text-xs font-black text-slate-800 sm:text-sm">{sg.title}</h2>
                      <span className="hidden truncate text-2xs font-bold text-slate-400 sm:inline">{sg.desc}</span>
                    </div>
                    <span className="ui-chip shrink-0">{mods.length}</span>
                  </div>
                  <div className={gridCls}>{mods.map(renderCard)}</div>
                </section>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
