import { NextRequest, NextResponse } from 'next/server';

/**
 * پروکسی لبه (جانشین middleware در Next.js 16) — در این لایه فقط «شکل» نشست
 * قابل تشخیص است، نه اعتبار و نه نقش.
 *
 * چه چیزهایی اینجا قابل دانستن است:
 *  • وجود/نبودِ کوکی `token` و قالب آن (۶۴ کاراکتر hex کوچک = خروجی
 *    randomBytes(32).toString('hex') در issueSessionFor).
 *  • مسیر درخواست (req.nextUrl.pathname).
 *
 * چه چیزهایی اینجا قابل دانستن نیست — و نباید حدس زده شود:
 *  • اعتبار واقعی نشست: توکن یک رشتهٔ تصادفیِ «مات» است، نه JWT/سشن امضاشده.
 *    جدول `sessions` فقط sha256(token) را نگه می‌دارد؛ پس زنده‌بودن/انقضا/ابطال
 *    تنها با کوئری DB معلوم می‌شود و در لبه (بدون DB) قابل تشخیص نیست.
 *  • نقش‌ها و پرچم mustChangePassword: هر دو با join روی `users` به دست می‌آیند.
 *    بنابراین «کاربر در انتظار تغییر رمز» در این لایه شناخته نمی‌شود و ریدایرکت
 *    زودهنگام او به /change-password اینجا ممکن نیست. این اجبار عمداً سمت سرور
 *    می‌ماند:
 *      – requireRole() در layoutهای نقش‌دار: mustChangePassword → redirect('/change-password')
 *      – getSessionUser() بدون { allowPendingPasswordChange: true } نشست را null
 *        برمی‌گرداند (تنها جریان‌های change-password/logout آن را پاس می‌دهند).
 *
 * نتیجه: این فایل هیچ‌گاه نقش یا mustChangePassword را decode نمی‌کند. کارِ آن
 * فقط دو چیز است:
 *  ۱) کوکیِ غایب یا بدیهی‌جعلی را زودتر به /login برگرداند (کاهش بار DB و
 *     ریدایرکت‌های تکراری) — یعنی fail-closed برای مسیرهای محافظت‌شده.
 *  ۲) مسیرهای عمومی (به‌ویژه /change-password) و دارایی‌های ایستا را دست‌نخورده
 *     رد کند؛ تنها استثنای fail-open دارایی‌های ایستا هستند.
 *
 * ⚠ هرگز هر دو فایل middleware.ts و proxy.ts نباید هم‌زمان وجود داشته باشند.
 * مرجع: https://nextjs.org/docs/messages/middleware-to-proxy
 */

// دارایی‌های ایستا — تنها استثنای fail-open.
// الگو فقط پسوند فایل را می‌بیند، پس هیچ مسیر صفحه‌ای زیر آن نمی‌افتد.
const STATIC_ASSET = /\.(?:css|js|mjs|cjs|map|json|txt|xml|png|jpe?g|gif|svg|webp|avif|ico|bmp|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|pdf)$/i;

// مسیرهایی که هرگز نباید توسط این پروکسی بسته شوند.
// matcher پایین همین‌ها را کنار گذاشته است؛ این گارد تضمین می‌کند اگر روزی
// matcher گسترده شد، کاربرِ «در انتظار تغییر رمز» باز هم به تنها مقصد مجازش
// (/change-password) و مسیر خروج برسد و حلقهٔ قفل/ریدایرکت ایجاد نشود.
const NEVER_BLOCK = ['/change-password', '/login', '/logout'];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ۱) دارایی‌های ایستا: بدون بررسی کوکی رد شوند (fail-open مجاز — فقط همین‌جا).
  if (STATIC_ASSET.test(pathname)) return NextResponse.next();

  // ۲) مسیرهای عمومی/خروج: هرگز بسته نشوند.
  for (const p of NEVER_BLOCK) {
    if (pathname === p || pathname.startsWith(p + '/')) return NextResponse.next();
  }

  // ۳) مسیرهای محافظت‌شده: فقط وجود و قالب کوکی. اعتبار/نقش/پرچم رمز اینجا نه.
  const token = req.cookies.get('token')?.value;
  // توکنِ معتبر همیشه hex کوچک است؛ حرف بزرگ هرگز در DB تطبیق نمی‌خورد و
  // ردکردنش در لبه فقط یک رفت‌وبرگشت DB را حذف می‌کند.
  if (!token || !/^[0-9a-f]{64}$/.test(token)) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    // پارامترهای کوئریِ مسیر محافظت‌شده را دور بریز تا `next` تکراری/کهنه نماند.
    url.search = '';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = { matcher: ['/student/:path*', '/professor/:path*', '/admin/:path*', '/group-manager/:path*', '/proctor/:path*', '/messenger/:path*', '/alumni/:path*'] };
