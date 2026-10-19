import Link from 'next/link';
import { cookies } from 'next/headers';
import { requireRole, getStaffByUser } from '@/lib/auth';
import { headedDepartments } from '@/lib/group-manager';
import { getSiblingAccounts } from '@/lib/account-switch';
import PanelSwitcher from '@/components/PanelSwitcher';
import { ADMIN_PANEL_ROLES } from '@/lib/panel-links';
import ThemeToggle from '@/components/ThemeToggle';
import { logoutAction } from '../login/actions';
import DeptSwitcher from './DeptSwitcher';

export default async function GroupManagerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['DEP_HEAD']);
  const st = await getStaffByUser(user.id);
  const depts = st ? await headedDepartments(st.id, st.departmentId ?? null) : [];
  const active = Number((await cookies()).get('gm_dept')?.value || 0) || depts[0]?.id || 0;
  const current = depts.find(d => d.id === active) ?? depts[0] ?? null;

  // مدیر گروهی که استاد/کارشناس مالی/آموزش هم هست، از همین‌جا (بالای صفحه) بین
  // همهٔ کارتابل‌هایش جابه‌جا می‌شود — پیش‌تر فقط لینک استاد و (برای ADMIN) مدیر بود.
  const alreadyAdmin = user.roles.some(r => (ADMIN_PANEL_ROLES as readonly string[]).includes(r));
  let permissionCount = 0;
  if (!alreadyAdmin) {
    const { getUserPermissionCodes } = await import('@/lib/permissions-enforcer');
    permissionCount = (await getUserPermissionCodes(user.id).catch(() => [])).length;
  }
  // حساب‌های هم‌شخصِ همین کدملی (کد پرسنلی/دانشجویی دیگر) در همان سوییچر می‌آیند
  const siblings = await getSiblingAccounts().catch(() => []);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-teal-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 p-4">
          <div>
            <p className="font-bold">
              پنل مدیر گروه
              {current && <span className="mr-2 text-sm font-normal opacity-90">· {current.name}</span>}
            </p>
            <p className="text-xs opacity-70">{user.name} · نقش‌ها: {user.roles.join('، ')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PanelSwitcher
              roles={user.roles}
              current="group-manager"
              permissionCount={permissionCount}
              siblings={siblings}
              groupTitle={current?.name}
            />
            <Link href="/help/group-manager" className="rounded-lg bg-teal-800 px-3 py-1.5 text-xs font-bold hover:bg-teal-700">
              📖 راهنمای مدیر گروه
            </Link>
            <ThemeToggle />
              <form action={logoutAction}><button className="text-xs underline opacity-70">خروج</button></form>
          </div>
        </div>

        {depts.length > 1 && <DeptSwitcher depts={depts} activeId={current?.id ?? 0} />}

        <nav className="mx-auto flex max-w-6xl flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-sm">
          <Link href="/group-manager" className="hover:underline">خانه</Link>
          <Link href="/group-manager/courses" className="hover:underline">دروس گروه</Link>
          <Link href="/group-manager/offerings" className="hover:underline">ارائه‌های ترم</Link>
          <Link href="/group-manager/classrooms" className="hover:underline">کلاس‌ها</Link>
          <Link href="/group-manager/equivalence" className="hover:underline">معادل‌سازی دروس</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-4">{children}</main>
    </div>
  );
}
