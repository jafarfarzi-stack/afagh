/**
 * دادهٔ ناوبریِ مشترکِ سه کارتابل (استاد / مدیر گروه / دانشجو).
 *
 * چرا: پیش‌تر هر کارتابل ناوبریِ خودش را داشت — استاد در دسکتاپ هیچ منویی
 * نداشت (نوار پایینش `md:hidden` بود)، مدیر گروه یک نوار قرصیِ افقیِ بریده با
 * اسکرول‌بارِ پنهان داشت و سایدبار دانشجو با `sticky top-0` زیر سربرگِ ۱۱۰px
 * می‌رفت. این ماژول فقط **داده** است (بدون React) تا هم لایهٔ سرور بتواند
 * گروه‌ها را به `PortalNav` بدهد و هم فهرستِ موبایل هر کارتابل دست‌نخورده بماند.
 *
 * هیچ کلاسِ تیلویندی این‌جا «ساخته» نمی‌شود؛ همهٔ رشته‌ها ثابت‌اند تا اسکنرِ
 * Tailwind آن‌ها را ببیند.
 */

export type NavItem = { href: string; label: string; icon: string; exact?: boolean };
export type NavGroup = { key: string; title: string; items: NavItem[] };

export type PortalSurface = 'professor' | 'group-manager' | 'student';

export type PortalTheme = {
  /** عنوانِ نوارِ بالای سایدبار (و نامِ گفت‌وگوی موبایل). */
  sheetTitle: string;
  /** برچسبِ `aria-label` ناوبری. */
  navLabel: string;
  /** نوارِ رنگیِ سربرگِ سایدبار. */
  panel: string;
  /** رنگِ خط/حاشیهٔ پوسته و پانویس. */
  border: string;
  /** حالتِ عادیِ ردیف. */
  hover: string;
  /** حالتِ فعال (تینت + حلقه) — `ring-1 ring-inset` در خودِ کامپوننت می‌آید. */
  active: string;
  /** سرستونِ گروه‌ها. */
  muted: string;
  /** نوارِ لهجهٔ ۳px لبهٔ ردیفِ فعال. */
  accent: string;
  /** کاشیِ ۲۴px آیکون — عادی. */
  tile: string;
  /** کاشیِ ۲۴px آیکون — فعال. */
  tileActive: string;
  /** حلقهٔ فوکوسِ هم‌رنگِ کارتابل. */
  focus: string;
};

/* ── استاد: ۱۲ مقصد، همان‌های `PROFESSOR_NAV` ───────────────────────────── */
export const PROFESSOR_GROUPS: NavGroup[] = [
  {
    key: 'teaching',
    title: 'تدریس',
    items: [
      { href: '/professor', label: 'داشبورد', icon: '📊', exact: true },
      { href: '/professor/schedule', label: 'برنامهٔ هفتگی تدریس', icon: '🗓️' },
      { href: '/professor/attendance', label: 'ثبت حضور و غیاب', icon: '📋' },
      { href: '/professor/virtual-classes', label: 'کلاس آنلاین', icon: '📡' },
    ],
  },
  {
    key: 'assessment',
    title: 'ارزیابی',
    items: [
      { href: '/professor/grades', label: 'بارم‌بندی و ثبت نمرات', icon: '📝' },
      { href: '/professor/thesis', label: 'پایان‌نامه‌های من', icon: '🔬' },
      { href: '/professor/evaluation', label: 'ارزشیابی دانشجویان', icon: '🎯' },
      { href: '/professor/performance', label: 'کارنامهٔ عملکرد', icon: '📈' },
    ],
  },
  {
    key: 'finance',
    title: 'مالی و قرارداد',
    items: [
      { href: '/professor/contract', label: 'قرارداد تدریس و مالی', icon: '📑' },
      { href: '/professor/availability', label: 'اعلام ساعات حضور ترم', icon: '⏰' },
    ],
  },
  {
    key: 'communication',
    title: 'ارتباطات و اسناد',
    items: [
      { href: '/professor/broadcast', label: 'پیام به کلاس', icon: '📣' },
      { href: '/professor/documents', label: 'اسناد و امضا', icon: '📄' },
    ],
  },
];

/* ── مدیر گروه: ۹ مقصد، همان‌های `GroupManagerNav` ─────────────────────────
   «خانه» پیشوندِ همهٔ مسیرهاست؛ جدا نگه داشته شده تا در گروهی با عنوانِ
   «برنامه‌ریزی» (که واقعاً دربارهٔ ارائه/ترم است) گم نشود. */
export const GM_GROUPS: NavGroup[] = [
  {
    key: 'overview',
    title: 'نمای کلی',
    items: [{ href: '/group-manager', label: 'خانه', icon: '🏠', exact: true }],
  },
  {
    key: 'planning',
    title: 'برنامه‌ریزی',
    items: [
      { href: '/group-manager/offerings', label: 'ارائه‌های ترم', icon: '🗂️' },
      { href: '/group-manager/scheduling', label: 'برنامه‌ریزی درسی', icon: '🗓️' },
      { href: '/group-manager/classrooms', label: 'کلاس‌ها', icon: '🏫' },
    ],
  },
  {
    key: 'courses',
    title: 'دروس',
    items: [
      { href: '/group-manager/courses', label: 'دروس گروه', icon: '📚' },
      { href: '/group-manager/equivalence', label: 'معادل‌سازی دروس', icon: '🔁' },
    ],
  },
  {
    key: 'students',
    title: 'دانشجویان',
    items: [
      { href: '/group-manager/bypass', label: 'درخواست‌های بدون پیش‌نیاز', icon: '⤴️' },
      { href: '/group-manager/grants', label: 'تخصیص درس ترم بالاتر', icon: '⬆️' },
      { href: '/group-manager/compensatory', label: 'دانشجویان جبرانی', icon: '🧾' },
    ],
  },
];

