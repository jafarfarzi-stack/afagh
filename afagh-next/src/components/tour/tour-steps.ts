/**
 * دادهٔ خالصِ «تور آشناییِ نخستین ورود» — بدون هیچ وابستگی به React یا DOM.
 *
 * چرا جدا: هم `RoleTour` (کلاینت) و هم `TourReplayButton` و صفحهٔ راهنما از یک
 * منبع می‌خوانند؛ اگر متن/لنگرها اینجا یکی باشد، تور هر کارتابل با یک نسخه‌شدن
 * (`TOUR_VERSION`) دوباره برای همه نمایش داده می‌شود و هیچ‌کدام از سه نسخه عقب
 * نمی‌ماند.
 *
 * ⚠ هر `anchor` یک انتخابگرِ CSS است. ترتیب اهمیت: اول `anchor` (نشانهٔ
 * `data-tour` که مالکِ آن صفحه اضافه می‌کند)، بعد `fallback` (سلکتورِ موجودِ
 * امروز). اگر هیچ‌کدام دیده نشوند، لایهٔ تور به «شیت پایین» می‌رود تا کاربر
 * بی‌راه نماند.
 */

export const TOUR_VERSION = 'v1';

export type Surface = 'admin' | 'professor' | 'student';

/** کلید localStorage؛ نسخه داخل کلید است تا با تغییر متن‌ها تور دوباره اجرا شود. */
export function keyFor(surface: Surface): string {
  return `afagh.tour.${TOUR_VERSION}.${surface}`;
}

export type Placement = 'auto' | 'top' | 'bottom';

export type Step = {
  id: string;
  anchor: string;
  fallback?: string;
  title: string;
  /** یک جملهٔ توضیح «این دکمه چه کار می‌کند». */
  body: string;
  /** خطِ «اقدام: …» — دقیقاً می‌گوید کجا کلیک شود. */
  action: string;
  placement?: Placement;
};

/** نامِ خوانا برای همان نوع (بقیهٔ کامپوننت‌ها از این استفاده می‌کنند). */
export type TourStep = Step;

/** صفحهٔ اولِ هر کارتابل؛ تور فقط همین‌جا اجرا می‌شود. */
export const HOME_PATH: Record<Surface, string> = {
  admin: '/admin',
  professor: '/professor',
  student: '/student',
};

