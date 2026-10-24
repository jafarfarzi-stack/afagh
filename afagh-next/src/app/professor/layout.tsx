import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, count, eq } from 'drizzle-orm';
import { db } from '@/db';
import { electronic_documents, departments, users, professor_availabilities, universities } from '@/db/schema';
import { getStaffByUser, requireRole, endCurrentSession } from '@/lib/auth';
import { headedDepartments } from '@/lib/group-manager';
import { getSiblingAccounts } from '@/lib/account-switch';
import PanelSwitcher from '@/components/PanelSwitcher';
import { ADMIN_PANEL_ROLES } from '@/lib/panel-links';
import SessionLock from '@/components/SessionLock';
import TermSwitcher from '@/components/TermSwitcher';
import ThemeToggle from '@/components/ThemeToggle';
import MobileTabBar from '@/components/MobileTabBar';
import UserAvatar from '@/components/UserAvatar';
import { logoutAction } from '../login/actions';
import { professorTermFilter } from '@/lib/professor-term-filter';
import { getProfessorMergedClasses } from '@/lib/professor-data';
import { isDemoProfessorUser } from '@/lib/demo-accounts';
import { DEMO_DASHBOARD_SUMMARY } from '@/lib/demo-professor-data';
import { getSetting } from '@/lib/settings';

const faNum = (n: any) => (n === null || n === undefined ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]));
const faDate = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString('fa-IR') : null);

