import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { DEBT_LEDGER_TYPES, CREDIT_LEDGER_TYPES, ledgerTypesCsv } from '@/lib/ledger-balance';

export const dynamic = 'force-dynamic';

const TX_FA: Record<string, string> = {
  TUITION_CHARGE: 'شارژ شهریه',
  CHARGE: 'بدهی',
  PAYMENT: 'پرداخت',
  CREDIT: 'بستانکاری',
};

const txFa = (t: string) => TX_FA[t] ?? t;

const fa = (n: number) => Math.round(n).toLocaleString('fa-IR');

export default async function StudentFinancePage({
  searchParams,
}: {
  // در Next 16 مقدار searchParams یک Promise است — بدون await، فیلترِ
  // «نوع واریز» همیشه undefined می‌شد و بی‌صدا کار نمی‌کرد.
  searchParams: Promise<{ depositType?: string }>;
}) {
  await requireRole(['ADMIN', 'FINANCE_EXPERT', 'FINANCE']);
  const sp = await searchParams;

  const currentUniversity = await getCurrentUniversity();

  // فهرستِ کانونیِ انواعِ تراکنش — منبعِ واحدِ مانده (lib/ledger-balance).
  // پیش‌تر این صفحه فقط 'TUITION_CHARGE','CHARGE' را بدهی می‌شمرد و
  // TUITION_FIXED/VARIABLE (شارژِ واقعی) را نادیده می‌گرفت؛ نتیجه: «جمع
  // شارژ» صفر و فهرستِ بدهکاران غلط می‌شد.
  const DEBT_CSV = sql.raw(`(${ledgerTypesCsv(DEBT_LEDGER_TYPES)})`);
  const CREDIT_CSV = sql.raw(`(${ledgerTypesCsv(CREDIT_LEDGER_TYPES)})`);
  const currentUniversityId = currentUniversity?.id ?? null;
  // دفتر مالی دانشگاه فعال: ردیف‌های همین دانشگاه + سراسری (universityId=null)
  const ledgerScope = currentUniversityId
    ? sql`where ("universityId" = ${currentUniversityId} or "universityId" is null)`
    : sql`where 1 = 0`;
  const studentScope = currentUniversityId
    ? sql`and (st."universityId" = ${currentUniversityId} or st."universityId" is null)`
    : sql`and 1 = 0`;
  const requestScope = currentUniversityId
    ? sql`and (r."universityId" = ${currentUniversityId} or r."universityId" is null)`
    : sql`and 1 = 0`;

  // ── تفکیک وصولی بر اساس «نوع واریز» ──
  const payScope = currentUniversityId
    ? sql`and (l."universityId" = ${currentUniversityId} or l."universityId" is null)`
    : sql`and 1 = 0`;

  // ── فیلتر نوع واریز (از ستون ساختاریافتهٔ جدید — مهاجرت ۰۱۱۹) ──
  const depositTypeFilter =
    typeof sp?.depositType === 'string' && sp.depositType.length > 0
      ? sp.depositType
      : null;
  const filterSql = depositTypeFilter
    ? sql`and l."depositType" = ${depositTypeFilter}`
    : sql``;

  // ── محدودهٔ «آخرین تراکنش‌ها» ──
  // قبلاً فیلترِ دانشگاه به‌صورت `where st."universityId" = X` **بعد از** اتصال
  // اعمال می‌شد؛ چون `order by l.id desc limit 10` هم روی همان کوئری بود،
  // PostgreSQL نمی‌توانست از ایندکسِ کلیدِ اصلی برای «۱۰ ردیفِ آخر» استفاده کند
  // و مجبور بود کلِ دفترِ مالی را با students/users هش‌جوین کند، بعد مرتب کند و
  // ده ردیف بردارد (در پروفایل: ۰.۶۶ ثانیه). حالا همان فیلتر را به یک نیمه‌اتصال
  // روی `students` منتقل کردیم و `limit` داخل زیرکوئری است، پس موتور می‌تواند
  // ایندکسِ `id` را نزولی بپیماید و به‌محضِ رسیدن به ۱۰ ردیف بایستد.
  const recentWhere = currentUniversityId
    ? sql`where l."studentId" in (
            select st2.id from students st2
            where st2."universityId" = ${currentUniversityId} or st2."universityId" is null
          )`
    : sql``;

  // ── هر شش کوئری مستقل‌اند؛ قبلاً پشتِ سرِ هم اجرا می‌شدند و تأخیرشان جمع
  //    می‌شد (۶ رفت‌وبرگشتِ سریالی به دیتابیس). حالا موازی‌اند.
  const [totRes, debtorsRes, pendingRes, recentRes, depositTypeRes, byMethodRes] = await Promise.all([
    // ۱) جمع کل شارژ/وصول و تعداد تراکنش‌ها
    db.execute(sql`
      select
        coalesce(sum(case when "transactionType" in ${DEBT_CSV} then amount else 0 end),0)::float8 as charged,
        coalesce(sum(case when "transactionType" in ${CREDIT_CSV} then amount else 0 end),0)::float8 as paid,
        count(*)::int as txns
      from student_ledger ${ledgerScope}`),

    // ۲) ماندهٔ هر دانشجو و استخراج بدهکاران
    db.execute(sql`
      select b.bal::float8 as bal, st."studentCode", u."firstName", u."lastName"
      from (
        select "studentId",
          sum(case when "transactionType" in ${DEBT_CSV} then amount
                   when "transactionType" in ${CREDIT_CSV} then -amount else 0 end) as bal
        from student_ledger ${ledgerScope} group by "studentId"
      ) b
      join students st on st.id = b."studentId"
      join users u on u.id = st."userId"
      where b.bal > 0 ${studentScope}
      order by b.bal desc
      limit 12`),

    // ۳) پرونده‌های در انتظار اقدام مالی
    db.execute(sql`
      select r."trackingCode", r.status, pd.title, ps.title as step, u."firstName", u."lastName"
      from student_requests r
      join process_steps ps on ps.id = r."currentStepId"
      join students st on st.id = r."studentId"
      join users u on u.id = st."userId"
      left join process_definitions pd on pd.id = r."processId"
      where ps."roleCode" in ('FINANCE_EXPERT','FINANCE')
        and r.status not in ('APPROVED','REJECTED','CANCELLED') ${requestScope} ${studentScope}
      order by r.id desc limit 10`),

    // ۴) آخرین تراکنش‌های دفتر مالی
    db.execute(sql`
      select l."transactionType", l.amount::float8 as amount, l.description, l."createdAt",
             l."depositType", l."depositDate",
             st."studentCode", u."firstName", u."lastName"
      from (
        select * from student_ledger l ${recentWhere} order by l.id desc limit 10
      ) l
      join students st on st.id = l."studentId"
      join users u on u.id = st."userId"
      order by l.id desc`),

    // ۵) گزینه‌های فیلتر: انواع واریزِ موجود در دفتر (هم‌گام با داده پس از بک‌فیل)
    db.execute(sql`
      select distinct coalesce(l."depositType", 'نامشخص / بدون شرح') as dt
      from student_ledger l
      where l."transactionType" = 'PAYMENT' ${payScope}
      order by 1`),

    // ۶) تفکیک وصولی بر اساس «نوع واریز»
    // از ستون ساختاریافتهٔ depositType استفاده می‌کند (پس از بک‌فیلِ مهاجرت ۰۱۱۹
    // مقدارش از متنِ description پر شده است)؛ گزارش‌گیری دیگر به متنِ شرح وابسته نیست.
    db.execute(sql`
      select
        coalesce(l."depositType", 'نامشخص / بدون شرح') as deposit_type,
        count(*)::int as txn_count,
        coalesce(sum(l.amount), 0)::float8 as total_amount
      from student_ledger l
      where l."transactionType" = 'PAYMENT' ${payScope} ${filterSql}
      group by 1
      order by 2 desc`),
  ]);

  const [tot] = totRes.rows as unknown as { charged: number; paid: number; txns: number }[];

  const debtors = debtorsRes.rows as unknown as {
    bal: number;
    studentCode: string;
    firstName: string;
    lastName: string;
  }[];

  const pending = pendingRes.rows as unknown as {
    trackingCode: string;
    status: string;
    title: string | null;
    step: string;
    firstName: string;
    lastName: string;
  }[];

  const recent = recentRes.rows as unknown as {
    transactionType: string;
    amount: number;
    description: string | null;
    createdAt: Date | null;
    depositType: string | null;
    depositDate: Date | null;
    studentCode: string;
    firstName: string;
    lastName: string;
  }[];

  const depositTypeOptions = depositTypeRes.rows as unknown as { dt: string }[];
  const byMethod = byMethodRes.rows as unknown as {
    deposit_type: string;
    txn_count: number;
    total_amount: number;
  }[];

  // متنِ هشدار باید عددی باشد، نه ادعای کلی: چند پرداخت واقعاً تاریخِ واریز ندارند؟
  let missingDateCount = 0;
  try {
    const nd = await db.execute(sql`
      select count(*)::int as c
      from student_ledger ${ledgerScope}
      where "transactionType" = 'PAYMENT' and "depositDate" is null
    `);
    missingDateCount = Number((nd.rows ?? [])[0]?.c ?? 0);
  } catch {
    missingDateCount = 0;
  }

  const totalDebt = debtors.reduce((s, d) => s + d.bal, 0);
  const methodTotal = byMethod.reduce((s, r) => s + r.total_amount, 0);
  const methodCount = byMethod.reduce((s, r) => s + r.txn_count, 0);
  const pct = (v: number) => (methodTotal ? (v / methodTotal) * 100 : 0);

  return (
    <div className="space-y-4" dir="rtl">
      {/* ── سربرگ premium ── */}
      <div className="overflow-hidden rounded-2xl border border-emerald-900/20 bg-gradient-to-l from-emerald-700 via-teal-700 to-slate-900 p-4 text-white shadow-lg print:hidden sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-black sm:text-xl">💳 امور مالی دانشجویان</h1>
            <p className="mt-1 text-xs text-emerald-50/90">شهریه، دفتر مالی دانشجویان و پرونده‌های در انتظار اقدام مالی</p>
          </div>
          <Link prefetch={false}
            href="/admin/finance/reports"
            className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-bold backdrop-blur transition hover:bg-white/20"
          >
            📊 مرکز گزارش‌ها
          </Link>
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
          {/* جای جست‌وجو: قبلاً فقط ۱۲ بدهکارِ اول دیده می‌شد و راهی برای
              رسیدن به بقیهٔ دانشجویان نبود (گلایهٔ کاربر). */}
          <form action="/admin/finance" method="GET" className="mb-2 flex gap-1">
            <input
              name="q"
              placeholder="جست‌وجوی دانشجو (نام یا شمارهٔ دانشجویی)"
              className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
            />
            <button type="submit" className="rounded-lg bg-slate-700 px-2.5 py-1 text-xs font-bold text-white hover:bg-slate-800">
              جست‌وجو
            </button>
          </form>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm rt">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-200">
                  <th scope="col" className="p-2">دانشجو</th>
                  <th scope="col" className="p-2">کد</th>
                  <th scope="col" className="p-2">مانده بدهی (ریال)</th>
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
                    <td className="p-2 font-bold text-rose-700">{fa(d.bal)}</td>
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
            <table className="w-full text-right text-sm rt">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-200">
                  <th scope="col" className="p-2">کد رهگیری</th>
                  <th scope="col" className="p-2">دانشجو</th>
                  <th scope="col" className="p-2">فرآیند / گام</th>
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

      {/* تفکیک وصولی بر اساس نوع واریز */}
      <div className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <h2 className="font-bold text-slate-800">تفکیک وصولی بر اساس نوع واریز</h2>
          <span className="text-xs font-bold text-slate-500">
            {fa(methodCount)} تراکنش · جمع {fa(methodTotal)} ریال
          </span>
        </div>

        {/* فیلتر نوع واریز — فرم GET ساده (سازگار با کامپوننت سرور) */}
        <form method="get" className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
          <label htmlFor="depositType" className="text-xs font-bold text-slate-600">فیلتر نوع واریز:</label>
          <select
            id="depositType"
            name="depositType"
            defaultValue={depositTypeFilter ?? ''}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
          >
            <option value="">همهٔ انواع</option>
            {depositTypeOptions.map((o) => (
              <option key={o.dt} value={o.dt}>{o.dt}</option>
            ))}
          </select>
          <button type="submit" className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white transition hover:bg-emerald-700">
            اعمال فیلتر
          </button>
          {depositTypeFilter && (
            <a href="/admin/student-finance" className="text-xs font-bold text-rose-600 hover:underline">حذف فیلتر</a>
          )}
        </form>

        {missingDateCount > 0 ? (
          <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-2xs font-bold leading-5 text-amber-900">
            ⚠️ از پرداخت‌های این بازه، <b className="font-mono">{fa(missingDateCount)}</b> ردیف تاریخِ واریز ندارند
            (بقیه تاریخِ واقعی دارند). نوع واریز از متنِ شرحِ ردیف‌های منتقل‌شده استخراج شده است؛
            جزئیاتِ چک و پرداخت آنلاین برای ردیف‌های قدیمی خالی است.
          </p>
        ) : (
          <p className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-2xs font-bold leading-5 text-emerald-900">
            ✅ همهٔ پرداخت‌های این بازه تاریخِ واقعی واریز دارند.
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm rt">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-200">
                <th scope="col" className="p-2">نوع واریز</th>
                <th scope="col" className="p-2">تعداد تراکنش</th>
                <th scope="col" className="p-2">جمع مبلغ (ریال)</th>
                <th scope="col" className="p-2">سهم</th>
              </tr>
            </thead>
            <tbody>
              {byMethod.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-5 text-center text-slate-400">
                    پرداختی در دفتر مالی ثبت نشده است.
                  </td>
                </tr>
              )}
              {byMethod.map(r => (
                <tr key={r.deposit_type} className="border-t border-slate-100">
                  <td className="p-2 font-semibold text-slate-800">{r.deposit_type}</td>
                  <td className="p-2 text-slate-600">{fa(r.txn_count)}</td>
                  <td className={`p-2 font-bold ${r.total_amount < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {fa(r.total_amount)}
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{ width: `${Math.min(100, Math.abs(pct(r.total_amount)))}%` }}
                        />
                      </div>
                      <span className="text-2xs font-bold text-slate-500" dir="ltr">
                        {pct(r.total_amount).toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {byMethod.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-800">
                  <td className="p-2">جمع کل</td>
                  <td className="p-2">{fa(methodCount)}</td>
                  <td className="p-2">{fa(methodTotal)}</td>
                  <td className="p-2 text-xs text-slate-500">۱۰۰٪</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* آخرین تراکنش‌ها */}
      <div className="card">
        <h2 className="font-bold text-slate-800 mb-3 border-b border-slate-100 pb-2">آخرین تراکنش‌های دفتر مالی</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm rt">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-200">
                <th scope="col" className="p-2">تاریخ</th>
                <th scope="col" className="p-2">دانشجو</th>
                <th scope="col" className="p-2">نوع</th>
                <th scope="col" className="p-2">نوع واریز</th>
                <th scope="col" className="p-2">تاریخ واریز</th>
                <th scope="col" className="p-2">مبلغ (ریال)</th>
                <th scope="col" className="p-2">شرح</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-5 text-center text-slate-400">
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
                    <span className="text-3xs font-mono text-slate-400 mr-1" dir="ltr">{t.studentCode}</span>
                  </td>
                  <td className="p-2 text-xs">{txFa(t.transactionType)}</td>
                  <td className="p-2 text-xs text-slate-600">{t.depositType ?? '—'}</td>
                  <td className="p-2 text-xs text-slate-500">
                    {t.depositDate ? new Date(t.depositDate).toLocaleDateString('fa-IR') : '—'}
                  </td>
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
