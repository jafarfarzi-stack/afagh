import { toJalaliFromDate, faDigits } from '@/lib/calendar';
import QrSvg from '@/components/QrSvg';
import { prettyBase, refCodeOf } from '@/lib/verify-url';

type Props = {
  title: string;
  url: string;
  qr?: string;
  expiresAt?: string | null;
  hint?: string;
  /**
   * چاپِ تمیز: نشانیِ کاملِ حاوی توکن (۱۲۰+ کاراکتر) در سندِ رسمی زشت است.
   * در این حالت فقط مبدأ و کدِ کوتاه چاپ می‌شود؛ توکن داخل خودِ QR می‌ماند.
   */
  shortUrl?: boolean;
  /** فشرده: چیدمانِ عمودی و متنِ کوتاه — برای نشستن در ستونِ باریکِ پانوشت. */
  compact?: boolean;
  /** کدِ کوتاهِ استعلامِ قابلِ تایپ (از سرور). نبودش → هشِ محلی. */
  code?: string | null;
};

function jdate(d: string | Date | null | undefined): string {
  if (!d) return '\u2014';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '\u2014';
  const { jy, jm, jd } = toJalaliFromDate(date);
  return faDigits(jy + '/' + String(jm).padStart(2, '0') + '/' + String(jd).padStart(2, '0'));
}

/**
 * بلوک رسمیت اسناد چاپی: QR استعلام + کد + اعتبار.
 *
 * دو حالت:
 *  • عادی (صفحه‌های وب): دو ستون، QR کنار متن.
 *  • compact (پانوشتِ سند): **عمودی** — QR بالا و متنِ کوتاه زیرش. علت: ستونِ
 *    پانوشت فقط ۳۸ میلی‌متر است و در حالتِ افقی، متن به عرضِ چند میلی‌متر
 *    می‌رسید و حرف‌به‌حرف می‌شکست و پانوشت را بی‌دلیل بلند می‌کرد.
 */
export default function VerifyQrBlock({
  title,
  url,
  qr,
  expiresAt,
  hint,
  shortUrl = false,
  compact = false,
  code,
}: Props) {
  const refCode = code || refCodeOf(url);
  // مبدأ + مسیرِ سامانه (بدونِ توکن) — مثلاً b.afagh.ac.ir/verify-transcript
  const systemPath = prettyBase(url);
  const qrEl = qr ? (
    <QrSvg
      svg={qr}
      className="qr-verify-svg h-32 w-32 shrink-0 overflow-hidden rounded border border-slate-300 bg-white p-1 [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
    />
  ) : null;

  if (compact) {
    return (
      <div className="break-inside-avoid rounded-lg border border-slate-700 bg-slate-50 p-1.5">
        <div className="flex flex-col items-center gap-1">
          {qrEl}
          <div className="text-center text-3xs leading-4 text-slate-600">
            <p className="font-bold text-slate-800">{title}</p>
            <p>QR را با دوربینِ گوشی اسکن کنید.</p>
            {refCode ? (
              <p>
                کد: <b className="font-mono tracking-widest text-slate-700" dir="ltr">{refCode}</b>
              </p>
            ) : null}
            {systemPath ? (
              <p className="break-all font-mono text-[8px] text-slate-500" dir="ltr">{systemPath}</p>
            ) : null}
            {expiresAt ? (
              <p>
                اعتبار تا <b className="font-mono">{jdate(new Date(expiresAt))}</b>
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="break-inside-avoid rounded-lg border border-slate-700 bg-slate-50 p-3">
      <div className="flex flex-wrap items-start gap-4">
        {qrEl}
        <div className="min-w-0 flex-1 text-2xs leading-6 text-slate-600">
          <p className="font-bold text-slate-800">{title}</p>

          {shortUrl ? (
            <>
              <p className="mt-0.5">
                برای استعلامِ اصالت، <b>QR</b> را با دوربینِ گوشی اسکن کنید.
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-3xs">
                <span>
                  سامانه:{' '}
                  <b className="font-mono text-slate-700" dir="ltr">{prettyBase(url)}</b>
                </span>
                <span>
                  کدِ رهگیری:{' '}
                  <b className="font-mono tracking-widest text-slate-700" dir="ltr">{refCode}</b>
                </span>
                {expiresAt && (
                  <span>
                    اعتبار تا <b className="font-mono">{jdate(new Date(expiresAt))}</b>
                  </span>
                )}
              </div>
              {hint ? <p className="mt-0.5 text-3xs text-slate-500">{hint}</p> : null}
            </>
          ) : (
            <>
              <p className="break-all font-mono text-3xs text-slate-500" dir="ltr">{url}</p>
              {expiresAt && <p>اعتبار استعلام تا {jdate(new Date(expiresAt))}</p>}
              <p className="mt-0.5 text-3xs text-slate-500">
                {hint ?? 'QR را با دوربین گوشی اسکن کنید یا نشانی بالا را در مرورگر باز کنید.'}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
