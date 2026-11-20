import { toJalaliFromDate, faDigits } from '@/lib/calendar';
import QrSvg from '@/components/QrSvg';
import { prettyBase, refCodeOf } from '@/lib/verify-url';

type Props = { url: string; qr?: string; expiresAt?: string | null };

function jdate(d: string | Date | null | undefined): string {
  if (!d) return '\u2014';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '\u2014';
  const { jy, jm, jd } = toJalaliFromDate(date);
  return faDigits(jy + '/' + String(jm).padStart(2, '0') + '/' + String(jd).padStart(2, '0'));
}

/**
 * بلوک رسمیت انتهای کارنامهٔ مالی: QR استعلام + مبدأ + کدِ رهگیری + اعتبار.
 *
 * ⚠ نشانیِ کامل (با توکنِ ۱۰۰+ کاراکتری) عمداً چاپ نمی‌شود؛ سندِ رسمی با
 * یک ردیف متنِ بلندِ بی‌معنا غیرحرفه‌ای می‌شد. توکن داخل QR است.
 */
export default function FinanceVerifyBlock({ url, qr, expiresAt }: Props) {
  return (
    <div className="break-inside-avoid rounded-lg border border-slate-700 bg-slate-50 p-3">
      <div className="flex flex-wrap items-start gap-4">
        {qr ? (
          <QrSvg
            svg={qr}
            className="fin-verify-qr h-32 w-32 shrink-0 overflow-hidden rounded border border-slate-300 bg-white p-1 [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
          />
        ) : null}
        <div className="min-w-0 flex-1 text-2xs leading-6 text-slate-600">
          <p className="font-bold text-slate-800">استعلام برخط اصالت این کارنامه</p>
          <p className="mt-0.5">
            برای استعلامِ اصالت، <b>QR</b> را با دوربینِ گوشی اسکن کنید.
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-3xs">
            <span>
              سامانه: <b className="font-mono text-slate-700" dir="ltr">{prettyBase(url)}</b>
            </span>
            <span>
              کدِ رهگیری: <b className="font-mono tracking-widest text-slate-700" dir="ltr">{refCodeOf(url)}</b>
            </span>
            {expiresAt && (
              <span>
                اعتبار تا <b className="font-mono">{jdate(new Date(expiresAt))}</b>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
