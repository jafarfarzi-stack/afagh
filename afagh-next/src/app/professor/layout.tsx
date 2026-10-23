import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { electronic_documents, departments, users } from '@/db/schema';
import { getStaffByUser, requireRole, endCurrentSession } from '@/lib/auth';
import { headedDepartments } from '@/lib/group-manager';
import { getSiblingAccounts } from '@/lib/account-switch';
import PanelSwitcher from '@/components/PanelSwitcher';
import { ADMIN_PANEL_ROLES } from '@/lib/panel-links';
import SessionLock from '@/components/SessionLock';
import TermSwitcher from '@/components/TermSwitcher';
import { getTermScope } from '@/lib/term-scope';
import ThemeToggle from '@/components/ThemeToggle';
import MobileTabBar from '@/components/MobileTabBar';
import UserAvatar from '@/components/UserAvatar';
import { logoutAction } from '../login/actions';

export default async function ProfessorLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['PROFESSOR']);
  const me = await getStaffByUser(user.id);
  // عکس پرسنلی استاد (برای آواتار هدر) — کلید شیء، نمایش از مسیر امن
  const [photoRow] = await db.select({ photoKey: users.photoKey }).from(users).where(eq(users.id, user.id)).limit(1);
  const pending = me ? await db.select({ id: electronic_documents.id }).from(electronic_documents).where(eq(electronic_documents.staffId, me.id)) : [];
  const pendingCount = pending.length;

  // نام گروه آموزشی واقعی
  let deptName = '—';
  if (me?.departmentId) {
    const [d] = await db.select({ name: departments.name }).from(departments).where(eq(departments.id, me.departmentId)).limit(1);
    if (d) deptName = d.name;
  }

  // ── ادغام کارتابل استاد و مدیر گروه ──
  // استادی که مدیر یک یا چند گروه است نباید دو حساب/دو ورود جدا داشته باشد؛
  // پنل گروه از همین‌جا یک کلیک فاصله دارد. نام گروه‌ها را هم نشان می‌دهیم تا
  // مدیرِ «دروس عمومی» بداند سرپرستی کدام گروه با اوست.
  const headed = user.roles.includes('DEP_HEAD') && me ? await headedDepartments(me.id, me.departmentId ?? null) : [];

  // نقش‌های ستادی/کارشناسی (کارشناس مالی، آموزش، …) هم باید از همین‌جا لینک
  // داشبورد مدیریت را ببینند — پیش‌تر استادِ چندنقشی هیچ راهی به /admin نداشت.
  // برای نقش‌های سفارشی (RBAC) هم اگر مجوز واقعی داشته باشد لینک ساخته می‌شود.
  const alreadyAdmin = user.roles.some(r => (ADMIN_PANEL_ROLES as readonly string[]).includes(r));
  let permissionCount = 0;
  if (!alreadyAdmin) {
    const { getUserPermissionCodes } = await import('@/lib/permissions-enforcer');
    permissionCount = (await getUserPermissionCodes(user.id).catch(() => [])).length;
  }

  // حساب‌های هم‌شخص (کد پرسنلی/دانشجویی دیگرِ همین کدملی) برای بنر جابه‌جایی
  const siblings = await getSiblingAccounts().catch(() => []);

  // قفل خودکار بیکاری — سرور-محور (مدت به تفکیک نقش؛ ۰ = غیرفعال).
  // منبع حقیقت «زمان آخرین فعالیت» است؛ پس رفرش قفل را دور نمی‌زند و کاربرِ در حال کار بیرون نمی‌افتد.
  const { evaluateIdleLock, resolveIdleTimeoutMinutes, idleMinutes, resolveReauthMinutes } = await import('@/lib/session-lock');
  const lockMin = await resolveIdleTimeoutMinutes(user.roles).catch(() => 15);
  // غیبت طولانی (بیش از SESSION_REAUTH_MINUTES) → نشست همین دستگاه بسته شود و
  // کاربر به صفحهٔ ورود برود؛ نه قفل روی صفحهٔ کهنهٔ چند ساعت پیش.
  if (lockMin > 0) {
    const reauthMin = await resolveReauthMinutes(lockMin).catch(() => 0);
    const away = reauthMin > 0 ? await idleMinutes(user.id).catch(() => null) : null;
    if (away != null && away >= reauthMin) {
      await endCurrentSession().catch(() => {});
      redirect('/login?expired=1');
    }
  }
  const lockOn = await evaluateIdleLock(user.id, lockMin).catch(() => false);

  // استاد به یک دانشگاه تعلق دارد؛ فیلتر نیمسال فقط با همان دانشگاه اعتبارسنجی می‌شود
  const universityId = me?.universityId ?? null;
  const termScope = await getTermScope(universityId);

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <header className="print:hidden bg-slate-900 text-white shadow-md border-b border-slate-800">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 p-4">
          {/* ردیف اول: لوگو + عنوان (کوتاه در موبایل) + دارک‌مود و خروج — اولیت با ابزارهای کاربر */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center font-black text-sm text-white shadow">
              آفاق
            </div>
            <UserAvatar userId={user.id} hasPhoto={!!photoRow?.photoKey} name={user.name} className="w-9 h-9" fallbackClass="bg-indigo-500" />
            <div>
                <p className="font-extrabold text-sm sm:text-base">
                  <span className="sm:hidden">کارتابل استاد</span>
                  <span className="hidden sm:inline">کارتابل جامع اعضای هیئت علمی و اساتید</span>
                </p>
                <p className="text-xs text-slate-400">{user.name}{me ? ' · کد پرسنلی: ' + me.staffCode : ''} · گروه: {deptName}</p>
              </div>
            </div>
            <div className="flex flex-nowrap items-center gap-2">
              <Link
                href="/help/professor"
                className="hidden sm:inline-flex items-center px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-slate-300 hover:text-white transition"
              >
                📖 راهنمای استاد
              </Link>
              <a
                href="/help/pdfs/professor.pdf"
                download
                className="hidden sm:inline-flex items-center px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-slate-300 hover:text-white transition"
              >
                📕 PDF
              </a>
              <ThemeToggle />
              <form action={logoutAction}>
                <button className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition">
                  <span className="sm:hidden">خروج</span>
                  <span className="hidden sm:inline">خروج از سامانه</span>
                </button>
              </form>
            </div>
          </div>
          {/* ردیف دوم: سوییچر نیمسال و نقش — کنار هم */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-nowrap items-center gap-2">
              <TermSwitcher
                terms={termScope.terms}
                selectedId={termScope.selectedId}
              />
              <PanelSwitcher
                roles={user.roles}
                current="professor"
                permissionCount={permissionCount}
                siblings={siblings}
                groupTitle={
                  headed.length === 1
                    ? headed[0].name
                    : headed.length > 1
                      ? `${headed.length.toLocaleString('fa-IR')} گروه`
                      : undefined
                }
              />
            </div>
          </div>
        </div>

      </header>

      <main className="mx-auto max-w-6xl p-4 sm:p-6 pb-24 md:pb-6">{children}</main>
      <MobileTabBar
        activeClass="text-indigo-700"
        items={[
          { href: '/professor', label: 'داشبورد', icon: '🏠', exact: true },
          { href: '/professor/schedule', label: 'برنامه', icon: '🗓️' },
          { href: '/professor/attendance', label: 'حضور و غیاب', icon: '📋' },
          { href: '/professor/grades', label: 'نمرات', icon: '📝' },
        ]}
      />
      <SessionLock name={user.name} timeoutMin={lockMin} initialLocked={lockOn} />
    </div>
  );
}
