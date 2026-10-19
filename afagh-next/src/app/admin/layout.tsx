import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireRole, endCurrentSession } from '@/lib/auth';
import ThemeToggle from '@/components/ThemeToggle';
import { logoutAction } from '../login/actions';
import AdminNav from './AdminNav';
import SessionLock from '@/components/SessionLock';
import PanelSwitcher from '@/components/PanelSwitcher';
import { getSiblingAccounts } from '@/lib/account-switch';
import UniversitySwitcher from './UniversitySwitcher';
import TermSwitcher from '@/components/TermSwitcher';
import { getCurrentUniversity, listUniversities, uniTheme } from '@/lib/university-scope';
import { getTermScope } from '@/lib/term-scope';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // نقش‌های اصلی شاخهٔ /admin — همان گارد پیشین بدون تغییر.
  const AREA_ROLES = [
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
  // ⚠ استثنای محدود: layout در App Router مسیر جاری را نمی‌بیند، پس نمی‌تواند
  // گارد را به یک زیرمسیر خاص دوخته کرد. کم‌ضررترین حالت این است که این دو نقش
  // شاخه را رد کنند و به کنش‌های خود برسند؛ اما تک‌تک صفحه‌ها `requireRole`
  // مستقل دارند (تنها استثنا: `regulation-check` که گارد ندارد — گزارش شود).
  //   • PROFESSOR           → فقط تأیید/رد درخواست دفاعِ پرونده‌های خودش
  //   • GRADUATION_EXPERT  → تأیید پروپوزال، تعیین وقت، ثبت نتیجه، استخر داوران
  const LIMITED_ROLES = ['PROFESSOR', 'GRADUATION_EXPERT'];

  const user = await requireRole([...AREA_ROLES, ...LIMITED_ROLES]);
  // نقش‌های سفارشی (کارشناس ثبت‌نام/فارغ‌التحصیلی و…) که مجوز دارند ولی در لیست
  // نقش‌های بالا نیستند، با داشتنِ هر مجوزِ واقعی اجازهٔ ورود به شاخهٔ /admin می‌گیرند
  // تا به ماژول‌های مجاز خودشان برسند (گاردِ هر صفحه + منو، خودش مجوز را چک می‌کند).
  if (!user.roles.some(r => AREA_ROLES.includes(r) || LIMITED_ROLES.includes(r))) {
    const { requireRoleOrPermission } = await import('@/lib/permissions-enforcer');
    await requireRoleOrPermission([], ['*']).catch(() => {});
  }
  // بارگذاری مجوزهای کاربر (بدون نقش سیستمی هم کار می‌کند) برای منوی مبتنی بر RBAC
  const { getUserPermissionCodes } = await import('@/lib/permissions-enforcer');
  const permissionCodes = await getUserPermissionCodes(user.id).catch(() => []);
  // انتخاب دانشگاه فعال، ابزار مدیریتی است؛ به دو نقش محدود بالا نشان داده نمی‌شود
  // (کنشِ `setUniversityCookie` خودش گارد ندارد — گزارش شود).
  const canSwitchUniversity = user.roles.some(r => AREA_ROLES.includes(r));
  const unis = await listUniversities();
  const curUni = await getCurrentUniversity();
  // 🔒 مرز دانشگاهی (fail-closed) — قفل کلِ شاخهٔ مدیریت:
  // وقتی کاربر به هیچ دانشگاهی مجاز نیست، `getCurrentUniversity` شناسهٔ ۰
  // (DENY_UNI) برمی‌گرداند. پیش از این، صفحه‌ها و کوئری‌های زیرشاخه با
  // «شرط حذف‌شده» اجرا می‌شدند و دادهٔ همهٔ دانشگاه‌ها را نشان می‌دادند
  // (fail-open). اینجا ورود به شاخه بسته می‌شود؛ تک‌تک مسیرهای API هم
  // مستقلاً با `universityEq` بسته شده‌اند.
  if (!(curUni.id > 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6" dir="rtl">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm">
          <p className="text-lg font-extrabold text-rose-700">دسترسی به پنل مدیریت مجاز نیست</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            حساب شما به هیچ دانشگاهی متصل نیست؛ بنابراین دادهٔ دانشگاهی برای نمایش وجود ندارد.
            لطفاً با مدیر سامانه تماس بگیرید تا دانشگاهِ حساب شما تنظیم شود.
          </p>
          <form action={logoutAction} className="mt-5">
            <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
              خروج از حساب
            </button>
          </form>
        </div>
      </div>
    );
  }
  const th = uniTheme(curUni.code);
  const termScope = await getTermScope(curUni.id);
  // قفل خودکار بیکاری — سرور-محور (مدت به تفکیک نقش؛ ۰ = غیرفعال).
  // منبع حقیقت «زمان آخرین فعالیت» است؛ پس رفرش قفل را دور نمی‌زند و کاربرِ در حال کار بیرون نمی‌افتد.
  const { evaluateIdleLock, resolveIdleTimeoutMinutes, idleMinutes, resolveReauthMinutes } = await import('@/lib/session-lock');
  const lockMin = await resolveIdleTimeoutMinutes(user.roles).catch(() => 15);
  // غیبت طولانی → نشست همین دستگاه بسته و صفحهٔ ورود (نه قفل روی دادهٔ کهنه)
  if (lockMin > 0) {
    const reauthMin = await resolveReauthMinutes(lockMin).catch(() => 0);
    const away = reauthMin > 0 ? await idleMinutes(user.id).catch(() => null) : null;
    if (away != null && away >= reauthMin) {
      await endCurrentSession().catch(() => {});
      redirect('/login?expired=1');
    }
  }
  const lockOn = await evaluateIdleLock(user.id, lockMin).catch(() => false);
  // حساب‌های هم‌شخصِ همین کدملی — برای سوییچر واحد بالای صفحه
  const siblings = await getSiblingAccounts().catch(() => []);
  return (
    <div className="min-h-screen bg-sky-50/70" data-uni={curUni.code}>
      <header className={`${th.header} text-white shadow-md transition-colors`}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 p-3.5 pl-4 pr-14 sm:pr-4">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg ${th.badge} flex items-center justify-center font-bold text-sm shadow-inner`}>
              {curUni.title.slice(0, 1)}
            </div>
            <div>
              <Link href="/admin" title="بازگشت به صفحه اول (داشبورد)" className="hover:opacity-90 transition-opacity">
                <p className="font-extrabold text-sm tracking-wide">داشبورد مدیریت جامع {curUni.title}</p>
              </Link>
              <p className="text-xs opacity-80">{user.name} · نقش‌ها: {user.roles.join('، ')}</p>
            </div>
          </div>
          {/* ردیف کنترل‌ها می‌شکند تا در موبایل صفحه را عریض نکند (سرریز ۵۰۰px+ بود) */}
          <div className="flex flex-wrap items-center gap-2">
            {/* سوییچر واحد: برگشت به کارتابل استاد/مدیر گروه/دانشجو و حساب‌های هم‌کدملی */}
            <PanelSwitcher
              roles={user.roles}
              current="admin"
              permissionCount={permissionCodes.length}
              siblings={siblings}
            />
            <TermSwitcher
              terms={termScope.terms}
              selectedId={termScope.selectedId}
            />
            {canSwitchUniversity && (
              <UniversitySwitcher
                universities={unis.map(u => ({ code: u.code, title: u.title, kind: u.kind }))}
                currentCode={curUni.code}
                buttonClass={th.badge}
              />
            )}
            <Link
              href="/help/admin"
              className={`text-xs ${th.soft} border ${th.ring} px-3 py-1.5 rounded-lg transition-colors font-medium`}
            >
              📖 راهنما
            </Link>
            <a
              href="/help/pdfs/admin.pdf"
              download
              className={`text-xs ${th.soft} border ${th.ring} px-3 py-1.5 rounded-lg transition-colors font-medium`}
            >
              📕 PDF
            </a>
            <ThemeToggle />
              <form action={logoutAction}>
              <button className={`text-xs ${th.soft} border ${th.ring} px-3 py-1.5 rounded-lg transition-colors font-medium`}>
                خروج
              </button>
            </form>
          </div>
        </div>
        <AdminNav roles={user.roles} permissions={permissionCodes} theme={th} />
      </header>
      <main className="mx-auto max-w-6xl p-3 sm:p-5 pb-16">{children}</main>
      <SessionLock name={user.name} timeoutMin={lockMin} initialLocked={lockOn} />
    </div>
  );
}