/* ── دانشجو: ۱۲ مقصد، همان‌های `NAV_ITEMS` ───────────────────────────────── */
export const STUDENT_GROUPS: NavGroup[] = [
  {
    key: 'education',
    title: 'آموزش',
    items: [
      { href: '/student', label: 'داشبورد هوشمند', icon: '📊', exact: true },
      { href: '/student/enroll', label: 'انتخاب واحد', icon: '🛒' },
      { href: '/student/schedule', label: 'برنامه هفتگی و آزمون', icon: '📅' },
      { href: '/student/transcript', label: 'کارنامه کل دوره‌ها', icon: '📜' },
      { href: '/student/exam-card', label: 'کارت آزمون و صندلی', icon: '📇' },
    ],
  },
  {
    key: 'finance',
    title: 'مالی',
    items: [{ href: '/student/finance', label: 'امور مالی و شهریه', icon: '💳' }],
  },
  {
    key: 'services',
    title: 'خدمات',
    items: [
      { href: '/student/requests', label: 'میز خدمات و کمیسیون', icon: '📋' },
      { href: '/student/documents', label: 'مدارک و بایگانی', icon: '📁' },
      { href: '/student/virtual-classes', label: 'کلاس آنلاین و LMS', icon: '💻' },
      { href: '/student/chart', label: 'چارت مصوب سرفصل', icon: '🗺️' },
      { href: '/student/graduation', label: 'فارغ‌التحصیلی من', icon: '🎓' },
    ],
  },
  {
    key: 'thesis',
    title: 'پایان‌نامه',
    items: [{ href: '/student/thesis-proposal', label: 'پایان‌نامه و پروپوزال من', icon: '🔬' }],
  },
];

/* رنگِ هر کارتابل همان لهجهٔ فعلیِ خودش است: استاد نیلی، مدیر گروه فیروزه‌ای،
   دانشجو زمردی. رنگِ حلقه/کاشی/نوار هم هم‌خانوادهٔ همان لهجه است تا سایدبار
   شبیهِ هدرِ همان کارتابل بماند. */
export const PORTAL_THEME: Record<PortalSurface, PortalTheme> = {
  professor: {
    sheetTitle: 'منوی استاد',
    navLabel: 'ناوبری کارتابل استاد',
    panel: 'bg-indigo-700 text-white',
    border: 'border-slate-200 dark:border-slate-700',
    hover:
      'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-800/70 dark:hover:text-white',
    active:
      'bg-indigo-50 font-extrabold text-indigo-800 ring-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-100 dark:ring-indigo-800/70',
    muted: 'text-slate-500 dark:text-slate-400',
    accent: 'bg-indigo-600 dark:bg-indigo-400',
    tile: 'bg-slate-100 text-slate-500 ring-slate-200/80 group-hover:bg-white dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
    tileActive: 'bg-white text-indigo-700 ring-indigo-200 dark:bg-indigo-900/60 dark:text-indigo-200 dark:ring-indigo-700/70',
    focus:
      'focus-visible:ring-indigo-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900',
  },
  'group-manager': {
    sheetTitle: 'منوی مدیر گروه',
    navLabel: 'ناوبری کارتابل مدیر گروه',
    panel: 'bg-teal-700 text-white',
    border: 'border-slate-200 dark:border-slate-700',
    hover:
      'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-800/70 dark:hover:text-white',
    active:
      'bg-teal-50 font-extrabold text-teal-900 ring-teal-200 dark:bg-teal-950/60 dark:text-teal-100 dark:ring-teal-800/70',
    muted: 'text-slate-500 dark:text-slate-400',
    accent: 'bg-teal-600 dark:bg-teal-400',
    tile: 'bg-slate-100 text-slate-500 ring-slate-200/80 group-hover:bg-white dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
    tileActive: 'bg-white text-teal-700 ring-teal-200 dark:bg-teal-900/60 dark:text-teal-200 dark:ring-teal-700/70',
    focus:
      'focus-visible:ring-teal-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900',
  },
  student: {
    sheetTitle: 'منوی دانشجو',
    navLabel: 'ناوبری کارتابل دانشجو',
    panel: 'bg-emerald-700 text-white',
    border: 'border-slate-200 dark:border-slate-700',
    hover:
      'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-800/70 dark:hover:text-white',
    active:
      'bg-emerald-50 font-extrabold text-emerald-900 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-100 dark:ring-emerald-800/70',
    muted: 'text-slate-500 dark:text-slate-400',
    accent: 'bg-emerald-600 dark:bg-emerald-400',
    tile: 'bg-slate-100 text-slate-500 ring-slate-200/80 group-hover:bg-white dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
    tileActive: 'bg-white text-emerald-700 ring-emerald-200 dark:bg-emerald-900/60 dark:text-emerald-200 dark:ring-emerald-700/70',
    focus:
      'focus-visible:ring-emerald-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900',
  },
};
