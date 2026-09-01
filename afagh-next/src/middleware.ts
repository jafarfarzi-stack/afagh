import { NextRequest, NextResponse } from 'next/server';

// حفاظت سه ناحیهٔ ایزوله (سند §۲۸۶۵): نقش در layout سمت سرور بازبینی می‌شود؛
// اینجا فقط وجود نشست چک می‌شود تا مسیرهای محافظت‌شده بدون ریدایرکت‌های تکراری بمانند
export function middleware(req: NextRequest) {
  const token = req.cookies.get('token')?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/student/:path*', '/professor/:path*', '/admin/:path*', '/proctor/:path*'] };
