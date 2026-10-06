import { requireRole } from '@/lib/auth';
import { groupedModules } from '@/lib/admin-modules';
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

/** صفحهٔ کاشی‌های یک دسته — /admin/c/edu */
export default async function CategoryPage({ params }: { params: Promise<{ group: string }> }) {
  const user = await requireRole(ALL_ADMIN_ROLES);
  const { group: key } = await params;
  const groups = groupedModules(user.roles);
  const g = groups.find(x => x.group.key === key);

  if (!g) {
    return (
      <div className="space-y-4">
        <Link href="/admin" className="text-xs font-bold text-indigo-700 hover:underline">→ بازگشت به داشبورد</Link>
        <div className="card text-center p-8 text-slate-500 text-sm">دسته‌ای یافت نشد یا دسترسی ندارید.</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-extrabold text-slate-800 text-base sm:text-lg">
          {g.group.icon} {g.group.title}
        </h1>
        <Link href="/admin" className="text-xs font-bold text-indigo-700 hover:underline">→ بازگشت به داشبورد</Link>
      </div>
      <p className="text-xs text-slate-500 -mt-3">{g.group.desc} — {g.modules.length} ماژول</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {g.modules.map(m => (
          <Link
            key={m.href}
            href={m.href}
            className={`group h-full p-4 rounded-2xl bg-gradient-to-br ${m.accent} text-white shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-start justify-between border`}
          >
            <div className="flex items-start gap-3">
              <div className={`w-11 h-11 shrink-0 rounded-xl ${m.iconBg} border flex items-center justify-center text-2xl shadow-inner group-hover:scale-110 transition-transform`}>
                {m.icon}
              </div>
              <div>
                <h3 className="font-extrabold text-sm leading-6">{m.title}</h3>
                <p className="text-[11px] text-white/70 mt-1 leading-5">{m.desc}</p>
              </div>
            </div>
            <span className="text-white/50 font-extrabold text-sm group-hover:text-white group-hover:-translate-x-1 transition-all mt-1">
              ←
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
