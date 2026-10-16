import type { ReactNode } from 'react';
import { toJalaliFromDate, faDigits } from '@/lib/calendar';

/**
 * ══════════════════════════════════════════════════════════════════════
 *  کارنامهٔ مالی رسمی — سند یکپارچهٔ حرفه‌ای به سبک کارنامهٔ تحصیلی
 *
 *  عمداً هیچ وابستگی سروری (server-only / db / auth) ندارد تا هم در
 *  صفحات سروری (ادمین و دانشجو) و هم در کامپوننت کلاینتی صورت‌حساب
 *  (reports/student-statement) قابل استفاده باشد. تنها ورودی، دادهٔ
 *  آمادهٔ موتور کانونی مالی (getStudentFinance / API صورت‌حساب) است.
 *
 *  قرارداد علامت (یکپارچه با موتور): مثبت = بدهی دانشجو.
 * ══════════════════════════════════════════════════════════════════════
 */

const fa = (n: number | null | undefined) => Number(n || 0).toLocaleString('fa-IR');

/** تاریخ شمسی خوانا؛ تهی → خط تیره */
function jdate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  const { jy, jm, jd } = toJalaliFromDate(date);
  return faDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
}

export interface TranscriptEventView {
  kind: string;
  label: string;
  amount: number;
  dateMs: number | null;
  sign: 1 | -1;
}

export interface TranscriptTermView {
  termId: number;
  termTitle: string;
  charges: number;
  discounts: number;
  sponsorships: number;
  netPayable: number;
  payments: number;
  chequesCleared: number;
  chequesPending: number;
  chequesBounced: number;
  loans: number;
  balance: number;
  events: TranscriptEventView[];
}

export interface TranscriptTotalsView {
  charges: number;
  discounts: number;
  sponsorships: number;
  payments: number;
  chequesCleared: number;
  chequesPending: number;
  chequesBounced: number;
  loans: number;
  balance: number;
}

export interface TranscriptStudentView {
  fullName: string | null;
  studentCode: string | null;
  nationalCode?: string | null;
  majorTitle?: string | null;
  degreeTitle?: string | null;
  entryYear?: number | null;
  status?: string | null;
}

export interface TranscriptChequeView {
  id: number;
  chequeNo?: string | null;
  bankName?: string | null;
  amount: number | string | null;
  dueDate?: string | Date | null;
  status?: string | null;
}

export interface TranscriptLoanView {
  id: number;
  productTitle?: string | null;
  lender?: string | null;
  amount: number | string | null;
  installments?: number | null;
  status?: string | null;
}

const EVENT_LABEL: Record<string, string> = {
  CHARGE: 'بدهی',
  DISCOUNT: 'تخفیف',
  SPONSOR: 'پوشش بنیاد',
  PAYMENT: 'پرداخت',
  CHEQUE: 'چک',
  LOAN: 'وام',
  CLEARANCE: 'تسویه',
};

const STATUS_FA: Record<string, string> = {
  ACTIVE: 'فعال',
  INACTIVE: 'غیرفعال',
  GRADUATED: 'دانش‌آموخته',
  WITHDRAWN: 'انصرافی',
  EXPELLED: 'اخراجی',
  SUSPENDED: 'معلق',
};

