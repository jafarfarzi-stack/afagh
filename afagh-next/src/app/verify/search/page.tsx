import { redirect } from 'next/navigation';
import { resolveShortCode, KIND_ROUTE } from '@/lib/verify-short-code';

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
 * فرمِ صفحهٔ /verify به اینجا GET می‌زند.
 *
 * ترتیب: ① اگر ورودی «کدِ کوتاه» باشد، از جدول به توکن تبدیل و به مسیرِ همان
 * نوع سند هدایت می‌شود. ② وگرنه مثل قبل توکن/کدِ عمومی در نظر گرفته می‌شود.
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

  const resolved = await resolveShortCode(code);
  if (resolved) {
    const base = KIND_ROUTE[resolved.kind] ?? ROUTE_BY_TYPE[type] ?? '/verify';
    redirect(`${base}/${encodeURIComponent(resolved.token)}`);
  }

  const base = ROUTE_BY_TYPE[type];
  if (!base) redirect(`/verify/${encodeURIComponent(code)}`);
  redirect(`${base}/${encodeURIComponent(code)}`);
}
