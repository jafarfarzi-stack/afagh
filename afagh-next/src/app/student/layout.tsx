import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users, universities } from '@/db/schema';
import { getStudentByUser, requireRole, endCurrentSession } from '@/lib/auth';
import { getSetting } from '@/lib/settings';
import { majors as majorsTable } from '@/db/schema';
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
import UserAvatar from '@/components/UserAvatar';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['STUDENT']);

  // پس از صدور مدرک، حساب کاربر از پورتال دانشجویی به پورتال دانش‌آموختگان منتقل می‌شود
  if (await alumniOf(user.id)) redirect('/alumni');

  const me = await getStudentByUser(user.id);
  // عکس پرسنلی کاربر (برای آواتار هدر) — کلید شیء، نمایش از مسیر امن
  const [photoRow] = await db.select({ photoKey: users.photoKey }).from(users).where(eq(users.id, user.id)).limit(1);

  // ارم دانشگاه دانشجو — جای حرف ثابت «آ» در هدر. اول ارم اختصاصی خود دانشگاه
  // (ستون universities.logoUrl)، بعد ارم سراسری تنظیمات؛ اگر هیچ‌کدام نبود،
  // همان حرف «آ» به‌عنوان Fallback نمایش داده می‌شود تا چیدمان هدر نشکند.
  const uniLogoRow = me?.universityId
    ? await db.select({ logoUrl: universities.logoUrl }).from(universities).where(eq(universities.id, me.universityId)).limit(1)
    : [];
  const universityLogoUrl = uniLogoRow?.[0]?.logoUrl || (await getSetting('UNIVERSITY_LOGO').catch(() => '')) || null;

  // نام رشتهٔ دانشجو — به‌جای عبارت تکراری «کارتابل دانشجو» در سربرگ، خوش‌آمدگویی
  // و رشتهٔ 학생 نمایش داده می‌شود (هیروی داشبورد هم خوش‌آمدگویی دارد؛ اینجا
  // هویت تحصیلی کافی است تا سربرگ خالی و تکراری نباشد).
  const majorRow = me?.majorId
    ? await db.select({ name: majorsTable.name }).from(majorsTable).where(eq(majorsTable.id, me.majorId)).limit(1)
    : [];
  const majorTitle = majorRow?.[0]?.name ?? null;
  const firstName = (user.name || '').trim().split(/\s+/)[0] || 'دانشجو';

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
      {/* هدر اصلی — دو ردیفی مثل کارتابل استاد:
          ردیف۱ = لوگو + عنوان (کوتاه در موبایل) + دارک‌مود و خروج قرمز
          ردیف۲ = سوییچر ترم و نقش (همیشه دیده می‌شود؛ پیش‌تر همه با flex-wrap
          درهم می‌پیچید و هدر موبایل شلوغ و بلند می‌شد) */}
      <header className="bg-emerald-800 text-white shadow-md sticky top-0 z-40 print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col gap-2 p-3.5 px-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              {/* ارم دانشگاه جای حرف ثابت «آ» — اگر ارمی ثبت نشده باشد،
                  حرف «آ» به‌عنوان fallback نمایش داده می‌شود */}
              {universityLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={universityLogoUrl}
                  alt="نشان دانشگاه"
                  className="w-9 h-9 rounded-lg bg-white object-contain p-0.5 shadow-inner shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center font-bold text-base shadow-inner shrink-0">
                  آ
                </div>
              )}
              <UserAvatar userId={user.id} hasPhoto={!!photoRow?.photoKey} name={user.name} className="w-9 h-9" fallbackClass="bg-emerald-700" />
              <div className="min-w-0">
                <p className="text-sm font-extrabold tracking-wide truncate">
                  خوش‌آمدی {firstName} 👋
                </p>
                <p className="text-xs text-emerald-200 truncate">
                  {majorTitle || 'دانشجوی گرامی'}
                  {me?.entryYear ? ` · ورودی سال ${me.entryYear}` : ''}
                </p>
              </div>
            </div>
            <div className="flex flex-nowrap items-center gap-2">
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
              <ThemeToggle />
              <form action={logoutAction}>
                <button className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition">
                  <span className="sm:hidden">خروج</span>
                  <span className="hidden sm:inline">خروج از حساب</span>
                </button>
              </form>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TermSwitcher
              terms={termScope.terms}
              selectedId={termScope.selectedId}
            />
            {/* سوییچ به کارتابل استاد/مدیر گروه/ستادی و سایر حساب‌های هم‌کدملی
                از همین سوییچر واحد انجام می‌شود. */}
            <PanelSwitcher
              roles={user.roles}
              current="student"
              permissionCount={permissionCount}
              siblings={siblings}
            />
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
