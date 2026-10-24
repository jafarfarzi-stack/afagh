/**
 * «بعد از ورود، کدام کارتابل باز شود؟» — یک تابع خالص و تست‌پذیر.
 *
 * چرا از `auth.ts` جدا شد؟
 *   `auth.ts` به cookies و سرور وابسته است و در تستِ `tsx` قابل ایمپورت نیست.
 *   اولویتِ کارتابل یک قاعدهٔ کاری است (نه زیرساخت)، پس باید قابل تست باشد:
 *   یک اشتباه در ترتیبِ این چند خط، کاربر را به پنل اشتباه می‌فرستد و او فکر
 *   می‌کند نقشش ثبت نشده.
 *
 * قاعدهٔ اولویت (به‌درخواست آموزش):
 *   ۱) کارشناس/مدیریت — کاربری که هم دانشجوست، هم استاد و هم کارشناس، باید
 *      کارتابل کارشناسی را ببیند. (پیش‌تر `STUDENT` اول بود و چنین کاربری به
 *      پنل دانشجو می‌رفت.)
 *   ۲) استاد و مدیر گروه و مراقب
 *   ۳) دانشجو
 */
export function homeFor(roles: string[]): string {
  // نقشی ندارد → برگرد به ورود با پیام روشن (جلوگیری از حلقهٔ بی‌پایان ورود)
  if (roles.length === 0) return '/login?e=norole';
  const has = (r: string) => roles.includes(r);

  // ── ۱) کارتابل کارشناسی و مدیریت ─────────────────────────────────────
  if (has('ADMIN') || has('EDU_EXPERT') || has('VICE_EDU')) return '/admin';
  if (has('FINANCE_EXPERT') || has('FINANCE')) return '/admin/payroll';
  if (has('VAULT_MANAGER')) return '/admin/exams';
  if (has('MILITARY_OFFICER')) return '/admin/students';
  if (has('ARCHIVE_EXPERT')) return '/admin/archive';
  // کارشناس فارغ‌التحصیلی فقط «میز دفاع پایان‌نامه» را در شاخهٔ /admin می‌بیند؛
  // فرستادنش به /admin که گاردِ دیگری دارد، حلقهٔ ریدایرکت می‌ساخت.
  if (has('GRADUATION_EXPERT')) return '/admin/defense-scheduling';

  // ── ۲) استاد، مدیر گروه، مراقب ───────────────────────────────────────
  if (has('PROFESSOR')) return '/professor';
  // کنترل‌کنندهٔ حضور و غیاب فقط یک کار دارد: ثبتِ تشکیلِ کلاس‌ها.
  if (has('ATTENDANCE_CONTROLLER')) return '/admin/attendance-control';
  if (has('DEP_HEAD')) return '/group-manager';
  if (has('PROCTOR')) return '/proctor';

  // ── ۳) دانشجو ────────────────────────────────────────────────────────
  if (has('STUDENT')) return '/student';

  return '/admin';
}
