/**
 * رجیستری مرکزی ماژول‌های داشبورد مدیریت (Single Source of Truth).
 *
 * هر ماژول دقیقاً همان نقش‌هایی را می‌گیرد که صفحهٔ مقصدش در `requireRole`
 * می‌پذیرد؛ بنابراین منوی بالا و کارت‌های داشبورد هرگز ماژولی را به کاربری
 * که دسترسی ندارد نشان نمی‌دهند و کلیک روی هر کارت هرگز به «redirect» نمی‌افتد.
 *
 * نقش‌ها هم‌راستا با `homeFor` و گاردهای صفحات است:
 *   ADMIN, EDU_EXPERT, ARCHIVE_EXPERT, FINANCE_EXPERT, FINANCE,
 *   MILITARY_OFFICER, VAULT_MANAGER, DEP_HEAD, VICE_EDU
 */

export interface AdminModule {
  href: string;
  icon: string;
  title: string;
  desc: string;
  /** نقش‌هایی که این ماژول را می‌بینند و می‌توانند باز کنند */
  roles: string[];
  /** گرادیان کارت در داشبورد */
  accent: string;
  /** رنگ آیکن کارت */
  iconBg: string;
  /** آیا در منوی افقی بالای صفحه هم نمایش داده شود؟ */
  inNav?: boolean;
  /** آیا به‌صورت کارت در شبکهٔ داشبورد نمایش داده شود؟ */
  inGrid?: boolean;
}

const EDU = ['ADMIN', 'EDU_EXPERT'];

