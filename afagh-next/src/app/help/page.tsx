import Link from 'next/link';
import { getSessionUser } from '@/lib/auth';
import { HELP_TABS, TAB_KEYS, defaultTabForRoles, getHelpTab, isTabKey, type TabKey } from './content';

export const metadata = { title: 'راهنمای سامانه آفاق' };

const TAB_STYLE: Record<string, { active: string; soft: string }> = {
  emerald: { active: 'bg-emerald-700 text-white shadow', soft: 'bg-emerald-50 border-emerald-200' },
  indigo: { active: 'bg-indigo-700 text-white shadow', soft: 'bg-indigo-50 border-indigo-200' },
  teal: { active: 'bg-teal-700 text-white shadow', soft: 'bg-teal-50 border-teal-200' },
  slate: { active: 'bg-slate-800 text-white shadow', soft: 'bg-slate-100 border-slate-300' },
  amber: { active: 'bg-amber-500 text-slate-950 shadow', soft: 'bg-amber-50 border-amber-200' },
};

function backHref(roles: string[]): string {
  if (roles.includes('ADMIN')) return '/admin';
  if (roles.includes('PROFESSOR')) return '/professor';
  if (roles.includes('STUDENT')) return '/student';
  return '/login';
}

export default async function HelpPage(props: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await props.searchParams;
  const user = await getSessionUser().catch(() => null);
  const roles = user?.roles ?? [];
  const requested: TabKey | null = isTabKey(sp.tab) ? sp.tab : null;
  const activeKey: TabKey = requested ?? defaultTabForRoles(roles);
  const tab = getHelpTab(activeKey);
  const st = TAB_STYLE[tab.color] ?? TAB_STYLE.slate;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 p-4 sm:p-8" dir="rtl">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* هدر */}
        <div className="bg-gradient-to-l from-indigo-950 via-slate-900 to-indigo-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-indigo-700/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-400 text-slate-950">
              راهنمای نقش‌محور سامانه دانشگاهی آفاق
            </span>
            <h1 className="text-xl sm:text-3xl font-black mt-2">📖 مرکز راهنمای کاربران</h1>
            <p className="text-xs sm:text-sm text-indigo-200 mt-1">
              راهنمای هر نقش جدا است — تب نقش خودتان را انتخاب کنید. هر بخش لینک مستقیم به همان صفحه سامانه دارد.
              {user ? ` (واردشده به‌نام ${user.name})` : ' (مهمان — برای لینک‌های داخلی ابتدا وارد شوید)'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={tab.pdf}
              download
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs shadow-lg flex items-center gap-2 transition"
            >
              <span>📥</span>
              <span>دانلود PDF {tab.label}</span>
            </a>
            <Link
              href={backHref(roles)}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 transition"
            >
              بازگشت
            </Link>
          </div>
        </div>

        {/* تب‌های نقش */}
        <nav className="flex flex-wrap gap-2" aria-label="نقش‌ها">
          {HELP_TABS.map(t => {
            const active = t.key === activeKey;
            const s = TAB_STYLE[t.color] ?? TAB_STYLE.slate;
            return (
              <Link
                key={t.key}
                href={`/help?tab=${t.key}`}
                className={`px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-black border transition flex items-center gap-2 ${
                  active ? s.active + ' border-transparent' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* معرفی تب فعال */}
        <div className={`rounded-2xl border p-4 sm:p-5 ${st.soft}`}>
          <h2 className="font-black text-base sm:text-lg">
            {tab.icon} {tab.label}
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">{tab.subtitle}</p>
        </div>

        {/* دسترسی سریع به بخش‌ها */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {tab.sections.map(s => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="p-4 bg-white hover:bg-indigo-50/50 border border-slate-200 rounded-2xl shadow-sm hover:border-indigo-300 transition space-y-1 block"
            >
              <div className="text-xl">{s.icon}</div>
              <h3 className="font-extrabold text-xs text-slate-900">{s.title}</h3>
            </a>
          ))}
        </div>

        {/* بخش‌ها */}
        <div className="space-y-6">
          {tab.sections.map(s => (
            <section
              key={s.id}
              id={s.id}
              className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4 scroll-mt-4"
            >
              <h2 className="text-base sm:text-lg font-black text-indigo-950 border-b pb-2">
                {s.icon} {s.title}
              </h2>
              {s.intro && <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">{s.intro}</p>}
              {s.steps && (
                <ol className="list-decimal list-inside text-xs sm:text-sm space-y-1.5 text-slate-700 pr-2 leading-relaxed">
                  {s.steps.map((st2, i) => (
                    <li key={i}>{st2}</li>
                  ))}
                </ol>
              )}
              {s.note && (
                <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed">
                  💡 {s.note}
                </p>
              )}
              {s.links && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {s.links.map(l => (
                    <Link
                      key={l.href}
                      href={l.href}
                      className="px-4 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-bold transition"
                      title={l.desc}
                    >
                      {l.label} ←
                    </Link>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>

        {/* پاورقی تب‌ها */}
        <div className="text-center text-[11px] text-slate-500 pb-4">
          نقش دیگری هستید؟{' '}
          {TAB_KEYS.filter(k => k !== activeKey).map(k => {
            const t = HELP_TABS.find(x => x.key === k)!;
            return (
              <Link key={k} href={`/help?tab=${k}`} className="text-indigo-700 font-bold hover:underline mx-1">
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
