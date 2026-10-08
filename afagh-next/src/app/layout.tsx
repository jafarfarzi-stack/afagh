import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'سامانه جامع آفاق', description: 'کالبد Next.js + PostgreSQL — سه داشبورد ایزوله' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      {/* پیش‌بارگذاری فونت فارسیِ محلی: چون «font-display: swap» است، بدون preload
          مرورگر اول متن را با Tahoma (فونتِ جانشین) می‌کشد و بعد به Vazirmatn می‌پرد —
          همان چیزی که کاربر «فونت اشتباه» گزارش می‌کند. زیر-subsets وزن ۴۰۰ که متن
          اصلی راهنماها با آن رندر می‌شود. */}
      <link rel="preload" href="/fonts/vazirmatn-arabic-400.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      <link rel="preload" href="/fonts/vazirmatn-latin-400.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
