import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * فرمِ استعلامِ صفحهٔ /verify به اینجا GET می‌زند و کاربر را به صفحهٔ کد
 * می‌فرستد. در Next 16 خواندنِ همگامِ searchParams حذف شده — باید await شود،
 * وگرنه این مسیر هنگام اجرا خطا می‌دهد.
 */
export default async function VerifySearchPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code: raw } = await searchParams;
  const code = (raw ?? '').trim();
  redirect(code ? `/verify/${encodeURIComponent(code)}` : '/verify');
}
