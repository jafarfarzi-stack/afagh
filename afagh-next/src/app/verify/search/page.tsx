import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { rateLimit } from '@/lib/rateLimit';
import { resolveShortCode, KIND_ROUTE } from '@/lib/verify-short-code';

export const dynamic = 'force-dynamic';

// 🔒 ضدِ شمارش/بروت‌فورسِ کدهای کوتاه و توکن‌ها: سقفِ درخواست از هر IP.
// کدِ کوتاه ۸ کاراکتر از الفبای ۳۲تایی است (۳۲^۸ ≈ ۱٫۱e12)؛ با این سقف،
// جست‌وجوی تصادفی عملاً بی‌فایده می‌شود.
const WINDOW_MIN = 10;
const MAX_TRIES = 12;

async function withinQuota(): Promise<boolean> {
  try {
    const h = await headers();
    const ip =
      (h.get('x-forwarded-for') || '').split(',')[0]?.trim() ||
      h.get('x-real-ip') ||
      'local';
    const r = await rateLimit(`verify-search:${ip}`, MAX_TRIES, WINDOW_MIN * 60);
    return r.ok;
  } catch {
    // fail-open: خطای سنجه‌گیری نباید استعلامِ مجاز را ببندد
    return true;
  }
}

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
 * ترتیب: ① سقفِ نرخ ② اگر ورودی «کدِ کوتاه» باشد، از جدول به توکن تبدیل و به
 * مسیرِ همان نوع سند هدایت می‌شود ③ وگرنه مثل قبل توکن/کدِ عمومی.
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

  // 🔒 سقفِ طولِ ورودی: جلوگیری از بارِ سنگین/دادهٔ مخرب در URL
  if (code.length > 400) redirect('/verify?limited=1');

  if (!(await withinQuota())) redirect('/verify?limited=1');

  const resolved = await resolveShortCode(code);
  if (resolved) {
    const base = KIND_ROUTE[resolved.kind] ?? ROUTE_BY_TYPE[type] ?? '/verify';
    redirect(`${base}/${encodeURIComponent(resolved.token)}`);
  }

  const base = ROUTE_BY_TYPE[type];
  if (!base) redirect(`/verify/${encodeURIComponent(code)}`);
  redirect(`${base}/${encodeURIComponent(code)}`);
}
