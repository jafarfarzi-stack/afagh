import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { getStudentFinance, computeFormulaTuition } from '@/lib/finance-engine';
import { computeTermTuition } from '@/lib/tuition-engine';
import { toJalaliFromDate, faDigits } from '@/lib/calendar';
import PrintButton from '@/components/PrintButton';
import FinanceStudentClient from './FinanceStudentClient';
import { db } from '@/db';
import { eq } from 'drizzle-orm';
import { student_subject_fees, subject_fee_types } from '@/db/schema';

export const dynamic = 'force-dynamic';

const FINANCE = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'];

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

const EVENT_COLOR: Record<string, string> = {
  CHARGE: 'bg-rose-50 text-rose-700 border-rose-200',
  DISCOUNT: 'bg-violet-50 text-violet-700 border-violet-200',
  SPONSOR: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  PAYMENT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CHEQUE: 'bg-amber-50 text-amber-700 border-amber-200',
  LOAN: 'bg-sky-50 text-sky-700 border-sky-200',
  CLEARANCE: 'bg-slate-100 text-slate-700 border-slate-200',
};

export default async function StudentFinancePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(FINANCE);

  const { id } = await params;
  const studentId = Number(id);
  if (!Number.isFinite(studentId)) notFound();

  const fin = await getStudentFinance(studentId);
  if (!fin) notFound();

  // فرمول تخصیص منطبق — برای هر ترم، تا کارشناس بداند مبنای محاسبه چیست
  const currentTerm = fin.terms.find((t) => t.isCurrent === 1) || fin.terms[0] || null;
  const formulaCalc = currentTerm
    ? await computeFormulaTuition(studentId, currentTerm.id)
    : null;

  // محاسبه شهریه با ضریب و مبالغ موضوعی برای ترم جاری
  const enhancedTuition = currentTerm
    ? await computeTermTuition(studentId, currentTerm.id)
    : null;

  // خواندن مبالغ موضوعی ترم جاری
  const subjectFees = currentTerm ? await db
    .select({
      typeTitle: subject_fee_types.title,
      typeKind: subject_fee_types.kind,
      amount: student_subject_fees.amount,
    })
    .from(student_subject_fees)
    .innerJoin(subject_fee_types, eq(subject_fee_types.id, student_subject_fees.subjectFeeTypeId))
    .where(eq(student_subject_fees.studentId, studentId)) : [];

  const { student, totals, transcript } = fin;

  return (
    <div className="space-y-4" dir="rtl">
      {/* سربرگ */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          <h1 className="font-extrabold text-slate-800 text-base sm:text-lg">📄 کارنامهٔ مالی دانشجو</h1>
          <p className="text-xs text-slate-500 mt-1">
            {student.fullName} — {student.studentCode || 'بدون شمارهٔ دانشجویی'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          <Link href="/admin/finance" className="rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700">
            بازگشت به کارتابل
          </Link>
        </div>
      </div>

      {/* ═══ بخش چاپ‌شدنی ═══ */}
      <div className="print-area space-y-4">
        {/* مشخصات دانشجو */}
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

        {/* جمع کل */}
        <div className="card">
          <h3 className="mb-2 border-b border-slate-100 pb-2 font-bold text-slate-800">جمع کل دوره</h3>
          <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            <div>
              <p className="text-lg font-bold text-slate-800">{fa(totals.charges)}</p>
              <p className="text-[11px] text-slate-500">جمع شهریه (ریال)</p>
            </div>
            <div>
              <p className="text-lg font-bold text-violet-700">{fa(totals.discounts)}</p>
              <p className="text-[11px] text-slate-500">جمع تخفیف</p>
            </div>
            <div>
              <p className="text-lg font-bold text-indigo-700">{fa(totals.sponsorships)}</p>
              <p className="text-[11px] text-slate-500">پوشش بنیادها</p>
            </div>
            <div>
              <p className="text-lg font-bold text-emerald-700">{fa(totals.payments + totals.chequesCleared + totals.loans)}</p>
              <p className="text-[11px] text-slate-500">جمع پرداخت/وام/چک وصولی</p>
            </div>
          </div>

          {/* جزئیات ترم جاری با ضریب و مبالغ موضوعی */}
          {enhancedTuition && (enhancedTuition.fixedCoefficient !== 1 || enhancedTuition.variableCoefficient !== 1 || enhancedTuition.subjectFeesTotal !== 0) && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <h4 className="mb-2 text-xs font-bold text-amber-800">شهریهٔ ترم جاری با ضریب افزایشی</h4>
              <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                <div><span className="text-slate-500">شهریه خام: </span><span className="font-medium">{fa(enhancedTuition.fixedTuition + enhancedTuition.variableTuition)}</span></div>
                {enhancedTuition.fixedCoefficient !== 1 && (
                  <div><span className="text-slate-500">ضریب ثابت: </span><span className="font-medium text-amber-700">×{enhancedTuition.fixedCoefficient}</span></div>
                )}
                {enhancedTuition.variableCoefficient !== 1 && (
                  <div><span className="text-slate-500">ضریب متغیر: </span><span className="font-medium text-amber-700">×{enhancedTuition.variableCoefficient}</span></div>
                )}
                {enhancedTuition.subjectFeesTotal !== 0 && (
                  <div><span className="text-slate-500">مبالغ موضوعی: </span><span className={`font-medium ${enhancedTuition.subjectFeesTotal > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{enhancedTuition.subjectFeesTotal > 0 ? '+' : ''}{fa(enhancedTuition.subjectFeesTotal)}</span></div>
                )}
              </div>
              {enhancedTuition.subjectFees.length > 0 && (
                <div className="mt-2 border-t border-amber-200 pt-2">
                  <p className="mb-1 text-[10px] font-bold text-amber-700">اقلام موضوعی:</p>
                  <div className="flex flex-wrap gap-2">
                    {enhancedTuition.subjectFees.map((sf, i) => (
                      <span key={i} className={`rounded px-1.5 py-0.5 text-[10px] ${sf.kind === 'ADDITIVE' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}`}>
                        {sf.title}: {sf.amount > 0 ? '+' : ''}{fa(sf.amount)} ریال
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <p className="mt-2 text-[11px] text-amber-700">
                شهریه نهایی ترم جاری: <span className="font-bold">{fa(enhancedTuition.totalTuition)} ریال</span>
              </p>
            </div>
          )}

          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-center">
            <p className={`text-xl font-extrabold ${totals.balance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
              {fa(Math.abs(totals.balance))} ریال
            </p>
            <p className="text-[11px] text-slate-600">
              {totals.balance > 0 ? 'ماندهٔ بدهی دانشجو' : totals.balance < 0 ? 'بستانکاری دانشجو' : 'حساب تسویه است'}
            </p>
          </div>
          {totals.chequesPending > 0 && (
            <p className="mt-2 text-center text-[11px] text-amber-700">
              ⚠️ {fa(totals.chequesPending)} ریال چک وصول‌نشده — در ماندهٔ بالا لحاظ نشده است
            </p>
          )}
        </div>

        {/* کارنامهٔ ترم‌به‌ترم */}
        <div className="card">
          <h3 className="mb-2 border-b border-slate-100 pb-2 font-bold text-slate-800">ریز ترم‌به‌ترم</h3>

          {transcript.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">هیچ تراکنش مالی برای این دانشجو ثبت نشده است.</p>
          ) : (
            <div className="space-y-4">
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
                    <div><span className="text-slate-500">چک برگشتی: </span><span className="font-medium text-rose-700">{fa(t.chequesBounced)}</span></div>
                    <div><span className="text-slate-500">وام: </span><span className="font-medium text-sky-700">{fa(t.loans)}</span></div>
                  </div>

                  {t.events.length > 0 && (
                    <div className="border-t border-slate-100 px-3 py-2">
                      <p className="mb-1.5 text-[11px] font-bold text-slate-600">رویدادها</p>
                      <ul className="space-y-1">
                        {t.events.map((e, i) => (
                          <li key={i} className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                            <span className="flex items-center gap-1.5">
                              <span className={`rounded border px-1.5 py-0.5 text-[10px] ${EVENT_COLOR[e.kind] || EVENT_COLOR.CLEARANCE}`}>
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

        {/* چک‌ها */}
        {fin.cheques.length > 0 && (
          <div className="card">
            <h3 className="mb-2 border-b border-slate-100 pb-2 font-bold text-slate-800">چک‌های دانشجو</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] text-slate-500">
                    <th className="p-2">شمارهٔ چک</th>
                    <th className="p-2">بانک</th>
                    <th className="p-2">مبلغ</th>
                    <th className="p-2">سررسید</th>
                    <th className="p-2">وضعیت</th>
                    <th className="p-2">یادآوری</th>
                  </tr>
                </thead>
                <tbody>
                  {fin.cheques.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100 last:border-0">
                      <td className="p-2">{faDigits(c.chequeNo || '—')}</td>
                      <td className="p-2 text-slate-600">{c.bankName || '—'}</td>
                      <td className="p-2">{fa(Number(c.amount))}</td>
                      <td className="p-2">{jdate(c.dueDate)}</td>
                      <td className="p-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] ${
                          c.status === 'CLEARED' ? 'bg-emerald-50 text-emerald-700' :
                          c.status === 'BOUNCED' ? 'bg-rose-50 text-rose-700' :
                          c.status === 'CANCELLED' ? 'bg-slate-100 text-slate-600' :
                          'bg-amber-50 text-amber-700'
                        }`}>
                          {c.status === 'CLEARED' ? 'وصول‌شده' :
                           c.status === 'BOUNCED' ? 'برگشتی' :
                           c.status === 'CANCELLED' ? 'باطل‌شده' : 'در انتظار'}
                        </span>
                      </td>
                      <td className="p-2 text-slate-500">{c.remindedAt ? jdate(c.remindedAt) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ═══ بخش مدیریتی — چاپ نمی‌شود ═══ */}
      <FinanceStudentClient
        studentId={studentId}
        terms={fin.terms}
        discountTypes={fin.discountTypes.map((d) => ({
          id: d.id, title: d.title, kind: d.kind,
          defaultPercent: Number(d.defaultPercent), defaultAmount: Number(d.defaultAmount),
          maxPercent: d.maxPercent === null ? null : Number(d.maxPercent),
        }))}
        sponsors={fin.sponsors.map((s) => ({ id: s.id, title: s.title }))}
        discounts={fin.discounts.map((d) => ({
          id: d.id, typeTitle: d.typeTitle, kind: d.kind,
          percent: Number(d.percent), amount: Number(d.amount),
          status: d.status, termId: d.termId, reason: d.reason,
        }))}
        sponsorships={fin.sponsorships.map((s) => ({
          id: s.id, sponsorTitle: s.sponsorTitle, coverageKind: s.coverageKind,
          percent: Number(s.percent), amount: Number(s.amount),
          status: s.status, termId: s.termId, referenceNo: s.referenceNo,
        }))}
        cheques={fin.cheques.map((c) => ({
          id: c.id, chequeNo: c.chequeNo, bankName: c.bankName,
          amount: Number(c.amount), status: c.status,
          dueDate: c.dueDate ? new Date(c.dueDate).toISOString().slice(0, 10) : null,
          remindedAt: c.remindedAt ? new Date(c.remindedAt).toISOString().slice(0, 10) : null,
        }))}
        loans={fin.loans.map((l) => ({
          id: l.id, lender: l.lender, loanCode: l.loanCode,
          amount: Number(l.amount), installments: l.installments, status: l.status,
          productTitle: l.productTitle,
        }))}
        loanProducts={fin.loanProducts.map((l) => ({
          id: l.id, code: l.code, title: l.title, lender: l.lender,
          maxAmount: l.maxAmount === null ? null : Number(l.maxAmount),
          defaultAmount: Number(l.defaultAmount),
          defaultInstallments: l.defaultInstallments,
        }))}
        formula={formulaCalc ? {
          termTitle: currentTerm?.termTitle || '',
          formulaTitle: formulaCalc.formula?.title || null,
          buckets: formulaCalc.buckets,
          fixed: formulaCalc.fixed,
          variable: formulaCalc.variable,
          total: formulaCalc.total,
          termId: currentTerm?.id ?? null,
        } : null}
        enhancedTuition={enhancedTuition ? {
          fixedTuition: enhancedTuition.fixedTuition,
          variableTuition: enhancedTuition.variableTuition,
          fixedCoefficient: enhancedTuition.fixedCoefficient,
          variableCoefficient: enhancedTuition.variableCoefficient,
          fixedTuitionAfterCoeff: enhancedTuition.fixedTuitionAfterCoeff,
          variableTuitionAfterCoeff: enhancedTuition.variableTuitionAfterCoeff,
          subjectFees: enhancedTuition.subjectFees,
          subjectFeesTotal: enhancedTuition.subjectFeesTotal,
          totalTuition: enhancedTuition.totalTuition,
        } : null}
      />
    </div>
  );
}
