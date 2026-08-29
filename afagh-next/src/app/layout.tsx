import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'سامانه جامع آفاق', description: 'کالبد Next.js + PostgreSQL — سه داشبورد ایزوله' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
