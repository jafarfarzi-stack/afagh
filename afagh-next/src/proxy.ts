import { NextRequest, NextResponse } from 'next/server';

// حفاظت سه ناحیهٔ ایزوله (سند §۲۸۶۵): نقش در layout سمت سرور بازبینی می‌شود؛
// اینجا فقط وجود نشست چک می‌شود تا مسیرهای محافظت‌شده بدون ریدایرکت‌های تکراری بمانند
//
// Next.js 16: فایل «middleware.ts» و تابع «middleware» منسوخ شده‌اند و جای خود را
// به «proxy.ts» / تابع «proxy» داده‌اند (رفتار و ترتیب اجرا یکسان است، فقط نام
// عوض شده تا با نقش واقعی‌اش — پروکسی لبه پیش از رندر — هم‌خوان باشد).
// مرجع: https://nextjs.org/docs/messages/middleware-to-proxy
// ⚠ هرگز هر دو فایل middleware.ts و proxy.ts نباید هم‌زمان وجود داشته باشند.
export function proxy(req: NextRequest) {
  const token = req.cookies.get('token')?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/student/:path*', '/professor/:path*', '/admin/:path*', '/proctor/:path*', '/alumni/:path*'] };
