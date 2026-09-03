import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import { getStudentByUser, requireRole } from '@/lib/auth';
import { getStudentFinance } from '@/lib/finance-engine';
import { toNum } from '@/lib/finance-rules';
import { getSetting } from '@/lib/settings';
import { toJalaliFromDate, faDigits } from '@/lib/calendar';
import PrintButton from '../PrintButton';

export const dynamic = 'force-dynamic';

const fa = (n: number) => Number(n || 0).toLocaleString('fa-IR');

/** تاریخ شمسی خوانا؛ تهی → خط تیره */
function jdate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  const { jy, jm, jd } = toJalaliFromDate(date);
  return faDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
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

/**
 * رویدادهای مالی که برای دانشجو نمایش داده می‌شوند.
 *
 * تنها FINANCE_CHEQUE_DUE در سامانه تولید می‌شود (توسط پویش یادآوری چک).
 * اگر رویداد مالی تازه‌ای اضافه شد، باید اینجا هم ثبت شود.
 */
const STUDENT_EVENTS = ['FINANCE_CHEQUE_DUE'];

export default async function StudentFinancePage() {
  const user = await requireRole(['STUDENT']);
  const me = await getStudentByUser(user.id);
  if (!me) return <p className="card p-6 text-center text-slate-500">پروندهٔ دانشجویی یافت نشد.</p>;

  const [fin, notifyRows, remindDaysRaw] = await Promise.all([
    getStudentFinance(me.id),
    db.select().from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.id))
      .limit(30),
    getSetting('CHEQUE_REMIND_DAYS'),
  ]);

  if (!fin) return <p className="card p-6 text-center text-slate-500">اطلاعات مالی یافت نشد.</p>;

  const { student, totals, transcript, cheques, loans } = fin;
  const remindDays = Math.max(0, Math.round(toNum(remindDaysRaw) || 0));
  const nowMs = Date.now();

  // چک‌های نزدیک به سررسید یا گذشته از آن — همان چیزی که پیام یادآوری برایش می‌رود
  const dueSoon = cheques
    .filter((c) => c.status === 'PENDING')
    .map((c) => {
      const due = c.dueDate ? new Date(c.dueDate).getTime() : NaN;
      const daysLeft = Number.isFinite(due) ? Math.ceil((due - nowMs) / 86_400_000) : null;
      return { ...c, daysLeft };
    })
    .filter((c) => c.daysLeft !== null && c.daysLeft <= remindDays)
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));

  // eventCode در اسکیما nullable است، پس تهی را صریح پوشش می‌دهیم
  const financeNotifications = notifyRows.filter((n) => !!n.eventCode && STUDENT_EVENTS.includes(n.eventCode));

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          <h1 className="font-extrabold text-slate-800 text-base sm:text-lg">💳 امور مالی من</h1>
          <p className="text-xs text-slate-500 mt-1">کارنامهٔ مالی ترم‌به‌ترم، چک‌ها و وام‌ها</p>
        </div>
        <PrintButton />
      </div>

      {/* ═══ هشهاد سررسید چک — بیرون از بخش چاپی تا همیشه دیده شود ═══ */}
      {dueSoon.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 print:hidden">
          <p className="text-sm font-bold text-amber-900">⚠️ چک در شرف سررسید</p>
          <ul className="mt-1.5 space-y-1 text-xs text-amber-900">
            {dueSoon.map((c) => (
              <li key={c.id}>
                چک شمارهٔ {faDigits(c.chequeNo || '—')}
                {c.bankName ? ` بانک ${c.bankName}` : ''} به مبلغ {fa(toNum(c.amount))} ریال —{' '}
                {c.daysLeft !== null && c.daysLeft < 0
                  ? <span className="font-bold text-rose-700">از سررسید گذشته است</span>
                  : c.daysLeft === 0
                    ? <span className="font-bold">امروز سررسید می‌شود</span>
                    : <span>{faDigits(String(c.daysLeft))} روز تا سررسید</span>}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-amber-800">
            لطفاً پیش از سررسید نسبت به تأمین موجودی اقدام کنید تا چک برگشت نخورد.
          </p>
        </div>
      )}

      {/* ═══ پیام‌های مالی ═══ */}
      {financeNotifications.length > 0 && (
        <div className="card print:hidden">
          <h2 className="mb-2 border-b border-slate-100 pb-2 font-bold text-slate-800">پیام‌های مالی</h2>
          <ul className="space-y-2">
            {financeNotifications.map((n) => {
              let text = '';
              try { text = JSON.parse(n.payload || '{}').text || ''; } catch { text = ''; }
              return (
                <li key={n.id} className="flex flex-wrap items-start justify-between gap-2 text-xs">
                  <span className="text-slate-700">{text || n.eventCode}</span>
                  <span className="text-[11px] text-slate-400">{jdate(n.createdAt)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ═══ بخش چاپ‌شدنی ═══ */}
      <div className="print-area space-y-4">
        <div className="card">
          <div className="mb-3 border-b border-slate-100 pb-2 text-center">
            <h2 className="font-extrabold text-slate-800">کارنامهٔ مالی دانشجو</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">دانشگاه آزاد اسلامی — واحد ممسنی</p>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
            <div><span className="text-slate-500">نام و نام خانوادگی: </span><span className="font-medium text-slate-800">{student.fullName || '—'}</span></div>
            <div><span className="text-slate-500">شمارهٔ دانشجویی: </span><span className="font-medium text-slate-800">{faDigits(student.studentCode || '—')}</span></div>
            <div><span className="text-slate-500">کد ملی: </span><span className="font-medium text-slate-800">{faDigits(student.nationalCode || '—')}</span></div>
            <div><span className="text-slate-500">رشته: </span><span className="font-medium text-slate-800">{student.majorTitle || '—'}</span></div>
            <div><span className="text-slate-500">مقطع: </span><span className="font-medium text-slate-800">{student.degreeTitle || '—'}</span></div>
            <div><span className="text-slate-500">ورودی: </span><span className="font-medium text-slate-800">{student.entryYear ? fa(student.entryYear) : '—'}</span></div>
          </div>
        </div>

        <div className="card">
          <h3 className="mb-2 border-b border-slate-100 pb-2 font-bold text-slate-800">جمع کل دوره</h3>
          <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            <div>
              <p className="text-lg font-bold text-slate-800">{fa(totals.charges)}</p>
              <p className="text-[11px] text-slate-500">جمع شهریه (ریال)</p>
            </div>
            <div>
              <p className="text-lg font-bold text-violet-700">{fa(totals.discounts)}</p>
              <p className="text-[11px] text-slate-500">تخفیف‌ها</p>
            </div>
            <div>
              <p className="text-lg font-bold text-indigo-700">{fa(totals.sponsorships)}</p>
              <p className="text-[11px] text-slate-500">پوشش بنیادها</p>
            </div>
            <div>
              <p className="text-lg font-bold text-emerald-700">{fa(totals.payments + totals.chequesCleared + totals.loans)}</p>
              <p className="text-[11px] text-slate-500">پرداخت / وام / چک وصولی</p>
            </div>
          </div>
          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-center">
            <p className={`text-xl font-extrabold ${totals.balance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
              {fa(Math.abs(totals.balance))} ریال
            </p>
            <p className="text-[11px] text-slate-600">
              {totals.balance > 0 ? 'ماندهٔ بدهی شما' : totals.balance < 0 ? 'بستانکاری شما' : 'حساب شما تسویه است'}
            </p>
          </div>
          {totals.chequesPending > 0 && (
            <p className="mt-2 text-center text-[11px] text-amber-700">
              ⚠️ {fa(totals.chequesPending)} ریال چک وصول‌نشده دارید — در ماندهٔ بالا لحاظ نشده است
            </p>
          )}
        </div>

        <div className="card">
          <h3 className="mb-2 border-b border-slate-100 pb-2 font-bold text-slate-800">ریز ترم‌به‌ترم</h3>
          {transcript.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">هیچ تراکنش مالی ثبت نشده است.</p>
          ) : (
            <div className="space-y-3">
              {transcript.map((t) => (
                <div key={t.termId} className="rounded-lg border border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                    <h4 className="text-sm font-bold text-slate-800">{t.termTitle}</h4>
                    <p className={`text-xs font-bold ${t.balance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                      مانده: {fa(Math.abs(t.balance))} ریال
                      {t.balance > 0 ? ' (بدهکار)' : t.balance < 0 ? ' (بستانکار)' : ' (تسویه)'}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 p-3 text-[11px] sm:grid-cols-4">
                    <div><span className="text-slate-500">شهریه: </span><span className="font-medium">{fa(t.charges)}</span></div>
                    <div><span className="text-slate-500">تخفیف: </span><span className="font-medium text-violet-700">{fa(t.discounts)}</span></div>
                    <div><span className="text-slate-500">بنیاد: </span><span className="font-medium text-indigo-700">{fa(t.sponsorships)}</span></div>
                    <div><span className="text-slate-500">پرداخت: </span><span className="font-medium text-emerald-700">{fa(t.payments)}</span></div>
                    <div><span className="text-slate-500">چک وصولی: </span><span className="font-medium">{fa(t.chequesCleared)}</span></div>
                    <div><span className="text-slate-500">چک معوق: </span><span className="font-medium text-amber-700">{fa(t.chequesPending)}</span></div>
                    <div><span className="text-slate-500">وام: </span><span className="font-medium text-sky-700">{fa(t.loans)}</span></div>
                  </div>
                  {t.events.length > 0 && (
                    <div className="border-t border-slate-100 px-3 py-2">
                      <ul className="space-y-1">
                        {t.events.map((e, i) => (
                          <li key={i} className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                            <span className="flex items-center gap-1.5">
                              <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600">
                                {EVENT_LABEL[e.kind] || e.kind}
                              </span>
                              <span className="text-slate-700">{e.label}</span>
                              {e.dateMs && <span className="text-slate-400">{jdate(new Date(e.dateMs))}</span>}
                            </span>
                            <span className={`font-medium ${e.sign === 1 ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {e.sign === 1 ? '+' : '−'}{fa(e.amount)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {cheques.length > 0 && (
          <div className="card">
            <h3 className="mb-2 border-b border-slate-100 pb-2 font-bold text-slate-800">چک‌های شما</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] text-slate-500">
                    <th className="p-2">شمارهٔ چک</th><th className="p-2">بانک</th>
                    <th className="p-2">مبلغ</th><th className="p-2">سررسید</th><th className="p-2">وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {cheques.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100 last:border-0">
                      <td className="p-2">{faDigits(c.chequeNo || '—')}</td>
                      <td className="p-2 text-slate-600">{c.bankName || '—'}</td>
                      <td className="p-2">{fa(toNum(c.amount))}</td>
                      <td className="p-2">{jdate(c.dueDate)}</td>
                      <td className="p-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] ${
                          c.status === 'CLEARED' ? 'bg-emerald-50 text-emerald-700' :
                          c.status === 'BOUNCED' ? 'bg-rose-50 text-rose-700' :
                          c.status === 'CANCELLED' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}>
                          {c.status === 'CLEARED' ? 'وصول‌شده' : c.status === 'BOUNCED' ? 'برگشتی' :
                           c.status === 'CANCELLED' ? 'باطل‌شده' : 'در انتظار وصول'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {loans.length > 0 && (
          <div className="card">
            <h3 className="mb-2 border-b border-slate-100 pb-2 font-bold text-slate-800">وام‌های شما</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] text-slate-500">
                    <th className="p-2">نوع وام</th><th className="p-2">پرداخت‌کننده</th>
                    <th className="p-2">مبلغ</th><th className="p-2">اقساط</th><th className="p-2">وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.map((l) => (
                    <tr key={l.id} className="border-b border-slate-100 last:border-0">
                      <td className="p-2">{l.productTitle || '—'}</td>
                      <td className="p-2 text-slate-600">{l.lender}</td>
                      <td className="p-2">{fa(toNum(l.amount))}</td>
                      <td className="p-2">{fa(l.installments)}</td>
                      <td className="p-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] ${
                          l.status === 'ACTIVE' ? 'bg-sky-50 text-sky-700' :
                          l.status === 'SETTLED' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                          {l.status === 'ACTIVE' ? 'فعال' : l.status === 'SETTLED' ? 'تسویه‌شده' : 'لغوشده'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
