import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** نگاشتِ نوعِ سند به مسیرِ موتورِ استعلامِ همان سند. */
const ROUTE_BY_TYPE: Record<string, string> = {
  transcript: '/verify-transcript',
  finance: '/verify-finance',
  enrollment: '/verify-enrollment',
  degree: '/verify-degree',
  certificate: '/verify-certificate',
};

/**
 * فرمِ صفحهٔ /verify به اینجا GET می‌زند و کاربر را به صفحهٔ همان نوع سند
 * می‌فرستد. اگر نوع تعیین نشده باشد، مسیرِ عمومیِ `/verify/<code>` حفظ
 * می‌شود تا لینک‌های قدیمی نشکنند.
 */
export default async function VerifySearchPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; type?: string }>;
}) {
  const { code: rawCode, type: rawType } = await searchParams;
  const code = (rawCode ?? '').trim();
  const type = (rawType ?? '').trim();

  if (!code) redirect('/verify');

  const base = ROUTE_BY_TYPE[type];
  if (!base) redirect(`/verify/${encodeURIComponent(code)}`);
  redirect(`${base}/${encodeURIComponent(code)}`);
}
