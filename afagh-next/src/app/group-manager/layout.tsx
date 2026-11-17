import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { requireRole, getStaffByUser, endCurrentSession } from '@/lib/auth';
import { headedDepartments } from '@/lib/group-manager';
import { getSiblingAccounts } from '@/lib/account-switch';
import PanelSwitcher from '@/components/PanelSwitcher';
import HeaderActions from '@/components/HeaderActions';
import { ADMIN_PANEL_ROLES } from '@/lib/panel-links';
import SessionLock from '@/components/SessionLock';
import DeptSwitcher from './DeptSwitcher';
import GroupManagerNav from './GroupManagerNav';
import PortalNav from '@/components/portal/PortalNav';
import { GM_GROUPS } from '@/lib/portal-nav';
import BackToDashboard from '@/components/BackToDashboard';

export default async function GroupManagerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['DEP_HEAD']);

  // ── ⚡ واکشیِ موازیِ سربرگ ─────────────────────────────────────────────────
  // پیش‌تر: مدتِ قفل → وضعیت قفل → پروندهٔ کارمند → گروه‌های سرپرستی → کوکیِ
  // گروه → مجوزهای سفارشی → حساب‌های هم‌شخص؛ هفت رفت‌و‌برگشتِ پشتِ سرِ هم.
  const alreadyAdmin = user.roles.some(r => (ADMIN_PANEL_ROLES as readonly string[]).includes(r));
  const { evaluateIdleLock, resolveIdleTimeoutMinutes, idleMinutes, resolveReauthMinutes } = await import('@/lib/session-lock');
  const { getUserCustomPermissionCodes } = await import('@/lib/permissions-enforcer');

  const [lockMin, st, siblings, customCodes, cookieStore] = await Promise.all([
    resolveIdleTimeoutMinutes(user.roles).catch(() => 15),
    getStaffByUser(user.id),
    // حساب‌های هم‌شخصِ همین کدملی (کد پرسنلی/دانشجویی دیگر) در همان سوییچر می‌آیند
    getSiblingAccounts().catch(() => []),
    // فقط مجوزهای «نقش سفارشی» شمرده می‌شود؛ نقش‌های سیستمی (DEP_HEAD/PROFESSOR/
    // STUDENT) مجوزهای ذاتی دارند و نباید لینک «داشبورد مدیریت» بسازند.
    alreadyAdmin ? Promise.resolve([] as string[]) : getUserCustomPermissionCodes(user.id).catch(() => [] as string[]),
    cookies(),
  ]);
  const permissionCount = customCodes.length;

  // غیبت طولانی → نشست همین دستگاه بسته و صفحهٔ ورود (نه قفل روی دادهٔ کهنه)
  if (lockMin > 0) {
    const reauthMin = await resolveReauthMinutes(lockMin).catch(() => 0);
    const away = reauthMin > 0 ? await idleMinutes(user.id).catch(() => null) : null;
    if (away != null && away >= reauthMin) {
      await endCurrentSession().catch(() => {});
      redirect('/login?expired=1');
    }
  }

  const [lockOn, depts] = await Promise.all([
    evaluateIdleLock(user.id, lockMin).catch(() => false),
    st ? headedDepartments(st.id, st.departmentId ?? null) : Promise.resolve([] as Awaited<ReturnType<typeof headedDepartments>>),
  ]);
  const active = Number(cookieStore.get('gm_dept')?.value || 0) || depts[0]?.id || 0;
  const current = depts.find(d => d.id === active) ?? depts[0] ?? null;

  return (
    <div className="app-page min-h-screen bg-slate-50 print:!bg-white">
      <header className="app-header sticky top-0 z-40 bg-teal-900 text-white print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
          {/* هویت: نشانِ کارتابل + عنوان + نام/نقش — هم‌الگو با کارتابل استاد */}
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-700/70 text-base font-black ring-1 ring-white/15 shadow-inner"
            >
              گ
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold leading-tight">
                پنل مدیر گروه
                {current && <span className="ms-2 text-xs font-normal opacity-90">· {current.name}</span>}
              </p>
              <p className="truncate text-2xs leading-tight opacity-75">
                {user.name} · نقش‌ها: {user.roles.join('، ')}
              </p>
            </div>
          </div>
          {/* ابزارها: همان `HeaderActions` مشترکِ سه کارتابل دیگر (راهنما/PDF/تم/خروج) */}
          <div className="relative flex flex-wrap items-center gap-1.5">
            <PanelSwitcher
              roles={user.roles}
              current="group-manager"
              permissionCount={permissionCount}
              siblings={siblings}
              groupTitle={current?.name}
            />
            <HeaderActions helpHref="/help/group-manager" pdfHref="/help/pdfs/group-manager.pdf" />
          </div>
        </div>

        {depts.length > 1 && <DeptSwitcher depts={depts} activeId={current?.id ?? 0} />}
      </header>

      {/* ناوبریِ موبایل — نوارِ قرصی از سربرگِ چسبان بیرون آمد تا فقط زیر `lg`
          بماند و در دسکتاپ جای خود را به سایدبارِ مشترک بدهد. پس‌زمینهٔ فیروزه‌ای
          عمداً همان رنگِ سربرگ است؛ قرص‌های روشن روی آن خوانا می‌مانند. */}
      <div className="bg-teal-900 lg:hidden print:hidden">
        <GroupManagerNav />
      </div>

      {/* بدنهٔ دوستونه در `lg+`: سایدبارِ مشترکِ پورتال + محتوا */}
      <div className="mx-auto flex w-full max-w-[1600px] items-start gap-4 p-3 pb-24 sm:p-6 lg:gap-6 lg:pb-10">
        <PortalNav groups={GM_GROUPS} surface="group-manager" />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 overflow-x-hidden scroll-mt-[6.5rem]">
          <BackToDashboard href="/group-manager" label="بازگشت به کارتابل مدیر گروه" />
          {children}
        </main>
      </div>
      <SessionLock name={user.name} timeoutMin={lockMin} initialLocked={lockOn} />
    </div>
  );
}