export const TOUR_STEPS: Record<Surface, TourStep[]> = {
  admin: [
    {
      id: 'hero',
      anchor: '[data-tour="hero"]',
      fallback: 'main section',
      title: 'ویترین کارتابل',
      body: 'این نوار خلاصهٔ وضعیت و آمار امروز دانشگاه شماست؛ شاخص‌های کلیدی همین‌جا دیده می‌شوند.',
      action: 'اقدام: آمار را ببینید و از کاشی‌های پایین به حوزهٔ کاری بروید.',
      placement: 'bottom',
    },
    {
      id: 'groups',
      anchor: '[data-tour="admin-groups"]',
      fallback: 'main a[href^="/admin/c/"]',
      title: 'دسته‌های کاری',
      body: 'هر کاشی یک حوزهٔ کاری است و همهٔ ماژول‌های مرتبط را یک‌جا دارد.',
      action: 'اقدام: روی کاشی حوزهٔ موردنظر کلیک کنید.',
      placement: 'bottom',
    },
    {
      id: 'term',
      anchor: '[data-tour="term-switcher"]',
      fallback: 'header details',
      title: 'انتخاب نیمسال',
      body: 'نیمسال فعال، فهرست‌ها و کارنامه‌ها را بر اساس همان ترم فیلتر می‌کند.',
      action: 'اقدام: دکمهٔ «نیمسال» را بزنید و ترم موردنظر را انتخاب کنید.',
      placement: 'bottom',
    },
    {
      id: 'nav',
      anchor: '[data-tour="admin-nav-search"]',
      fallback: '[data-tour="admin-nav-trigger"], aside input, button[aria-label="باز کردن منوی مدیریت"]',
      title: 'جست‌وجوی ماژول',
      body: 'اگر نام ماژول را نمی‌دانید، از همین کادر جست‌وجو پیدایش کنید.',
      action: 'اقدام: منو را باز کنید و نام ماژول را در کادر جست‌وجو بنویسید.',
      placement: 'bottom',
    },
    {
      id: 'inbox',
      anchor: '[data-tour="admin-inbox"]',
      fallback: 'main table',
      title: 'کارتابل درخواست‌ها',
      body: 'درخواست‌های دانشجویان با آخرین وضعیت و دکمهٔ اقدام همین‌جاست.',
      action: 'اقدام: ردیف یک درخواست را باز کنید و تأیید یا رد کنید.',
      placement: 'top',
    },
    {
      id: 'help',
      anchor: '[data-tour="help"]',
      fallback: 'a[href="/help/admin"]',
      title: 'راهنمای گام‌به‌گام',
      body: 'برای هر نقش راهنمای گام‌به‌گام و فایل PDF جدا وجود دارد.',
      action: 'اقدام: روی «راهنما» در سربرگ بزنید.',
      placement: 'bottom',
    },
  ],

  professor: [
    {
      id: 'hero',
      anchor: '[data-tour="professor-hero"]',
      fallback: 'main section',
      title: 'کارتابل استاد',
      body: 'خلاصهٔ کلاس‌ها، حضور و غیاب و نمرات شما در یک نگاه.',
      action: 'اقدام: آمار همین نوار را ببینید و از کاشی‌ها کار روزانه را شروع کنید.',
      placement: 'bottom',
    },
    {
      id: 'grades',
      anchor: '[data-tour="professor-grades"]',
      fallback: 'a[href="/professor/grades"]',
      title: 'ثبت نمرات',
      body: 'نمرهٔ هر کلاس را از همین بخش وارد و نهایی کنید.',
      action: 'اقدام: روی کاشی «ثبت نمرات» بزنید.',
      placement: 'bottom',
    },
    {
      id: 'attendance',
      anchor: '[data-tour="professor-attendance"]',
      fallback: 'a[href="/professor/attendance"]',
      title: 'حضور و غیاب',
      body: 'حضور هر جلسهٔ کلاس را همین‌جا ثبت و ویرایش کنید.',
      action: 'اقدام: روی «ثبت حضور و غیاب» بزنید.',
      placement: 'bottom',
    },
    {
      id: 'schedule',
      anchor: '[data-tour="professor-schedule"]',
      fallback: 'a[href="/professor/schedule"]',
      title: 'برنامهٔ هفتگی',
      body: 'زمان و مکان کلاس‌های هفته را در یک جدول ببینید.',
      action: 'اقدام: روی کاشی «برنامه هفتگی» بزنید.',
      placement: 'bottom',
    },
    {
      id: 'contract',
      anchor: '[data-tour="professor-contract"]',
      fallback: 'a[href="/professor/contract"]',
      title: 'قرارداد و مالی',
      body: 'قرارداد تدریس و وضعیت مالی حق‌التدریس را اینجا پیگیری کنید.',
      action: 'اقدام: روی «قرارداد تدریس و مالی» بزنید.',
      placement: 'bottom',
    },
    {
      id: 'help',
      anchor: '[data-tour="help"]',
      fallback: 'a[href="/help/professor"]',
      title: 'راهنمای استاد',
      body: 'هر کار با چند کلیک و تصویر در راهنمای استاد توضیح داده شده.',
      action: 'اقدام: روی «راهنما» در سربرگ بزنید.',
      placement: 'bottom',
    },
  ],

  student: [
    {
      id: 'enroll',
      anchor: '[data-tour="student-enroll"]',
      fallback: 'a[href="/student/enroll"]',
      title: 'انتخاب واحد',
      body: 'واحدهای ترم را همین‌جا انتخاب یا حذف کنید.',
      action: 'اقدام: روی «انتخاب واحد» بزنید.',
      placement: 'bottom',
    },
    {
      id: 'transcript',
      anchor: '[data-tour="student-transcript"]',
      fallback: 'a[href="/student/transcript"]',
      title: 'کارنامه',
      body: 'کارنامهٔ همهٔ ترم‌ها با معدل و واحدهای گذرانده.',
      action: 'اقدام: روی «کارنامه کل دوره‌ها» بزنید.',
      placement: 'bottom',
    },
    {
      id: 'finance',
      anchor: '[data-tour="student-finance"]',
      fallback: 'a[href="/student/finance"]',
      title: 'امور مالی',
      body: 'شهریه، بدهی و پرداخت‌های شما در این بخش است.',
      action: 'اقدام: روی «امور مالی و شهریه» بزنید.',
      placement: 'bottom',
    },
    {
      id: 'requests',
      anchor: '[data-tour="student-requests"]',
      fallback: 'a[href="/student/requests"]',
      title: 'میز خدمات',
      body: 'درخواست اداری ثبت کنید و روند تأییدش را پیگیری کنید.',
      action: 'اقدام: روی «میز خدمات و کمیسیون» بزنید.',
      placement: 'bottom',
    },
    {
      id: 'help',
      anchor: '[data-tour="help"]',
      fallback: 'a[href="/help/student"]',
      title: 'راهنمای دانشجو',
      body: 'پاسخ کارهای پرتکرار دانشجو با تصویر همین‌جاست.',
      action: 'اقدام: روی «راهنما» در سربرگ بزنید.',
      placement: 'bottom',
    },
  ],
};

