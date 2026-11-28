import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { endCurrentSession, getSessionUser, homeFor } from '@/lib/auth';
import HeaderActions from '@/components/HeaderActions';
import { logoutAction } from '../login/actions';
import AdminNav from './AdminNav';
import SessionLock from '@/components/SessionLock';
import PanelSwitcher from '@/components/PanelSwitcher';
import { getSiblingAccounts } from '@/lib/account-switch';
import { ROLE_LABELS } from '@/lib/panel-links';
import UniversitySwitcher from './UniversitySwitcher';
import TermSwitcher from '@/components/TermSwitcher';
import { getCurrentUniversity, listUniversities } from '@/lib/university-scope';
import { uniThemeResolved } from '@/lib/university-theme-db';
import { getTermScope } from '@/lib/term-scope';
import UserAvatar from '@/components/UserAvatar';
import AdminBackBar from '@/components/AdminBackBar';
import { ADMIN_MODULES, canSeeModule } from '@/lib/admin-modules';
import RoleTour from '@/components/tour/RoleTour';

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
 // • PROFESSOR → فقط تأیید/رد درخواست دفاعِ پرونده‌های خودش
 // • GRADUATION_EXPERT → تأیید پروپوزال، تعیین وقت، ثبت نتیجه، استخر داوران
 const LIMITED_ROLES = ['PROFESSOR', 'GRADUATION_EXPERT'];

 // گاردِ شاخهٔ /admin: نقش‌های شناخته‌شده همیشه عبور می‌کنند؛ نقشِ سفارشی (یا
 // نقشی که فقط از ماتریس دسترسی، مجوزِ یک ماژول را گرفته) اگر حداقل یک
 // ماژولِ منو را ببیند هم عبور می‌کند. گاردِ هر صفحه همچنان مستقل است.
 // ⚠ پیش‌تر `requireRole` این‌جا صدا زده می‌شد و نقشِ سفارشی پیش از رسیدن به
 // بررسیِ مجوز، redirect می‌شد؛ یعنی مجوزهای ماتریس برایشان بی‌اثر بود.
 const user = await getSessionUser({ allowPendingPasswordChange: true });
 if (!user) redirect('/login');
 if (user.mustChangePassword) redirect('/change-password');
 const hasAreaRole = user.roles.some(r => r === 'ADMIN' || AREA_ROLES.includes(r) || LIMITED_ROLES.includes(r));
 if (!hasAreaRole) {
 const { getUserPermissionCodes } = await import('@/lib/permissions-enforcer');
 const codes = await getUserPermissionCodes(user.id).catch(() => [] as string[]);
 const seesModule = ADMIN_MODULES.some(m => m.inNav && canSeeModule(user.roles, m, codes));
 if (!seesModule) redirect(homeFor(user.roles));
 }
 // ── ⚡ واکشیِ موازیِ سربرگ ─────────────────────────────────────────────────
 // پیش‌تر این‌ها **پشتِ سرِ هم** اجرا می‌شدند: مجوزها، مجوزهای سفارشی، فهرست
 // دانشگاه‌ها، دانشگاه فعال، عکس، مدتِ قفل و حساب‌های هم‌شخص — یعنی ۷ رفت‌و‌برگشتِ
 // دیتابیس که تأخیرشان جمع می‌شد. هیچ‌کدام به هم وابسته نیستند، پس با هم اجرا
 // می‌شوند؛ فقط مرحلهٔ دوم (تم/نیمسال/قفل) به `curUni` و `lockMin` نیاز دارد.
 const { getUserPermissionCodes, getUserCustomPermissionCodes } = await import('@/lib/permissions-enforcer');
 const { evaluateIdleLock, resolveIdleTimeoutMinutes, idleMinutes, resolveReauthMinutes } = await import('@/lib/session-lock');

 const [
 permissionCodes,
 customPermissionCodes,
 unis,
 curUni,
 photoRows,
 lockMin,
 siblings,
 ] = await Promise.all([
 // بارگذاری مجوزهای کاربر (بدون نقش سیستمی هم کار می‌کند) برای منوی مبتنی بر RBAC
 getUserPermissionCodes(user.id).catch(() => [] as string[]),
 // سوییچر کارتابل‌ها فقط باید مجوزهای «نقش سفارشی» را ملاک بگیرد (نه مجوزهای
 // ذاتیِ نقش‌های سیستمی)؛ وگرنه مدیرگروه/استادِ صرف هم لینک «داشبورد مدیریت»
 // می‌بیند. `permissionCodes` بالا برای منوی مبتنی بر RBAC دست‌نخورده می‌ماند.
 getUserCustomPermissionCodes(user.id).catch(() => [] as string[]),
 listUniversities(),
 getCurrentUniversity(),
 // عکس پرسنلی کاربر (برای آواتار هدر) — کلید شیء، نمایش از مسیر امن
 db.select({ photoKey: users.photoKey }).from(users).where(eq(users.id, user.id)).limit(1),
 resolveIdleTimeoutMinutes(user.roles).catch(() => 15),
 // حساب‌های هم‌شخصِ همین کدملی — برای سوییچر واحد بالای صفحه
 getSiblingAccounts().catch(() => []),
 ]);
 const customPermissionCount = customPermissionCodes.length;
 const [photoRow] = photoRows;
 // انتخاب دانشگاه فعال، ابزار مدیریتی است؛ به دو نقش محدود بالا نشان داده نمی‌شود
 // (کنشِ `setUniversityCookie` خودش گارد ندارد — گزارش شود).
 const canSwitchUniversity = user.roles.some(r => AREA_ROLES.includes(r));
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
 // مرحلهٔ دوم — وابسته به `curUni` و `lockMin`؛ این سه هم با هم می‌روند.
 const [th, termScope, lockOn] = await Promise.all([
 uniThemeResolved(curUni.code),
 getTermScope(curUni.id),
 evaluateIdleLock(user.id, lockMin).catch(() => false),
 ]);
 // غیبت طولانی → نشست همین دستگاه بسته و صفحهٔ ورود (نه قفل روی دادهٔ کهنه)
 if (lockMin > 0) {
 const reauthMin = await resolveReauthMinutes(lockMin).catch(() => 0);
 const away = reauthMin > 0 ? await idleMinutes(user.id).catch(() => null) : null;
 if (away != null && away >= reauthMin) {
 await endCurrentSession().catch(() => {});
 redirect('/login?expired=1');
 }
 }
 // سوییچرهای سراسری (نقش/نیمسال/دانشگاه) — ردیف دوم هدر، دقیقاً مثل کارتابل استاد.
 // روی همهٔ اندازه‌ها نمایش داده می‌شوند تا در موبایل هم دیده شوند (پیش‌تر فقط
 // دسکتاپ و وگرنه داخل کشوی ☰ می‌رفتند و کاربر موبایل آن‌ها را گم می‌کرد).
 const headerSwitchers = (
 <>
 <PanelSwitcher
 roles={user.roles}
 current="admin"
 permissionCount={customPermissionCount}
 siblings={siblings}
 />
 {/* نشانهٔ تور آشنایی — همین جعبهٔ انتخاب نیمسال را برجسته می‌کند.
 (خودِ `TermSwitcher` مشترک است و نباید برای این کار تغییر کند.)
 ⚠ جعبهٔ اضافه، `summary` را از قاعدهٔ هدرِ `.hdr-controls > details
 > summary` (globals.css) خارج می‌کند؛ همان ارتفاع/چیدمان با
 واریانت‌های زیر دقیقاً بازسازی می‌شود تا ردیف هدر جابه‌جا نشود. */}
 <div
 data-tour="term-switcher"
 className="flex items-center [&>details>summary]:inline-flex [&>details>summary]:h-8 [&>details>summary]:items-center [&>details>summary]:whitespace-nowrap"
 >
 <TermSwitcher terms={termScope.terms} selectedId={termScope.selectedId} />
 </div>

 </>
 );
 return (
 <div className="app-page min-h-screen bg-sky-50/70 print:!bg-white" data-uni={curUni.code}>
 {/* `.app-header` (globals.css) یک درخششِ ملایم از بالا و یک خطِ موییِ
 روشن در پایین اضافه می‌کند تا سربرگ روی هر رنگِ دانشگاه از بدنهٔ
 صفحه جدا دیده شود؛ رنگِ پایه همان توکنِ دانشگاه است و دست‌نخورده
 می‌ماند. */}
 <header className={`app-header ${th.header} text-white transition-colors sticky top-0 z-40 print:hidden`}>
 {/*
 هدرِ دو‌ردیفیِ صریح (همان الگوی کارتابل استاد):
 ردیف ۱ — [جای دکمهٔ شناور «منو»] + هویت + ابزارها
 ردیف ۲ — سوییچرهای کارتابل / نیمسال / دانشگاه

 پیش‌تر همه در یک سطرِ flex-wrap بودند؛ در موبایل ترتیبشان به‌هم
 می‌ریخت، سوییچرها زیر دکمهٔ شناور می‌افتادند و چیپِ دانشگاه از لبهٔ
 صفحه بیرون می‌زد. با دو ردیفِ صریح، ترتیب در همهٔ عرض‌ها پایدار است.
 ⚠ این هدر مشترکِ **همهٔ** نقش‌های شاخهٔ مدیریت است (ADMIN، EDU_EXPERT،
 FINANCE_EXPERT، ARCHIVE_EXPERT، DEP_HEAD، VICE_EDU و…)، پس اصلاح
 همین‌جا برای همهٔ کارتابل‌ها اعمال می‌شود.
 */}
 <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 p-3 sm:p-3.5 lg:flex-nowrap lg:gap-3">
 {/* ردیف ۱: هویت + ابزارهای کاربر */}
 <div className="order-1 flex min-w-0 flex-1 items-center gap-2">
 {/* رزروِ جای دکمهٔ شناور «منو» (AdminNav: fixed top-3 right-3) — فقط موبایل؛
 در دسکتاپ ناوبری به سایدبار منتقل شده و این فضا لازم نیست. */}
 <div aria-hidden className="w-14 shrink-0 lg:hidden" />
 {/* هویت: سوییچر دانشگاه + ارم + آواتار + عنوان */}
 <div className="flex min-w-0 flex-1 items-center gap-2.5">
 {canSwitchUniversity && (
 <div className="shrink-0">
 <UniversitySwitcher
 universities={unis.map(u => ({ code: u.code, title: u.title, kind: u.kind }))}
 currentCode={curUni.code}
 buttonClass={th.badge}
 />
 </div>
 )}
 {curUni.logoUrl ? (
 // eslint-disable-next-line @next/next/no-img-element
 <img src={curUni.logoUrl} alt="نشان دانشگاه" className="w-9 h-9 rounded-xl bg-white object-contain p-0.5 shadow-inner shrink-0" />
 ) : (
 <div className={`w-9 h-9 shrink-0 rounded-xl ${th.badge} flex items-center justify-center font-bold text-sm shadow-inner`}>
 {curUni.title.slice(0, 1)}
 </div>
 )}
 <UserAvatar userId={user.id} hasPhoto={!!photoRow?.photoKey} name={user.name} className="w-9 h-9 shrink-0" fallbackClass="bg-indigo-600" />
 <div className="min-w-0">
 <Link href="/admin" prefetch={false} title="بازگشت به صفحه اول (داشبورد)" className="block hover:opacity-90 transition-opacity">
 <p className="truncate font-extrabold text-sm tracking-wide">
 <span className="sm:hidden">داشبورد مدیریت</span>
 <span className="hidden sm:inline">داشبورد مدیریت جامع {curUni.title}</span>
 </p>
 </Link>
 <p className="truncate text-2xs sm:text-xs opacity-80">
 {user.name} · {user.roles.map(r => ROLE_LABELS[r] ?? r).join('، ')}
 </p>
 </div>
 </div>
 </div>

 {/* ردیف ۲ (موبایل) / ستونِ میانیِ همان خط (دسکتاپ): سوییچرهای
 کارتابل / نیمسال — مشترک بین همهٔ نقش‌ها (سوییچر دانشگاه کنار ارم در ردیف ۱ است).
 `relative` لازم است: در موبایل پنل هر سوییچر تمام‌عرض و چسبیده به
 همین ردیف باز می‌شود تا از لبهٔ صفحه بیرون نزند.
 در دسکتاپ `lg:order-2` این بلوک را بین هویت و ابزارها می‌آورد تا
 همهٔ عناصر هدر در یک خط و هم‌تراز بنشینند (درخواست کاربر: پیش‌تر
 سوییچرها یک سطح پایین‌تر از ابزارها بودند و پراکنده دیده می‌شدند). */}
 <div className="hdr-controls relative order-3 flex w-full flex-wrap items-center gap-1.5 sm:gap-2 lg:order-2 lg:w-auto lg:flex-nowrap lg:justify-center">
 {headerSwitchers}
 </div>

 {/* ابزارهای کاربر — یک ارتفاع و یک تراز، از کامپوننت مشترک
 `HeaderActions` (راهنما/PDF/تم/خروج) که در هر سه کارتابل یکی است. */}
 <div className="hdr-controls order-2 flex shrink-0 items-center gap-1.5 lg:order-3">
 <HeaderActions helpHref="/help/admin" pdfHref="/help/pdfs/admin.pdf" theme={th} />
 </div>
 </div>
 </header>
 {/* بدنهٔ دوستونه در دسکتاپ: سایدبارِ دائمی (AdminNav در `lg+` به سایدبار
 تبدیل می‌شود) + محتوا. در موبایل سایدبار وجود ندارد و فقط دکمهٔ
 شناور «منو» با کشو کار می‌کند. */}
 <div className="mx-auto flex w-full max-w-[2100px] items-start gap-4 p-3 pb-16 sm:p-5 lg:gap-6">
 <AdminNav roles={user.roles} permissions={permissionCodes} theme={th} />
 <main id="main" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto pb-4 scroll-mt-[6rem]">
 {/* نوارِ بازگشت — **دو سطحی**: اگر زیرصفحهٔ یک کارتابل باشیم (مثل
 `/admin/finance/pos`) به همان کارتابل (`/admin/finance`) برمی‌گردد،
 نه به داشبورد کل؛ و میان‌بر داشبورد هم کنارش می‌ماند.
 فهرست مقصدها از رجیستری ماژول‌ها می‌آید و به مجوزهای همین کاربر
 محدود است تا لینکِ بازگشت هرگز به صفحهٔ «دسترسی ندارید» نرسد. */}
 <AdminBackBar
 modules={ADMIN_MODULES
 .filter(m => canSeeModule(user.roles, m, permissionCodes))
 .map(m => ({ href: m.href, title: m.title }))}
 />
 {children}
 </main>
 </div>
 <SessionLock name={user.name} timeoutMin={lockMin} initialLocked={lockOn} />
 {/* تور آشناییِ نخستین ورود — فقط صفحهٔ /admin و فقط یک بار (نسخهٔ v1). */}
 <RoleTour surface="admin" />
 </div>
 );
}
