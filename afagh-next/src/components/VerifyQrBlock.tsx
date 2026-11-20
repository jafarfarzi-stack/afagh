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
   * در این حالت فقط مبدأ («b.afagh.ac.ir/verify-transcript») و یک کدِ
   * رهگیریِ کوتاه چاپ می‌شود؛ توکنِ کامل داخل خودِ QR می‌ماند.
   */
  shortUrl?: boolean;
  /** فشرده: QR کوچک‌تر و پدینگ کم — برای نشستن در پانوشت سند. */
  compact?: boolean;
};

function jdate(d: string | Date | null | undefined): string {
  if (!d) return '\u2014';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '\u2014';
  const { jy, jm, jd } = toJalaliFromDate(date);
  return faDigits(jy + '/' + String(jm).padStart(2, '0') + '/' + String(jd).padStart(2, '0'));
}

export default function VerifyQrBlock({ title, url, qr, expiresAt, hint, shortUrl = false, compact = false }: Props) {
  return (
    <div className={`break-inside-avoid rounded-lg border border-slate-700 bg-slate-50 ${compact ? 'p-1.5' : 'p-3'}`}>
      <div className={`flex flex-wrap items-start ${compact ? 'gap-2' : 'gap-4'}`}>
        {qr ? (
          <QrSvg
            svg={qr}
            className="qr-verify-svg h-36 w-36 shrink-0 overflow-hidden rounded border border-slate-300 bg-white p-1 [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
          />
        ) : null}
        <div className={`min-w-0 flex-1 text-2xs text-slate-600 ${compact ? 'leading-4' : 'leading-6'}`}>
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
                  <b className="font-mono tracking-widest text-slate-700" dir="ltr">{refCodeOf(url)}</b>
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