export default async function ProfessorLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['PROFESSOR']);
  const me = await getStaffByUser(user.id);
  // عکس پرسنلی استاد (برای آواتار هدر) — کلید شیء، نمایش از مسیر امن
  const [photoRow] = await db.select({ photoKey: users.photoKey }).from(users).where(eq(users.id, user.id)).limit(1);

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
  // professorTermFilter (به‌جای getTermScope) چون ردیف کامل ترم — از جمله
  // gradeEntryDeadline — را برای کاشی «مهلت نهایی‌سازی نمرات» در سربرگ می‌خواهیم.
  const termFilter = await professorTermFilter(universityId);
  const termScope = { terms: termFilter.terms, selectedId: termFilter.selectedTerm?.id ?? null };
  const term = termFilter.term;

  // ── داده‌های سربرگ ادغام‌شده (جای کارت هیروی داشبورد) ─────────────────────
  // پیش از این، خوش‌آمدگویی/کد پرسنلی/چهار کاشی وضعیت در یک کارت بنفش جداگانه
  // زیر هدر نمایش داده می‌شد و دو دکمهٔ آن («برنامه هفتگی»، «قرارداد») با
  // کاشی‌های دسترسی سریع داشبورد تکرار داشتند. حالا همه در یک بلوک بالای صفحه‌اند.
  const demo = me ? await isDemoProfessorUser(user.id) : false;

  const [uniRow, availabilityRows, mergedClasses, termDocs] = await Promise.all([
    universityId
      ? db.select({ title: universities.title, logoUrl: universities.logoUrl }).from(universities).where(eq(universities.id, universityId)).limit(1)
      : Promise.resolve([]),
    me && term
      ? db.select({ n: count() }).from(professor_availabilities)
          .where(and(eq(professor_availabilities.staffId, me.id), eq(professor_availabilities.termId, term.id)))
      : Promise.resolve([]),
    me && term ? getProfessorMergedClasses(me.id, term.id, universityId) : Promise.resolve(null),
    me
      ? db.select({ termId: electronic_documents.termId, signatureStatus: electronic_documents.signatureStatus })
          .from(electronic_documents).where(eq(electronic_documents.staffId, me.id))
      : Promise.resolve([]),
  ]);
  const universityLogoUrl = uniRow?.[0]?.logoUrl || (await getSetting('UNIVERSITY_LOGO').catch(() => '')) || null;
  const availabilityCount = Number(availabilityRows?.[0]?.n ?? 0);
  const classCount = mergedClasses?.mergedClassGroups.length ?? 0;

  // وضعیت امضای اسناد این ترم — از فهرست اسناد استاد مشتق می‌شود
  const termDocRows = term ? termDocs.filter(d => d.termId === term.id) : [];
  const signatureStatus = termDocRows.some(d => d.signatureStatus === 'SIGNED')
    ? 'SIGNED'
    : termDocRows.length > 0
      ? 'PENDING'
      : 'NONE';
  const gradeDeadline = term?.gradeEntryDeadline ?? null;

  // مقادیر کاشی‌های وضعیت — برای حساب دمو، دادهٔ نمایشی
  const summary = {
    classCount: demo ? DEMO_DASHBOARD_SUMMARY.classCount : classCount,
    availabilityLabel: demo ? DEMO_DASHBOARD_SUMMARY.availabilityLabel : 'اعلام ساعات حضور ترم:',
    availabilityValue: demo
      ? DEMO_DASHBOARD_SUMMARY.availabilityValue
      : availabilityCount > 0
        ? `${faNum(availabilityCount)} بازهٔ زمانی ثبت شده`
        : 'ثبت نشده',
    contractLabel: demo ? DEMO_DASHBOARD_SUMMARY.contractLabel : 'قرارداد حق‌التدریس:',
    contractValue: demo
      ? DEMO_DASHBOARD_SUMMARY.contractValue
      : signatureStatus === 'SIGNED'
        ? 'امضا شده'
        : signatureStatus === 'PENDING'
          ? 'در انتظار امضای الکترونیک'
          : 'سندی ثبت نشده',
    gradeDeadlineValue: demo
      ? DEMO_DASHBOARD_SUMMARY.gradeDeadlineValue
      : gradeDeadline
        ? faDate(gradeDeadline)
        : 'تعیین نشده',
  };

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <header className="print:hidden bg-slate-900 text-white shadow-md border-b border-slate-800">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 p-4">
          {/* ردیف اول: ارم + آواتار + خوش‌آمدگویی و هویت + ابزارهای کاربر */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              {/* ارم دانشگاه جای حرف ثابت «آفاق» — اگر ارمی ثبت نشده باشد،
                  همان حرف به‌عنوان fallback نمایش داده می‌شود */}
              {universityLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={universityLogoUrl}
                  alt="نشان دانشگاه"
                  className="w-9 h-9 rounded-xl bg-white object-contain p-0.5 shadow shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center font-black text-sm text-white shadow shrink-0">
                  آفاق
                </div>
              )}
              <UserAvatar userId={user.id} hasPhoto={!!photoRow?.photoKey} name={user.name} className="w-9 h-9" fallbackClass="bg-indigo-500" />
              <div className="min-w-0">
                <p className="font-extrabold text-sm sm:text-base truncate">
                  خوش آمدید، استاد گرامی {user.name}
                </p>
                <p className="text-xs text-slate-400 truncate">
                  کد پرسنلی: {me ? faNum(me.staffCode) : '—'}
                  {me?.academicRank ? ` · مرتبه علمی: ${me.academicRank}` : ''}
                  {` · گروه: ${deptName}`}
                </p>
              </div>
            </div>
            {/* یک ارتفاع و یک تراز برای همهٔ کنترل‌ها (`.hdr-controls` در globals.css) */}
            <div className="hdr-controls flex flex-nowrap items-center gap-2">
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
          {/* کاشی‌های وضعیت — ادغام‌شده از کارت هیروی حذف‌شدهٔ داشبورد */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] sm:text-xs">
            <div className="bg-white/10 p-2 rounded-2xl border border-white/10">
              <span className="text-indigo-200 block mb-0.5">تعداد کلاس‌های ترم:</span>
              <span className="font-extrabold text-white text-sm">
                {faNum(summary.classCount)} {DEMO_DASHBOARD_SUMMARY.classCountLabel}
              </span>
            </div>
            <div className="bg-white/10 p-2 rounded-2xl border border-white/10">
              <span className="text-indigo-200 block mb-0.5">{summary.availabilityLabel}</span>
              <span className="font-extrabold text-sm text-emerald-300">{summary.availabilityValue}</span>
            </div>
            <div className="bg-white/10 p-2 rounded-2xl border border-white/10">
              <span className="text-indigo-200 block mb-0.5">{summary.contractLabel}</span>
              <span className="font-extrabold text-amber-300 text-sm">{summary.contractValue}</span>
            </div>
            <div className="bg-white/10 p-2 rounded-2xl border border-white/10">
              <span className="text-indigo-200 block mb-0.5">مهلت نهایی‌سازی نمرات:</span>
              <span className="font-extrabold text-white text-sm">{summary.gradeDeadlineValue}</span>
            </div>
          </div>

          {/* ردیف دوم: سوییچر نیمسال و نقش — کنار هم */}
          <div className="hdr-controls flex flex-wrap items-center gap-2 lg:flex-nowrap lg:shrink-0">
            <div className="hdr-controls flex flex-nowrap items-center gap-2">
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
