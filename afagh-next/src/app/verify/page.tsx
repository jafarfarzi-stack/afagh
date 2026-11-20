import Link from 'next/link';
import { getSetting } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/**
 * صفحهٔ کلیِ استعلام مدارک و گواهینامه‌ها.
 *
 * کاربر اول «نوع سند» را انتخاب می‌کند (کارنامهٔ مالی، کارنامهٔ تحصیلی،
 * تأییدیهٔ ثبت‌نام، دانشنامه، گواهینامهٔ دورهٔ آزاد) و بعد کدِ استعلام را
 * وارد می‌کند. مسیرِ مقصد بر اساسِ نوع انتخاب‌شده در `/verify/search`
 * تعیین می‌شود تا هر سند به موتورِ استعلامِ خودش برود.
 */
const DOC_TYPES = [
  { value: 'transcript', label: 'کارنامهٔ تحصیلی' },
  { value: 'finance', label: 'کارنامهٔ مالی (صورت‌وضعیت شهریه)' },
  { value: 'enrollment', label: 'تأییدیهٔ ثبت‌نام' },
  { value: 'degree', label: 'دانشنامه / گواهینامهٔ تحصیلی' },
  { value: 'certificate', label: 'گواهینامهٔ دورهٔ آزاد' },
];

export default async function VerifyIndexPage() {
  // آرم دانشگاه به‌جای حرفِ «آ» (درخواست کاربر)
  const logo = await getSetting('UNIVERSITY_LOGO').catch(() => '');
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4 py-12 font-sans" dir="rtl">
      <div className="w-full max-w-md space-y-5 rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">
        {logo ? (
          <img
            src={logo}
            alt="آرم دانشگاه"
            className="mx-auto h-20 w-20 object-contain"
          />
        ) : (
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-amber-400 bg-gradient-to-tr from-indigo-950 to-indigo-800 text-2xl font-black text-white shadow-lg">
            آ
          </div>
        )}

        <div>
          <h1 className="text-xl font-black text-slate-900">سامانهٔ استعلام مدارک و گواهینامه‌ها</h1>
          <p className="mt-1 text-xs font-bold text-slate-500">دانشگاه غیرانتفاعی آفاق ارومیه</p>
        </div>

        <form action="/verify/search" method="GET" className="space-y-3">
          <label className="block text-right">
            <span className="mb-1 block text-2xs font-bold text-slate-600">نوع سند</span>
            <select
              name="type"
              defaultValue="transcript"
              className="w-full rounded-2xl border border-slate-300 bg-white p-3 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {DOC_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>

          <label className="block text-right">
            <span className="mb-1 block text-2xs font-bold text-slate-600">کدِ استعلام</span>
            <input
              type="text"
              name="code"
              placeholder="کدِ درج‌شده روی سند"
              className="w-full rounded-2xl border border-slate-300 p-3 text-center font-mono text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              dir="ltr"
              required
            />
          </label>

          <button
            type="submit"
            className="w-full rounded-2xl bg-indigo-900 py-3 text-xs font-black text-white shadow-md transition hover:bg-indigo-950"
          >
            🔍 استعلام اصالت
          </button>
        </form>

        <div className="space-y-1 border-t border-slate-100 pt-3 text-2xs text-slate-500">
          <p className="font-bold">
            کدِ استعلام روی خودِ سند درج شده است. استعلام فقط از پایگاه دادهٔ رسمی دانشگاه انجام می‌شود.
          </p>
          <p>
            اگر QR روی سند دارید، با دوربین گوشی اسکن کنید — سریع‌تر و بدونِ تایپِ کد است.
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <Link prefetch={false} href="/verify-degree" className="text-indigo-600 hover:underline">
              استعلام دانشنامه
            </Link>
            <span className="text-slate-300">·</span>
            <Link prefetch={false} href="/verify-certificate" className="text-indigo-600 hover:underline">
              گواهینامهٔ دورهٔ آزاد
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