export const ADMIN_MODULES: AdminModule[] = [
  {
    href: '/admin',
    icon: '📋',
    title: 'کارتابل گردش کار و جبرانی',
    desc: 'رسیدگی به درخواست‌های دانشجویی و شورای آموزشی',
    roles: EDU,
    accent: 'from-purple-950 to-indigo-950 border-purple-700/50',
    iconBg: 'bg-purple-700/80 border-purple-500/50',
    inNav: true,
    inGrid: false,
  },
  {
    href: '/admin/students',
    icon: '🎓',
    title: 'پرونده جامع دانشجویان و پرسنل',
    desc: 'پرونده، مدارک، KYC و سوابق',
    roles: ['ADMIN', 'EDU_EXPERT', 'ARCHIVE_EXPERT', 'MILITARY_OFFICER'],
    accent: 'from-slate-900 to-slate-950 border-slate-600/50',
    iconBg: 'bg-slate-700/80 border-slate-500/50',
    inNav: true,
    inGrid: true,
  },
  {
    href: '/admin/admissions',
    icon: '📥',
    title: 'پذیرش سنجش و فرمول‌ساز',
    desc: 'ثبت‌نام، سنجش و فرمول‌های پذیرش',
    roles: EDU,
    accent: 'from-sky-950 to-indigo-950 border-sky-700/50',
    iconBg: 'bg-sky-700/80 border-sky-500/50',
    inNav: true,
    inGrid: true,
  },
  {
    href: '/admin/departments',
    icon: '🏛️',
    title: 'گروه‌های آموزشی و مدیران گروه',
    desc: 'تعریف گروه، انتخاب مدیر گروه و اعضا',
    roles: ['ADMIN', 'VICE_EDU'],
    accent: 'from-cyan-950 to-slate-950 border-cyan-700/50',
    iconBg: 'bg-cyan-700/80 border-cyan-500/50',
    inNav: true,
    inGrid: true,
  },
  {
    href: '/admin/curriculum',
    icon: '📚',
    title: 'کاتالوگ و سرفصل رشته‌ها',
    desc: 'طرح‌های آموزشی و سرفصل دروس',
    roles: EDU,
    accent: 'from-emerald-950 to-teal-950 border-emerald-700/50',
    iconBg: 'bg-emerald-700/80 border-emerald-500/50',
    inNav: true,
    inGrid: true,
  },
  {
    href: '/admin/regulations',
    icon: '⚖️',
    title: 'مرکز مدیریت آیین‌نامه‌ها',
    desc: 'تدوین و نسخه‌بندی آیین‌نامه‌های آموزشی',
    roles: EDU,
    accent: 'from-stone-900 to-amber-950 border-stone-600/50',
    iconBg: 'bg-stone-700/80 border-stone-500/50',
    inNav: true,
    inGrid: true,
  },
  {
    href: '/admin/scheduling',
    icon: '🗓️',
    title: 'برنامه‌ریزی درسی مدیر گروه',
    desc: 'ماتریس حضور، سناریوها و تقویم جلسات',
    roles: EDU,
    accent: 'from-slate-900 to-indigo-900 border-slate-700/50',
    iconBg: 'bg-slate-800 border-slate-600/50',
    inNav: true,
    inGrid: true,
  },
  {
    href: '/admin/exams',
    icon: '📝',
    title: 'مدیریت و برنامه‌ریزی امتحانات',
    desc: 'موتور ضدتقلب، سالن‌ها و غیبت‌ها',
    roles: ['ADMIN', 'EDU_EXPERT', 'VAULT_MANAGER'],
    accent: 'from-indigo-900 to-indigo-950 border-indigo-700/50',
    iconBg: 'bg-indigo-700/80 border-indigo-500/50',
    inNav: true,
    inGrid: true,
  },
  {
    href: '/admin/templates',
    icon: '📨',
    title: 'قالب‌های پیامک و ارتباطات',
    desc: 'طراحی متون آزاد، تگ‌های پویا و تست',
    roles: EDU,
    accent: 'from-teal-950 to-indigo-950 border-teal-700/50',
    iconBg: 'bg-teal-800/80 border-teal-500/50',
    inNav: true,
    inGrid: true,
  },
  {
    href: '/admin/archive',
    icon: '🗄️',
    title: 'بایگانی الکترونیک مدارک',
    desc: 'اسناد، تأیید و بازیابی مدارک',
    roles: ['ADMIN', 'ARCHIVE_EXPERT'],
    accent: 'from-zinc-900 to-slate-950 border-zinc-600/50',
    iconBg: 'bg-zinc-700/80 border-zinc-500/50',
    inNav: true,
    inGrid: true,
  },
  {
    href: '/admin/payroll',
    icon: '💼',
    title: 'حقوق و دستمزد',
    desc: 'حکم کارگزینی، فیش و تسویه مالی',
    roles: ['ADMIN', 'EDU_EXPERT', 'FINANCE_EXPERT', 'FINANCE'],
    accent: 'from-cyan-950 to-sky-950 border-cyan-700/50',
    iconBg: 'bg-cyan-700/80 border-cyan-500/50',
    inNav: true,
    inGrid: true,
  },
  {
    href: '/admin/student-finance',
    icon: '💳',
    title: 'امور مالی دانشجویان',
    desc: 'شهریه، دفتر مالی و بدهی دانشجویان',
    roles: ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'],
    accent: 'from-emerald-900 to-teal-950 border-emerald-600/50',
    iconBg: 'bg-emerald-700/80 border-emerald-500/50',
    inNav: true,
    inGrid: true,
  },
  {
    href: '/admin/finance',
    icon: '🗂️',
    title: 'کارتابل کارشناس مالی',
    desc: 'فهرست کامل دانشجویان، کارنامهٔ مالی، تخفیف، بنیاد، چک و وام',
    roles: ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'],
    accent: 'from-teal-900 to-emerald-950 border-teal-600/50',
    iconBg: 'bg-teal-700/80 border-teal-500/50',
    inNav: true,
    inGrid: true,
  },
  {
    href: '/admin/tuition',
    icon: '🧮',
    title: 'موتور شهریه',
    desc: 'قواعد شهریهٔ ثابت و متغیر بر اساس نوع ترم و نوع درس',
    roles: ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'],
    accent: 'from-cyan-900 to-sky-950 border-cyan-600/50',
    iconBg: 'bg-cyan-700/80 border-cyan-500/50',
    inNav: true,
    inGrid: true,
  },
  {
    href: '/admin/student-cards',
    icon: '🪪',
    title: 'کارت دانشجویی',
    desc: 'صدور، چاپ و استعلام کارت',
    roles: EDU,
    accent: 'from-fuchsia-950 to-purple-950 border-fuchsia-700/50',
    iconBg: 'bg-fuchsia-700/80 border-fuchsia-500/50',
    inNav: true,
    inGrid: true,
  },
  {
    href: '/admin/short-courses',
    icon: '🏆',
    title: 'آموزش‌های آزاد و گواهینامه‌ها',
    desc: 'دوره‌های آزاد و صدور گواهینامه',
    roles: EDU,
    accent: 'from-amber-950 to-yellow-950 border-amber-700/50',
    iconBg: 'bg-amber-700/80 border-amber-500/50',
    inNav: true,
    inGrid: true,
  },
  {
    href: '/admin/workflows',
    icon: '🔀',
    title: 'فرآیندها، SLA و کارتابل (BPM)',
    desc: 'موتور فرآیندها و پایش گلوگاه‌ها',
    roles: EDU,
    accent: 'from-purple-950 to-indigo-950 border-purple-700/50',
    iconBg: 'bg-purple-700/80 border-purple-500/50',
    inNav: true,
    inGrid: true,
  },
  {
    href: '/admin/bi',
    icon: '📊',
    title: 'هوش تجاری ارزشیابی (BI)',
    desc: 'داشبوردها و تحلیل ارزشیابی',
    roles: ['ADMIN'],
    accent: 'from-blue-950 to-indigo-950 border-blue-700/50',
    iconBg: 'bg-blue-700/80 border-blue-500/50',
    inNav: true,
    inGrid: true,
  },
  {
    href: '/admin/permissions',
    icon: '🛡️',
    title: 'ماتریس دسترسی‌ها (RBAC)',
    desc: 'نقش‌ها، مجوزها و کاربران',
    roles: ['ADMIN'],
    accent: 'from-rose-950 to-red-950 border-rose-700/50',
    iconBg: 'bg-rose-700/80 border-rose-500/50',
    inNav: true,
    inGrid: true,
  },
  {
    href: '/admin/graduation',
    icon: '🎓',
    title: 'فارغ‌التحصیلی و مدارک',
    desc: 'تسویه‌حساب و صدور مدارک پایانی',
    roles: ['ADMIN'],
    accent: 'from-indigo-950 to-violet-950 border-indigo-700/50',
    iconBg: 'bg-indigo-700/80 border-indigo-500/50',
    inNav: true,
    inGrid: true,
  },
  {
    href: '/admin/migration',
    icon: '🔄',
    title: 'انتقال داده از سیستم قدیمی',
    desc: 'نگاشت کد، شهریه و نمرات (ETL)',
    roles: ['ADMIN'],
    accent: 'from-amber-900 to-orange-950 border-amber-700/50',
    iconBg: 'bg-amber-700/80 border-amber-500/50',
    inNav: true,
    inGrid: true,
  },
  {
    href: '/admin/settings',
    icon: '⚙️',
    title: 'پیکربندی سامانه',
    desc: 'تنظیمات سراسری و پارامترها',
    roles: ['ADMIN'],
    accent: 'from-slate-800 to-slate-950 border-slate-600/50',
    iconBg: 'bg-slate-700/80 border-slate-500/50',
    inNav: true,
    inGrid: true,
  },
];

/** آیا کاربر با این نقش‌ها مجاز به دیدن ماژول است؟ */
export function canSeeModule(roles: string[], m: AdminModule): boolean {
  if (roles.includes('ADMIN')) return true;
  return m.roles.some(r => roles.includes(r));
}

/** ماژول‌های قابل نمایش در منوی افقی برای کاربر */
export function navModules(roles: string[]): AdminModule[] {
  return ADMIN_MODULES.filter(m => m.inNav && canSeeModule(roles, m));
}

/** ماژول‌های قابل نمایش به‌صورت کارت در داشبورد برای کاربر */
export function gridModules(roles: string[]): AdminModule[] {
  return ADMIN_MODULES.filter(m => m.inGrid && canSeeModule(roles, m));
}
