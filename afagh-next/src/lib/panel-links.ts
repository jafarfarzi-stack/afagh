/**
 * فهرست «کارتابل‌های من» — منبع واحد سوییچر بالای همهٔ پنل‌ها.
 *
 * چرا این فایل جدا است؟
 *   پیش‌تر هر layout فقط یک لینک دستی به پنل دیگر داشت (استاد → مدیر گروه،
 *   مدیر گروه → استاد، …). نتیجه: کاربری که چند نقش داشت (مثلاً استاد + مدیر
 *   گروه + کارشناس مالی) از پنل استاد هیچ راهی به داشبورد مدیریت/مالی نداشت و
 *   مجبور بود خارج و دوباره وارد شود. این تابع همهٔ پنل‌های مجاز را برمی‌گرداند
 *   تا PanelSwitcher آن‌ها را بالای صفحه نشان دهد.
 *
 * قاعدهٔ دسترسی به /admin عمداً با گارد `src/app/admin/layout.tsx` هم‌راستاست:
 *   AREA_ROLES + LIMITED_ROLES. با این تفاوت که PROFESSOR و DEP_HEAD فقط برای
 *   «عبور از گارد زیرمسیرها» در آن لیست هستند و نباید برایشان لینک داشبورد
 *   مدیریت بسازند (وگرنه هر استاد/مدیر گروهی لینک اضافه می‌دید). نقش‌های
 *   ستادی/کارشناسی + مجوزهای سفارشی (permissionCount > 0) لینک می‌گیرند.
 */

export type PanelKey = 'student' | 'professor' | 'group-manager' | 'admin' | 'proctor';

export interface PanelLink {
  key: PanelKey;
  href: string;
  label: string;
  icon: string;
}

/**
 * نقش‌هایی که «کارتابل مدیریت/کارشناسی» برایشان معنا دارد.
 * (DEP_HEAD و PROFESSOR عمداً نیستند — پایین را ببینید.)
 */
export const ADMIN_PANEL_ROLES = [
  'ADMIN',
  'EDU_EXPERT',
  'FINANCE_EXPERT',
  'FINANCE',
  'ARCHIVE_EXPERT',
  'MILITARY_OFFICER',
  'VAULT_MANAGER',
  'VICE_EDU',
  'GRADUATION_EXPERT',
] as const;

/** برچسب فارسی نقش‌ها — برای tooltip سوییچر («نقش‌های این کارتابل: …») */
export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'مدیر سامانه',
  EDU_EXPERT: 'کارشناس آموزش',
  FINANCE_EXPERT: 'کارشناس مالی',
  FINANCE: 'مالی',
  ARCHIVE_EXPERT: 'کارشناس بایگانی',
  MILITARY_OFFICER: 'کارشناس نظام وظیفه',
  VAULT_MANAGER: 'مدیر صندوق',
  VICE_EDU: 'معاون آموزشی',
  GRADUATION_EXPERT: 'کارشناس فارغ‌التحصیلی',
  DEP_HEAD: 'مدیر گروه',
  PROFESSOR: 'استاد',
  STUDENT: 'دانشجو',
  PROCTOR: 'مراقب آزمون',
};

/** نقش‌های هر پنل — برای متن tooltip */
const PANEL_ROLE_SETS: Record<PanelKey, readonly string[]> = {
  student: ['STUDENT'],
  professor: ['PROFESSOR'],
  'group-manager': ['DEP_HEAD'],
  admin: ADMIN_PANEL_ROLES,
  proctor: ['PROCTOR', 'VAULT_MANAGER', 'ADMIN', 'EDU_EXPERT', 'PROFESSOR'],
};

/** «نقش‌های این کارتابل: کارشناس مالی، کارشناس آموزش» — خالی اگر ناشناخته */
export function panelRoleHint(key: PanelKey, roles: readonly string[]): string {
  const wanted = PANEL_ROLE_SETS[key];
  const names = roles
    .filter(r => wanted.includes(r))
    .map(r => ROLE_LABELS[r])
    .filter((v): v is string => Boolean(v));
  const uniq = [...new Set(names)];
  return uniq.length ? `دسترسی با نقش: ${uniq.join('، ')}` : '';
}

/**
 * پنل‌هایی که این کاربر مجاز است ببیند — به ترتیب نمایش.
 * `permissionCount` = تعداد مجوزهای سفارشی (RBAC)؛ اگر > ۰ باشد، کاربر حتی
 * بدون نقش سیستمیِ ستادی هم می‌تواند وارد /admin شود (هم‌راستا با گارد).
 */
export function availablePanels(roles: readonly string[], permissionCount = 0): PanelLink[] {
  const has = (r: string) => roles.includes(r);
  const out: PanelLink[] = [];
  if (has('PROFESSOR')) out.push({ key: 'professor', href: '/professor', label: 'کارتابل استاد', icon: '👨‍🏫' });
  if (has('DEP_HEAD')) out.push({ key: 'group-manager', href: '/group-manager', label: 'پنل مدیر گروه', icon: '🏛️' });
  if (permissionCount > 0 || ADMIN_PANEL_ROLES.some(has)) {
    out.push({ key: 'admin', href: '/admin', label: 'داشبورد مدیریت', icon: '🗂️' });
  }
  if (has('STUDENT')) out.push({ key: 'student', href: '/student', label: 'پنل دانشجو', icon: '🎓' });
  if (has('PROCTOR')) out.push({ key: 'proctor', href: '/proctor', label: 'پورتال مراقب', icon: '📷' });
  return out;
}
