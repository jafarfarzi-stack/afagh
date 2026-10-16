import { toJalaliFromDate, faDigits } from '@/lib/calendar';

type Props = { url: string; qr?: string; expiresAt?: string | null };

function jdate(d: string | Date | null | undefined): string {
  if (!d) return '\u2014';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '\u2014';
  const { jy, jm, jd } = toJalaliFromDate(date);
  return faDigits(jy + '/' + String(jm).padStart(2, '0') + '/' + String(jd).padStart(2, '0'));
}

export default function FinanceVerifyBlock({ url, qr, expiresAt }: Props) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {qr ? (
            <div className="h-24 w-24 shrink-0 border border-slate-300 bg-white p-1" dangerouslySetInnerHTML={{ __html: qr }} />
          ) : null}
          <div className="text-[11px] leading-6 text-slate-600">
            <p className="font-bold text-slate-800">استعلام برخط اصالت این کارنامه</p>
            <p className="break-all font-mono text-[10px] text-slate-500" dir="ltr">{url}</p>
            {expiresAt && <p>اعتبار استعلام تا {jdate(new Date(expiresAt))}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}