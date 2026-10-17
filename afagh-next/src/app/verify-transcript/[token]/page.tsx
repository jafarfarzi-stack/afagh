import { verifyTranscript } from '@/lib/verification';
import { toJalaliFromDate, faDigits } from '@/lib/calendar';

export const dynamic = 'force-dynamic';

const faNum = (n: unknown) =>
  n === null || n === undefined || n === '' ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

const jdate = (d: string | Date | null | undefined) => {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  const { jy, jm, jd } = toJalaliFromDate(date);
  return faDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
};

/**
 * استعلام برخط کارنامهٔ تحصیلی — بدون نیاز به ورود؛ مقصد QR روی کارنامهٔ چاپی.
 * توکن باید امضای HMAC سامانه را داشته باشد؛ واحدها و معدل زنده از موتور قوانین
 * آموزشی خوانده می‌شود و توکن نامعتبر/منقضی صریحاً رد می‌شود.
 */
export default async function VerifyTranscriptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await params;
  const token = decodeURIComponent(rawToken).trim();
  const res = await verifyTranscript(token);

  if (!res.ok) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-4 font-sans text-slate-100" dir="rtl">
        <div className="w-full max-w-lg space-y-4 rounded-3xl border-2 border-rose-500 bg-slate-900 p-6 text-center shadow-2xl">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-rose-950 text-4xl text-rose-400">✕</div>
          <h2 className="text-xl font-black text-rose-400">
            {res.reason === 'EXPIRED' ? 'کارنامهٔ تحصیلی منقضی شده است' : res.reason === 'EMPTY' ? 'کارنامه‌ای برای استعلام وجود ندارد' : 'کارنامهٔ تحصیلی نامعتبر است'}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-xs leading-6 text-slate-300">{res.message}</p>
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3 text-[11px] leading-5 text-slate-400">
            این صفحه فقط اسناد صادرشدهٔ سامانهٔ آفاق را تأیید می‌کند. برای دریافت کارنامهٔ تازه، به سامانهٔ آموزشی مراجعه کنید.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 font-sans" dir="rtl">
      <div className="w-full max-w-2xl space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full border-2 border-emerald-500 bg-emerald-50 text-2xl">✓</div>
          <h1 className="text-lg font-black text-slate-900">کارنامهٔ تحصیلی معتبر است</h1>
          <p className="mt-1 text-xs text-slate-500">دانشگاه غیرانتفاعی آفاق ارومیه — استعلام برخط</p>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-xs">
          {[
            ['نام و نام خانوادگی', res.studentName],
            ['شمارهٔ دانشجویی', res.studentCode],
            ['کد ملی', res.nationalIdMasked],
            ['رشته', res.majorName ?? '—'],
            ['مقطع', res.degreeTitle ?? '—'],
            ['سال ورود', res.entryYear ? faNum(res.entryYear) : '—'],
          ].map(([k, v]) => (
            <div key={String(k)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <dt className="text-[10px] font-bold text-slate-500">{k}</dt>
              <dd className="mt-0.5 font-black text-slate-800">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3">
            <p className="text-[10px] font-bold text-emerald-700">معدل کل</p>
            <p className="mt-1 text-lg font-black text-emerald-800">{faNum(res.gpa)}</p>
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-3">
            <p className="text-[10px] font-bold text-sky-700">واحد گذرانده</p>
            <p className="mt-1 text-lg font-black text-sky-800">{faNum(res.passedUnits)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-[10px] font-bold text-slate-600">واحد محاسبه‌شده</p>
            <p className="mt-1 text-lg font-black text-slate-800">{faNum(res.totalUnits)}</p>
          </div>
        </div>

        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] leading-5 text-slate-500">
          اعداد این صفحه به‌صورت زنده از موتور قوانین آموزشی سامانه خوانده می‌شود (سیاست معدل: {res.policy || '—'}).
          زمان استعلام: {jdate(res.checkedAt)}.
        </p>
      </div>
    </div>
  );
}
