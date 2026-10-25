import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { requireRole, endCurrentSession } from '@/lib/auth';
import ThemeToggle from '@/components/ThemeToggle';
import { logoutAction } from '../login/actions';
import AdminNav from './AdminNav';
import SessionLock from '@/components/SessionLock';
import PanelSwitcher from '@/components/PanelSwitcher';
import { getSiblingAccounts } from '@/lib/account-switch';
import UniversitySwitcher from './UniversitySwitcher';
import TermSwitcher from '@/components/TermSwitcher';
import { getCurrentUniversity, listUniversities } from '@/lib/university-scope';
import { uniThemeResolved } from '@/lib/university-theme-db';
import { getTermScope } from '@/lib/term-scope';
import UserAvatar from '@/components/UserAvatar';

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
    // کنترل‌کنندهٔ حضور و غیاب: فقط کارتابلِ خودش را می‌بیند
    // (`/admin/attendance-control`) و گاردِ همان صفحه دامنه را محدود می‌کند.
    'ATTENDANCE_CONTROLLER',
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
  const th = await uniThemeResolved(curUni.code);
  // عکس پرسنلی کاربر (برای آواتار هدر) — کلید شیء، نمایش از مسیر امن
  const [photoRow] = await db.select({ photoKey: users.photoKey }).from(users).where(eq(users.id, user.id)).limit(1);
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
  // سوییچرهای سراسری (نقش/نیمسال/دانشگاه) — ردیف دوم هدر، دقیقاً مثل کارتابل استاد.
  // روی همهٔ اندازه‌ها نمایش داده می‌شوند تا در موبایل هم دیده شوند (پیش‌تر فقط
  // دسکتاپ و وگرنه داخل کشوی ☰ می‌رفتند و کاربر موبایل آن‌ها را گم می‌کرد).
  const headerSwitchers = (
    <>
      <PanelSwitcher
        roles={user.roles}
        current="admin"
        permissionCount={permissionCodes.length}
        siblings={siblings}
      />
      <TermSwitcher terms={termScope.terms} selectedId={termScope.selectedId} />
      {canSwitchUniversity && (
        <UniversitySwitcher
          universities={unis.map(u => ({ code: u.code, title: u.title, kind: u.kind }))}
          currentCode={curUni.code}
          buttonClass={th.badge}
        />
      )}
    </>
  );
  return (
    <div className="min-h-screen bg-sky-50/70" data-uni={curUni.code}>
      <header className={`${th.header} text-white shadow-md transition-colors`}>
        {/*
          هدرِ تک‌سطری: هویت (ارم/آواتار/عنوان) + سوییچرهای نقش/نیمسال/دانشگاه +
          ابزارهای کاربر — همه در یک سطر. در عرض‌های کم، flex-wrap به‌خودی‌خود
          آن‌ها را به سطرهای بعدی می‌برد (همان رفتارِ قبلیِ دو‌سطری، فقط فشرده‌تر).

          نکته: دکمهٔ شناور «منو» (AdminNav: fixed top-3 right-3) روی همین گوشه
          می‌افتد؛ با یک فاصله‌گیرِ بی‌محتوا (w-16) جای آن در سطر رزرو می‌شود تا
          هیچ کنترلی زیر آن نرود (پیش‌تر در موبایل هم همپوشانی داشت).
        */}
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 p-3.5 pl-4 pr-4">
          {/* رزروِ جای دکمهٔ شناور «منو» */}
          <div aria-hidden className="w-16 shrink-0" />
          {/* هویت: ارم + آواتار + عنوان */}
          <div className="flex min-w-0 items-center gap-3">
            <div className={`w-8 h-8 shrink-0 rounded-lg ${th.badge} flex items-center justify-center font-bold text-sm shadow-inner`}>
              {curUni.title.slice(0, 1)}
            </div>
            <UserAvatar userId={user.id} hasPhoto={!!photoRow?.photoKey} name={user.name} className="w-9 h-9 shrink-0" fallbackClass="bg-indigo-600" />
            <div className="min-w-0">
              <Link href="/admin" title="بازگشت به صفحه اول (داشبورد)" className="block hover:opacity-90 transition-opacity">
                <p className="truncate font-extrabold text-sm tracking-wide">
                  <span className="sm:hidden">داشبورد مدیریت</span>
                  <span className="hidden sm:inline">داشبورد مدیریت جامع {curUni.title}</span>
                </p>
              </Link>
              <p className="truncate text-xs opacity-80">{user.name} · نقش‌ها: {user.roles.join('، ')}</p>
            </div>
          </div>
          {/* سوییچرهای نقش/نیمسال/دانشگاه — در همان سطرِ هویت (پیش‌تر سطر دوم بود) */}
          <div className="hdr-controls flex flex-wrap items-center gap-2">
            {headerSwitchers}
          </div>
          {/* ابزارهای کاربر — چسبیده به لبهٔ چپِ هدر (یک ارتفاع و یک تراز برای همه
              — `.hdr-controls` در globals.css) */}
          <div className="hdr-controls ms-auto flex flex-nowrap items-center gap-2">
            <Link
              href="/help/admin"
              className={`hidden sm:inline-flex text-xs ${th.soft} border ${th.ring} px-3 py-1.5 rounded-lg transition-colors font-medium`}
            >
              📖 راهنما
            </Link>
            <a
              href="/help/pdfs/admin.pdf"
              download
              className={`hidden sm:inline-flex text-xs ${th.soft} border ${th.ring} px-3 py-1.5 rounded-lg transition-colors font-medium`}
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
        <AdminNav roles={user.roles} permissions={permissionCodes} theme={th} />
      </header>
      <main className="mx-auto max-w-[1600px] p-3 sm:p-5 pb-16">{children}</main>
      <SessionLock name={user.name} timeoutMin={lockMin} initialLocked={lockOn} />
    </div>
  );
}