export type TourState = { step?: number; done?: boolean; skipped?: boolean };

/**
 * اگر localStorage در دسترس نباشد (حالت خصوصی/مسدود)، وضعیت در همین حافظهٔ
 * درون‌صفحه می‌ماند تا تور در همان نشست تکرار نشود.
 */
const memoryState = new Map<Surface, TourState>();

export function readTourState(surface: Surface): TourState | null {
  try {
    const raw = window.localStorage.getItem(keyFor(surface));
    if (raw) {
      const parsed = JSON.parse(raw) as TourState | null;
      if (parsed && typeof parsed === 'object') return parsed;
      return {};
    }
  } catch {
    /* localStorage مسدود — از حافظهٔ درون‌صفحه استفاده می‌شود */
  }
  return memoryState.get(surface) ?? null;
}

export function writeTourState(surface: Surface, state: TourState): void {
  memoryState.set(surface, state);
  try {
    window.localStorage.setItem(keyFor(surface), JSON.stringify(state));
  } catch {
    /* فقط حافظهٔ درون‌صفحه */
  }
}

export function clearTourState(surface: Surface): void {
  memoryState.delete(surface);
  try {
    window.localStorage.removeItem(keyFor(surface));
  } catch {
    /* بی‌اثر — کلید اصلاً ذخیره نشده بود */
  }
}

/**
 * فقط برای صفحهٔ راهنما: از نقش‌های کاربر، کارتابلی را می‌خواهد که دکمهٔ
 * «نمایش دوبارهٔ تور» باید به آن برگردد. اگر نقشی از این سه کارتابل نبود،
 * `null` یعنی دکمه رندر نشود (مثلاً کاربر مهمان).
 */
const ADMIN_SURFACE_ROLES = [
  'ADMIN',
  'EDU_EXPERT',
  'ARCHIVE_EXPERT',
  'FINANCE_EXPERT',
  'FINANCE',
  'MILITARY_OFFICER',
  'VAULT_MANAGER',
  'VICE_EDU',
  'DEP_HEAD',
  'ATTENDANCE_CONTROLLER',
];

export function surfaceForRoles(roles: readonly string[]): Surface | null {
  if (roles.some(r => ADMIN_SURFACE_ROLES.includes(r))) return 'admin';
  if (roles.includes('PROFESSOR')) return 'professor';
  if (roles.includes('STUDENT')) return 'student';
  return null;
}
