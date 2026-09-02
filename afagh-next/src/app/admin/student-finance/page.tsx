import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { requireRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const TX_FA: Record<string, string> = {
  TUITION_CHARGE: 'شارژ شهریه',
  CHARGE: 'بدهی',
  PAYMENT: 'پرداخت',
  CREDIT: 'بستانکاری',
};

const txFa = (t: string) => TX_FA[t] ?? t;

const fa = (n: number) => Math.round(n).toLocaleString('fa-IR');

export default async function StudentFinancePage() {
  await requireRole(['ADMIN', 'FINANCE_EXPERT', 'FINANCE']);

  // ── جمع کل شارژ/وصول و تعداد تراکنش‌ها ──
  const [tot] = (
    await db.execute(sql`
      select
        coalesce(sum(case when "transactionType" in ('TUITION_CHARGE','CHARGE') then amount else 0 end),0)::float8 as charged,
        coalesce(sum(case when "transactionType" in ('PAYMENT','CREDIT') then amount else 0 end),0)::float8 as paid,
        count(*)::int as txns
      from student_ledger`)
  ).rows as unknown as { charged: number; paid: number; txns: number }[];

  // ── ماندهٔ هر دانشجو و استخراج بدهکاران ──
  const debtors = (
    await db.execute(sql`
      select b.bal::float8 as bal, st."studentCode", u."firstName", u."lastName"
      from (
        select "studentId",
          sum(case when "transactionType" in ('TUITION_CHARGE','CHARGE') then -amount
                   when "transactionType" in ('PAYMENT','CREDIT') then amount else 0 end) as bal
        from student_ledger group by "studentId"
      ) b
      join students st on st.id = b."studentId"
      join users u on u.id = st."userId"
      where b.bal < 0
      order by b.bal asc
      limit 12`)
  ).rows as unknown as { bal: number; studentCode: string; firstName: string; lastName: string }[];

  const totalDebt = debtors.reduce((s, d) => s + -d.bal, 0);

  // ── پرونده‌های در انتظار اقدام مالی ──
  const pending = (
    await db.execute(sql`
      select r."trackingCode", r.status, pd.title, ps.title as step, u."firstName", u."lastName"
      from student_requests r
      join process_steps ps on ps.id = r."currentStepId"
      join students st on st.id = r."studentId"
      join users u on u.id = st."userId"
      left join process_definitions pd on pd.id = r."processId"
      where ps."roleCode" in ('FINANCE_EXPERT','FINANCE')
        and r.status not in ('APPROVED','REJECTED','CANCELLED')
      order by r.id desc limit 10`)
  ).rows as unknown as { trackingCode: string; status: string; title: string | null; step: string; firstName: string; lastName: string }[];

  // ── آخرین تراکنش‌های دفتر مالی ──
  const recent = (
    await db.execute(sql`
      select l."transactionType", l.amount::float8 as amount, l.description, l."createdAt",
             st."studentCode", u."firstName", u."lastName"
      from student_ledger l
      join students st on st.id = l."studentId"
      join users u on u.id = st."userId"
      order by l.id desc limit 10`)
  ).rows as unknown as {
    transactionType: string;
    amount: number;
    description: string | null;
    createdAt: Date | null;
    studentCode: string;
    firstName: string;
    lastName: string;
  }[];

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-extrabold text-slate-800 text-base sm:text-lg">💳 امور مالی دانشجویان</h1>
          <p className="text-xs text-slate-500 mt-1">شهریه، دفتر مالی دانشجویان و پرونده‌های در انتظار اقدام مالی</p>
        </div>
      </div>

      {/* آمار کل */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card text-center">
          <p className="text-xl font-bold text-slate-800">{fa(tot?.charged ?? 0)}</p>
          <p className="text-xs text-slate-500">جمع شارژ/بدهی (ریال)</p>
        </div>
        <div className="card text-center">
          <p className="text-xl font-bold text-emerald-700">{fa(tot?.paid ?? 0)}</p>
          <p className="text-xs text-slate-500">جمع وصولی/بستانکاری (ریال)</p>
        </div>
        <div className="card text-center">
          <p className="text-xl font-bold text-rose-700">{fa(totalDebt)}</p>
          <p className="text-xs text-slate-500">مانده بدهی دانشجویان (ریال)</p>
        </div>
        <div className="card text-center">
          <p className="text-xl font-bold text-indigo-700">{debtors.length > 0 ? fa(debtors.length) + ' دانشجو' : '—'}</p>
          <p className="text-xs text-slate-500">دانشجویان بدهکار (نمونهٔ برتر)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* بدهکاران */}
        <div className="card">
          <h2 className="font-bold text-slate-800 mb-3 border-b border-slate-100 pb-2">دانشجویان بدهکار (بیشترین بدهی)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-200">
                  <th className="p-2">دانشجو</th>
                  <th className="p-2">کد</th>
                  <th className="p-2">مانده بدهی (ریال)</th>
                </tr>
              </thead>
              <tbody>
                {debtors.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-5 text-center text-slate-400">
                      دانشجوی بدهکاری ثبت نشده است.
                    </td>
                  </tr>
                )}
                {debtors.map(d => (
                  <tr key={d.studentCode} className="border-t border-slate-100">
                    <td className="p-2 font-semibold text-slate-800">{d.firstName} {d.lastName}</td>
                    <td className="p-2 font-mono text-xs text-slate-500" dir="ltr">{d.studentCode}</td>
                    <td className="p-2 font-bold text-rose-700">{fa(-d.bal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* در انتظار اقدام مالی */}
        <div className="card">
          <h2 className="font-bold text-slate-800 mb-3 border-b border-slate-100 pb-2">پرونده‌های در انتظار اقدام مالی</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-200">
                  <th className="p-2">کد رهگیری</th>
                  <th className="p-2">دانشجو</th>
                  <th className="p-2">فرآیند / گام</th>
                </tr>
              </thead>
              <tbody>
                {pending.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-5 text-center text-slate-400">
                      پرونده‌ای در صف مالی نیست.
                    </td>
                  </tr>
                )}
                {pending.map(p => (
                  <tr key={p.trackingCode} className="border-t border-slate-100">
                    <td className="p-2 font-mono text-xs font-bold text-slate-700" dir="ltr">{p.trackingCode}</td>
                    <td className="p-2 text-slate-800">{p.firstName} {p.lastName}</td>
                    <td className="p-2 text-xs text-slate-600">
                      {p.title ?? '—'} · {p.step}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* آخرین تراکنش‌ها */}
      <div className="card">
        <h2 className="font-bold text-slate-800 mb-3 border-b border-slate-100 pb-2">آخرین تراکنش‌های دفتر مالی</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-200">
                <th className="p-2">تاریخ</th>
                <th className="p-2">دانشجو</th>
                <th className="p-2">نوع</th>
                <th className="p-2">مبلغ (ریال)</th>
                <th className="p-2">شرح</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-5 text-center text-slate-400">
                    تراکنشی در دفتر مالی ثبت نشده است.
                  </td>
                </tr>
              )}
              {recent.map((t, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="p-2 text-xs text-slate-500">
                    {t.createdAt ? new Date(t.createdAt).toLocaleDateString('fa-IR') : '—'}
                  </td>
                  <td className="p-2 text-slate-800">
                    {t.firstName} {t.lastName}
                    <span className="text-[10px] font-mono text-slate-400 mr-1" dir="ltr">{t.studentCode}</span>
                  </td>
                  <td className="p-2 text-xs">{txFa(t.transactionType)}</td>
                  <td className="p-2 font-bold text-slate-700">{fa(t.amount)}</td>
                  <td className="p-2 text-xs text-slate-500 truncate max-w-[220px]">{t.description ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
