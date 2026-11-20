import Link from 'next/link';

export const dynamic = 'force-dynamic';

/**
 * صفحهٔ فرودِ «/verify-finance» بدونِ توکن.
 *
 * چرا لازم است: روی اسناد چاپی فقط مبدأ چاپ می‌شود (نشانیِ کامل با توکنِ
 * ۱۰۰+ کاراکتری غیرحرفه‌ای بود). اگر کسی همان مبدأ را تایپ/کلیک کند،
 * پیش‌تر ۴۰۴ می‌گرفت. این صفحه به‌جای خطا، راهِ درست (اسکنِ QR) را
 * نشان می‌دهد.
 */
export default function VerifyLandingPage() {
  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 text-2xl">
          🔍
        </div>
        <h1 className="text-lg font-black text-slate-800">استعلام اصالت سند</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          برای استعلام، <b>QR</b> درج‌شده روی سند را با دوربین گوشی اسکن کنید.
        </p>
        <p className="mt-2 text-xs leading-6 text-slate-500">
          این نشانی به‌تنهایی سند مشخصی را نشان نمی‌دهد؛ کدِ یکتای هر سند داخل
          خودِ QR است.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700"
        >
          بازگشت به سامانه
        </Link>
      </div>
    </div>
  );
}
