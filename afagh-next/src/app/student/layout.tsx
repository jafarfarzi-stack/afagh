import { redirect } from 'next/navigation';
import { getStudentByUser, requireRole, endCurrentSession } from '@/lib/auth';
import { alumniOf } from '@/lib/alumni';
import { getSiblingAccounts } from '@/lib/account-switch';
import PanelSwitcher from '@/components/PanelSwitcher';
import { ADMIN_PANEL_ROLES } from '@/lib/panel-links';
import SessionLock from '@/components/SessionLock';
import TermSwitcher from '@/components/TermSwitcher';
import { getTermScope } from '@/lib/term-scope';
import { isDemoStudentUser } from '@/lib/demo-accounts';
import { DEMO_STUDENT } from '@/lib/demo-student-data';
import ThemeToggle from '@/components/ThemeToggle';
import { logoutAction } from '../login/actions';
import StudentNav, { StudentSidebar } from './StudentNav';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['STUDENT']);

  // پس از صدور مدرک، حساب کاربر از پورتال دانشجویی به پورتال دانش‌آموختگان منتقل می‌شود
  if (await alumniOf(user.id)) redirect('/alumni');

  const me = await getStudentByUser(user.id);

  const termScope = await getTermScope(me?.universityId ?? null);
  const demo = await isDemoStudentUser(user.id);
  const sidebarStudentCode = demo ? DEMO_STUDENT.studentCode : me?.studentCode ?? null;

  // حساب‌های هم‌شخص (شماره دانشجویی/کد پرسنلی دیگرِ همین کدملی) برای سوییچر بالای صفحه
  const siblings = await getSiblingAccounts().catch(() => []);

  // دانشجو معمولاً یک نقش دارد؛ فقط وقتی نقش/مجوز دیگری هم دارد سراغ RBAC می‌رویم
  // تا یک کوئری اضافه به هر بارگذاری پنل دانشجو تحمیل نشود.
  const hasStaffRole = user.roles.some(r => r !== 'STUDENT');
  const alreadyAdmin = user.roles.some(r => (ADMIN_PANEL_ROLES as readonly string[]).includes(r));
  let permissionCount = 0;
  if (hasStaffRole && !alreadyAdmin) {
    const { getUserPermissionCodes } = await import('@/lib/permissions-enforcer');
    permissionCount = (await getUserPermissionCodes(user.id).catch(() => [])).length;
  }

  // قفل خودکار بیکاری — سرور-محور (مدت به تفکیک نقش؛ ۰ = غیرفعال).
  // منبع حقیقت «زمان آخرین فعالیت» است؛ پس رفرش قفل را دور نمی‌زند و کاربرِ در حال کار بیرون نمی‌افتد.
  const { evaluateIdleLock, resolveIdleTimeoutMinutes, idleMinutes, resolveReauthMinutes } = await import('@/lib/session-lock');
  const lockMin = await resolveIdleTimeoutMinutes(user.roles).catch(() => 15);
  // غیبت طولانی → پایان نشست همین دستگاه و هدایت به صفحهٔ ورود
  if (lockMin > 0) {
    const reauthMin = await resolveReauthMinutes(lockMin).catch(() => 0);
    const away = reauthMin > 0 ? await idleMinutes(user.id).catch(() => null) : null;
    if (away != null && away >= reauthMin) {
      await endCurrentSession().catch(() => {});
      redirect('/login?expired=1');
    }
  }
  const lockOn = await evaluateIdleLock(user.id, lockMin).catch(() => false);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col" dir="rtl">
      {/* هدر اصلی */}
      <header className="bg-emerald-800 text-white shadow-md sticky top-0 z-40 print:hidden">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 p-3.5 px-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center font-bold text-base shadow-inner">
              آ
            </div>
            <div>
              <p className="text-sm font-extrabold tracking-wide">سامانه جامع آموزشی دانشگاه آفاق</p>
              <p className="text-xs text-emerald-200">میز کاربری دانشجو — {user.name}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <TermSwitcher
              terms={termScope.terms}
              selectedId={termScope.selectedId}
            />
            <a
              href="/help/student"
              className="hidden sm:inline-flex text-xs bg-emerald-700/80 hover:bg-emerald-700 text-emerald-100 border border-emerald-600 px-3 py-1.5 rounded-lg transition-colors font-medium items-center gap-1.5"
            >
              <span>📖</span>
              <span>راهنمای سیستم</span>
            </a>
            <a
              href="/help/pdfs/student.pdf"
              download
              className="hidden sm:inline-flex text-xs bg-emerald-700/80 hover:bg-emerald-700 text-emerald-100 border border-emerald-600 px-3 py-1.5 rounded-lg transition-colors font-medium items-center gap-1.5"
            >
              <span>📕</span>
              <span>PDF راهنما</span>
            </a>
            {/* سوییچ به کارتابل استاد/مدیر گروه/ستادی و سایر حساب‌های هم‌کدملی
                از همین سوییچر واحد انجام می‌شود. */}
            <PanelSwitcher
              roles={user.roles}
              current="student"
              permissionCount={permissionCount}
              siblings={siblings}
            />
            <ThemeToggle />
            <form action={logoutAction}>
              <button className="text-xs bg-emerald-900/90 hover:bg-emerald-950 text-emerald-100 border border-emerald-700/60 px-3 py-1.5 rounded-lg transition-colors font-medium">
                خروج از حساب
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* بدنه دو ستونه دسکتاپ: سایدبار سمت راست + محتوای اصلی */}
      <div className="flex-1 max-w-7xl w-full mx-auto flex flex-col md:flex-row">
        {/* سایدبار عمودی سمت راست (دسکتاپ) */}
        <StudentSidebar user={{ name: user.name, studentCode: sidebarStudentCode }} />

        {/* محتوای اصلی صفحه */}
        <main className="flex-1 min-w-0 p-3 sm:p-5 md:p-6 pb-24 md:pb-8">
          {children}
        </main>
      </div>

      {/* نوار ناوبری پایین فقط برای موبایل */}
      <StudentNav />
      <SessionLock name={user.name} timeoutMin={lockMin} initialLocked={lockOn} />
    </div>
  );
}