function balanceBadge(balance: number): { text: string; cls: string } {
  if (balance > 0) return { text: 'بدهکار', cls: 'bg-rose-100 text-rose-800 border-rose-300' };
  if (balance < 0) return { text: 'بستانکار', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
  return { text: 'تسویه', cls: 'bg-slate-100 text-slate-700 border-slate-300' };
}

function toNum(v: number | string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export interface FinancialTranscriptProps {
  student: TranscriptStudentView;
  terms: TranscriptTermView[];
  totals: TranscriptTotalsView;
  /** عنوان دانشگاه در سربرگ (پیش‌فرض: دانشگاه آفاق) */
  universityTitle?: string | null;
  /** آرم/نشان اختصاصی دانشگاه در مدخل میانی سربرگ؛ خالی = نشان دایره‌ای پیش‌فرض */
  logoUrl?: string | null;
  /** تاریخ صدور شمسی در سربرگ (اگر داده نشود، چاپ نمی‌شود — برای جلوگیری از ناهماهنگی hydration در کلاینت) */
  issuedAt?: string | null;
  /** عنوان بخش جمع (پیش‌فرض: «جمع کل دوره») */
  scopeLabel?: string;
  /** رویدادهای هر ترم نمایش داده شوند؟ (پیش‌فرض: بله) */
  showEvents?: boolean;
  /** جدول چک‌ها / وام‌ها (اگر خالی باشند، بخششان چاپ نمی‌شود) */
  cheques?: TranscriptChequeView[];
  loans?: TranscriptLoanView[];
  /** بلوک الحاقی بعد از مشخصات (مثلاً جعبهٔ ضریب شهریه در نمای ادمین) */
  leadBlock?: ReactNode;
  /** بلوک رسمیت انتهای سند (مثلاً QR استعلام + مهر در نمای دانشجو) */
  verifyBlock?: ReactNode;
}

export default function FinancialTranscript({
  student,
  terms,
  totals,
  universityTitle,
  logoUrl,
  issuedAt,
  scopeLabel,
  showEvents = true,
  cheques = [],
  loans = [],
  leadBlock,
  verifyBlock,
}: FinancialTranscriptProps) {
  const paidTotal = totals.payments + totals.chequesCleared + totals.loans;
  const grand = balanceBadge(totals.balance);

  // سه ترم در هر ردیف — مانند کارنامهٔ رسمی تحصیلی (OfficialTranscriptView)
  const chunks: TranscriptTermView[][] = [];
  for (let i = 0; i < terms.length; i += 3) chunks.push(terms.slice(i, i + 3));

  return (
    <div dir="rtl" className="bg-white border-2 border-slate-800 shadow-xl print:shadow-none text-xs text-slate-800">
      {/* ── سربرگ سه‌بخشی رسمی دانشگاه (همان مدل کارنامهٔ تحصیلی: right/center/left) ── */}
      <div className="px-4 pt-4 pb-2 border-b-2 border-slate-800">
        <div className="grid grid-cols-3 items-center text-center">
          {/* ستون راست */}
          <div className="text-right space-y-1">
            <p className="font-bold text-slate-800">جمهوری اسلامی ایران</p>
            <p className="font-semibold text-slate-700">وزارت علوم، تحقیقات و فناوری</p>
            <p className="font-extrabold text-slate-900 text-sm">{universityTitle || 'دانشگاه جامع آفاق'}</p>
            <p className="text-[11px] text-slate-500">معاونت اداری و مالی — ادارهٔ امور مالی</p>
          </div>
          {/* ستون وسط (نشان و عنوان سند) */}
          <div className="flex flex-col items-center justify-center">
            {logoUrl ? (
              <img src={logoUrl} alt="آرم دانشگاه" className="mb-1 h-12 w-12 shrink-0 object-contain" />
            ) : (
              <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full border-2 border-slate-800 text-xl font-bold text-slate-800">آفاق</div>
            )}
            <h2 className="border-b border-slate-800 pb-0.5 px-4 text-base font-black tracking-wide text-slate-950">کارنامهٔ مالی دانشجو</h2>
            <p className="mt-0.5 text-[10px] text-slate-600">صورت وضعیت بدهی، تخفیف، پوشش، پرداخت، چک و وام — ترم‌به‌ترم</p>
          </div>
          {/* ستون چپ (اطلاعات سند) */}
          <div className="space-y-1 text-left font-mono text-[11px]">
            <p><span className="font-sans text-slate-500">شماره پرونده: </span><b>{faDigits(student.studentCode || '—')}</b></p>
            {issuedAt ? <p><span className="font-sans text-slate-500">تاریخ صدور: </span><b>{issuedAt}</b></p> : null}
            <p><span className="font-sans text-slate-500">صفحه: </span><b>۱ از ۱</b></p>
            <p><span className="font-sans text-slate-500">وضعیت: </span><b>{(student.status && STATUS_FA[student.status]) || student.status || '—'}</b></p>
          </div>
        </div>
      </div>>

      <div className="space-y-3 p-4">
        {/* ── جدول مشخصات ── */}
        <table className="w-full border-collapse border border-slate-700 text-[11px]">
          <tbody>
            <tr>
              <td className="border border-slate-300 bg-slate-100 px-2 py-1.5 font-bold text-slate-700">نام و نام خانوادگی</td>
              <td className="border border-slate-300 px-2 py-1.5 font-medium">{student.fullName || '—'}</td>
              <td className="border border-slate-300 bg-slate-100 px-2 py-1.5 font-bold text-slate-700">کد ملی</td>
              <td className="border border-slate-300 px-2 py-1.5">{faDigits(student.nationalCode || '—')}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 bg-slate-100 px-2 py-1.5 font-bold text-slate-700">رشته</td>
              <td className="border border-slate-300 px-2 py-1.5">{student.majorTitle || '—'}</td>
              <td className="border border-slate-300 bg-slate-100 px-2 py-1.5 font-bold text-slate-700">مقطع</td>
              <td className="border border-slate-300 px-2 py-1.5">{student.degreeTitle || '—'}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 bg-slate-100 px-2 py-1.5 font-bold text-slate-700">سال ورود</td>
              <td className="border border-slate-300 px-2 py-1.5">{student.entryYear ? fa(student.entryYear) : '—'}</td>
              <td className="border border-slate-300 bg-slate-100 px-2 py-1.5 font-bold text-slate-700">وضعیت مالی کل</td>
              <td className="border border-slate-300 px-2 py-1.5">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${grand.cls}`}>{grand.text}</span>
              </td>
            </tr>
          </tbody>
        </table>

        {leadBlock}

        {/* ── جمع کل دوره ── */}
        <div className="break-inside-avoid rounded-lg border border-slate-700">
          <h3 className="border-b border-slate-700 bg-indigo-900 px-3 py-1.5 text-[12px] font-black text-white">
            {scopeLabel || 'جمع کل دوره'}
          </h3>
          <table className="w-full border-collapse text-center text-[11px]">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="border border-slate-300 px-1 py-1.5">جمع شهریه (ریال)</th>
                <th className="border border-slate-300 px-1 py-1.5">تخفیف‌ها</th>
                <th className="border border-slate-300 px-1 py-1.5">پوشش بنیادها</th>
                <th className="border border-slate-300 px-1 py-1.5">پرداخت / چک وصولی / وام</th>
                <th className="border border-slate-300 px-1 py-1.5">ماندهٔ نهایی</th>
              </tr>
            </thead>
            <tbody>
              <tr className="font-bold">
                <td className="border border-slate-300 px-1 py-1.5">{fa(totals.charges)}</td>
                <td className="border border-slate-300 px-1 py-1.5 text-violet-700">{fa(totals.discounts)}</td>
                <td className="border border-slate-300 px-1 py-1.5 text-indigo-700">{fa(totals.sponsorships)}</td>
                <td className="border border-slate-300 px-1 py-1.5 text-emerald-700">{fa(paidTotal)}</td>
                <td className={`border border-slate-300 px-1 py-1.5 text-[13px] font-black ${totals.balance > 0 ? 'text-rose-700' : totals.balance < 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
                  {fa(Math.abs(totals.balance))}
                </td>
              </tr>
              <tr>
                <td colSpan={5} className="border border-slate-300 bg-slate-50 px-2 py-1.5 text-[11px] font-bold text-slate-700">
                  {totals.balance > 0
                    ? `ماندهٔ بدهی دانشجو: ${fa(totals.balance)} ریال`
                    : totals.balance < 0
                      ? `بستانکاری دانشجو: ${fa(Math.abs(totals.balance))} ریال`
                      : 'حساب تسویه است'}
                  {totals.chequesPending > 0 && (
                    <span className="text-amber-700"> — ⚠️ {fa(totals.chequesPending)} ریال چک وصول‌نشده در مانده لحاظ نشده است</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── بلوک‌های ترم (سه‌تایی در هر ردیف) ── */}
        <div>
          <h3 className="mb-2 border-b-2 border-slate-800 pb-1 text-[12px] font-black text-slate-900">ریز ترم‌به‌ترم</h3>
          {terms.length === 0 ? (
            <p className="rounded-lg border border-slate-300 bg-slate-50 py-6 text-center text-slate-500">هیچ تراکنش مالی برای این دانشجو ثبت نشده است.</p>
          ) : (
            <div className="space-y-3">
              {chunks.map((group, gi) => (
                <div key={gi} className="grid gap-3 lg:grid-cols-3">
                  {group.map((t) => {
                    const b = balanceBadge(t.balance);
                    return (
                      <div key={t.termId} className="break-inside-avoid overflow-hidden rounded-lg border border-slate-700">
                        <div className="flex items-center justify-between gap-1 border-b border-slate-700 bg-slate-100 px-2 py-1.5">
                          <h4 className="text-[11px] font-black text-slate-900">{t.termTitle}</h4>
                          <span className={`rounded-full border px-1.5 py-px text-[9px] font-black ${b.cls}`}>{b.text}</span>
                        </div>
                        <table className="w-full border-collapse text-[10px]">
                          <tbody>
                            <TermRow label="شهریه (بدهی)" value={fa(t.charges)} />
                            <TermRow label="تخفیف" value={fa(t.discounts)} valueCls="text-violet-700" />
                            <TermRow label="پوشش بنیاد" value={fa(t.sponsorships)} valueCls="text-indigo-700" />
                            <TermRow label="خالص قابل‌پرداخت" value={fa(t.netPayable)} bold />
                            <TermRow label="پرداخت" value={fa(t.payments)} valueCls="text-emerald-700" />
                            <TermRow label="چک وصول‌شده" value={fa(t.chequesCleared)} valueCls="text-emerald-700" />
                            {t.chequesPending > 0 && <TermRow label="چک در انتظار" value={fa(t.chequesPending)} valueCls="text-amber-700" />}
                            {t.chequesBounced > 0 && <TermRow label="چک برگشتی" value={fa(t.chequesBounced)} valueCls="text-rose-700" />}
                            <TermRow label="وام" value={fa(t.loans)} valueCls="text-sky-700" />
                            <tr className="bg-slate-50">
                              <td className="border-t border-slate-300 px-2 py-1 font-black">ماندهٔ ترم</td>
                              <td className={`border-t border-slate-300 px-2 py-1 text-left font-black ${t.balance > 0 ? 'text-rose-700' : t.balance < 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
                                {fa(Math.abs(t.balance))}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        {showEvents && t.events.length > 0 && (
                          <ul className="space-y-0.5 border-t border-slate-200 bg-slate-50/60 px-2 py-1.5">
                            {t.events.map((e, i) => (
                              <li key={i} className="flex items-center justify-between gap-1 text-[9px]">
                                <span className="truncate text-slate-600">
                                  <span className="font-bold text-slate-700">{EVENT_LABEL[e.kind] || e.kind}:</span> {e.label}
                                  {e.dateMs ? <span className="text-slate-400"> — {jdate(new Date(e.dateMs))}</span> : null}
                                </span>
                                <span className={`shrink-0 font-bold ${e.sign === 1 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                  {e.sign === 1 ? '+' : '−'}{fa(e.amount)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── چک‌ها ── */}
        {cheques.length > 0 && (
          <div className="break-inside-avoid">
            <h3 className="mb-1 border-b-2 border-slate-800 pb-1 text-[12px] font-black text-slate-900">چک‌های دانشجو</h3>
            <table className="w-full border-collapse border border-slate-700 text-center text-[10px]">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
                  <th className="border border-slate-300 px-1 py-1">شمارهٔ چک</th>
                  <th className="border border-slate-300 px-1 py-1">بانک</th>
                  <th className="border border-slate-300 px-1 py-1">مبلغ (ریال)</th>
                  <th className="border border-slate-300 px-1 py-1">سررسید</th>
                  <th className="border border-slate-300 px-1 py-1">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {cheques.map((c) => (
                  <tr key={c.id}>
                    <td className="border border-slate-300 px-1 py-1">{faDigits(c.chequeNo || '—')}</td>
                    <td className="border border-slate-300 px-1 py-1">{c.bankName || '—'}</td>
                    <td className="border border-slate-300 px-1 py-1 font-bold">{fa(toNum(c.amount))}</td>
                    <td className="border border-slate-300 px-1 py-1">{jdate(c.dueDate)}</td>
                    <td className="border border-slate-300 px-1 py-1">
                      {c.status === 'CLEARED' ? 'وصول‌شده' : c.status === 'BOUNCED' ? 'برگشتی' : c.status === 'CANCELLED' ? 'باطل‌شده' : 'در انتظار وصول'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── وام‌ها ── */}
        {loans.length > 0 && (
          <div className="break-inside-avoid">
            <h3 className="mb-1 border-b-2 border-slate-800 pb-1 text-[12px] font-black text-slate-900">وام‌های دانشجو</h3>
            <table className="w-full border-collapse border border-slate-700 text-center text-[10px]">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
                  <th className="border border-slate-300 px-1 py-1">نوع وام</th>
                  <th className="border border-slate-300 px-1 py-1">پرداخت‌کننده</th>
                  <th className="border border-slate-300 px-1 py-1">مبلغ (ریال)</th>
                  <th className="border border-slate-300 px-1 py-1">اقساط</th>
                  <th className="border border-slate-300 px-1 py-1">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((l) => (
                  <tr key={l.id}>
                    <td className="border border-slate-300 px-1 py-1">{l.productTitle || '—'}</td>
                    <td className="border border-slate-300 px-1 py-1">{l.lender || '—'}</td>
                    <td className="border border-slate-300 px-1 py-1 font-bold">{fa(toNum(l.amount))}</td>
                    <td className="border border-slate-300 px-1 py-1">{l.installments != null ? fa(l.installments) : '—'}</td>
                    <td className="border border-slate-300 px-1 py-1">
                      {l.status === 'ACTIVE' ? 'فعال' : l.status === 'SETTLED' ? 'تسویه‌شده' : 'لغوشده'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {verifyBlock}

        {/* ── امضا و مهر ── */}
        <div className="grid grid-cols-3 gap-2 pt-2 text-center text-[10px] text-slate-600">
          <div>
            <p className="mb-8 font-medium">کارشناس امور مالی</p>
            <div className="border-t border-slate-400 pt-1">نام و امضا</div>
          </div>
          <div>
            <p className="mb-8 font-medium">مهر ادارهٔ مالی</p>
            <div className="border-t border-slate-400 pt-1">مهر</div>
          </div>
          <div>
            <p className="mb-8 font-medium">مدیر مالی</p>
            <div className="border-t border-slate-400 pt-1">نام و امضا</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TermRow({ label, value, valueCls, bold }: { label: string; value: string; valueCls?: string; bold?: boolean }) {
  return (
    <tr>
      <td className={`border-b border-slate-200 px-2 py-1 text-slate-600 ${bold ? 'font-bold text-slate-800' : ''}`}>{label}</td>
      <td className={`border-b border-slate-200 px-2 py-1 text-left ${bold ? 'font-black text-slate-900' : 'font-medium'} ${valueCls || ''}`}>{value}</td>
    </tr>
  );
}
