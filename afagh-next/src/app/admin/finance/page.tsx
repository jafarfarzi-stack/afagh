import Link from 'next/link';
import PrintButton from '@/components/PrintButton';
import { requireRole } from '@/lib/auth';
import { listFinanceStudents, listFinanceFilterOptions } from '@/lib/finance-engine';
import { getCurrentUniversity } from '@/lib/university-scope';
import { getTermScope } from '@/lib/term-scope';
import FinanceTable from './FinanceTable';

export const dynamic = 'force-dynamic';

const FINANCE = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'];

const fa = (n: number) => Number(n || 0).toLocaleString('fa-IR');

type KpiTone = 'slate' | 'rose' | 'violet' | 'indigo' | 'emerald' | 'amber' | 'sky';

const KPI_TONE: Record<KpiTone, { wrap: string; text: string; icon: string }> = {
  slate: { wrap: 'from-slate-50 to-white border-slate-200', text: 'text-slate-800', icon: 'bg-slate-700' },
  rose: { wrap: 'from-rose-50 to-white border-rose-200', text: 'text-rose-700', icon: 'bg-rose-600' },
  violet: { wrap: 'from-violet-50 to-white border-violet-200', text: 'text-violet-700', icon: 'bg-violet-600' },
  indigo: { wrap: 'from-indigo-50 to-white border-indigo-200', text: 'text-indigo-700', icon: 'bg-indigo-600' },
  emerald: { wrap: 'from-emerald-50 to-white border-emerald-200', text: 'text-emerald-700', icon: 'bg-emerald-600' },
  amber: { wrap: 'from-amber-50 to-white border-amber-200', text: 'text-amber-700', icon: 'bg-amber-500' },
  sky: { wrap: 'from-sky-50 to-white border-sky-200', text: 'text-sky-700', icon: 'bg-sky-600' },
};

function Kpi({ icon, label, value, tone, sub }: { icon: string; label: string; value: string; tone: KpiTone; sub?: string }) {
  const t = KPI_TONE[tone];
  return (
    <div className={`rounded-xl border bg-gradient-to-b ${t.wrap} p-3 text-center shadow-sm transition-shadow hover:shadow`}>
      <div className={`mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg text-sm text-white shadow-sm ${t.icon}`}>
        {icon}
      </div>
      <p className={`text-lg font-black leading-tight ${t.text}`}>{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-slate-500">{label}</p>
      {sub && <p className={`mt-0.5 text-[10px] font-bold ${t.text} opacity-80`}>{sub}</p>}
    </div>
  );
}

export default async function FinanceWorklistPage(props: {
  searchParams: Promise<{
    majorId?: string;
    degreeLevelId?: string;
    entryYear?: string;
    q?: string;
    debtors?: string;
  }>;
}) {
  await requireRole(FINANCE);

  const currentUniversity = await getCurrentUniversity();
  const currentUniversityId = currentUniversity?.id ?? null;

  // دامنهٔ نیمسال از سوییچر سربرگ (کوکی afagh_term) می‌آید؛ null = همهٔ نیمسال‌ها
  const termScope = await getTermScope(currentUniversityId);
  const scopeTermId = termScope.selectedId;
  const scopeTermTitle = scopeTermId
    ? (termScope.terms.find((t) => t.id === scopeTermId)?.title ?? `نیمسال ${scopeTermId}`)
    : null;

  const sp = (await props.searchParams) || {};
  const majorId = Number(sp.majorId) || null;
  const degreeLevelId = Number(sp.degreeLevelId) || null;
  const entryYear = Number(sp.entryYear) || null;
  const search = (sp.q || '').trim();
  const onlyDebtors = sp.debtors === '1';

  const [options, students] = await Promise.all([
    listFinanceFilterOptions({ universityId: currentUniversityId }),
    listFinanceStudents({
      majorId, degreeLevelId, entryYear, search, onlyDebtors, limit: 1000,
      universityId: currentUniversityId,
      termId: scopeTermId,
    }),
  ]);

  const totals = students.reduce(
    (acc, s) => ({
      charges: acc.charges + s.charges,
      discounts: acc.discounts + s.discounts,
      sponsorships: acc.sponsorships + s.sponsorships,
      payments: acc.payments + s.payments,
      chequesCleared: acc.chequesCleared + s.chequesCleared,
      loans: acc.loans + s.loans,
      balance: acc.balance + s.balance,
      pendingCheques: acc.pendingCheques + s.pendingCheques,
    }),
    { charges: 0, discounts: 0, sponsorships: 0, payments: 0,
      chequesCleared: 0, loans: 0, balance: 0, pendingCheques: 0 }
  );
  const debtorCount = students.filter((s) => s.balance > 0).length;
  const collected = totals.payments + totals.chequesCleared + totals.loans;
  const netDebtBase = totals.charges - totals.discounts - totals.sponsorships;
  const collectionRate = netDebtBase > 0
    ? Math.min(100, Math.round((collected / netDebtBase) * 100))
    : collected > 0 ? 100 : 0;

  const inputCls =
    'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500';
  const dockCls =
    'rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-bold text-white backdrop-blur transition hover:bg-white/20';

  return (
    <div className="space-y-4" dir="rtl">
      {/* ── سربرگ premium ── */}
      <div className="overflow-hidden rounded-2xl border border-emerald-900/20 bg-gradient-to-l from-emerald-700 via-teal-700 to-slate-900 p-5 text-white shadow-lg print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-black sm:text-xl">🗂️ کارتابل کارشناس مالی</h1>
            <p className="mt-1 text-xs text-emerald-50/90">
              فهرست کامل دانشجویان با ماندهٔ مالی — فیلتر رشته، مقطع و ورودی؛ ورود مستقیم به کارنامهٔ مالی هر دانشجو
            </p>
            {/* دامنهٔ فعال: دانشگاه × نیمسال — تا معلوم باشد اعداد متعلق به کدام بازه‌اند */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-bold">
                🏛️ {currentUniversity ? currentUniversity.title : 'بدون دانشگاه'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-bold">
                📅 {scopeTermTitle ?? 'همهٔ نیمسال‌ها'}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/finance/rules" className={dockCls}>⚙️ قواعد مالی</Link>
            <Link href="/admin/tuition" className={dockCls}>🧮 موتور شهریه</Link>
            <Link href="/admin/finance/student-formula" className={dockCls}>🎯 فرمول ویژه</Link>
            <Link href="/admin/finance/welfare" className={dockCls}>🤝 صندوق رفاه</Link>
            <Link href="/admin/finance/reports" className={dockCls}>📊 مرکز گزارش‌ها</Link>
            <PrintButton />
          </div>
        </div>
      </div>

      {/* ── نوار KPI ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 print:hidden">
        <Kpi icon="👥" label="دانشجوی فهرست‌شده" value={fa(students.length)} tone="slate" sub={`${fa(debtorCount)} بدهکار`} />
        <Kpi icon="💸" label="جمع شهریه (ریال)" value={fa(totals.charges)} tone="rose" />
        <Kpi icon="🎁" label="جمع تخفیف (ریال)" value={fa(totals.discounts)} tone="violet" />
        <Kpi icon="🏛️" label="پوشش بنیادها (ریال)" value={fa(totals.sponsorships)} tone="indigo" />
        <Kpi icon="💵" label="پرداخت نقدی (ریال)" value={fa(totals.payments)} tone="emerald" sub={`وام: ${fa(totals.loans)}`} />
        <Kpi icon="🧾" label="چک وصول‌شده (ریال)" value={fa(totals.chequesCleared)} tone="emerald" sub={`در انتظار: ${fa(totals.pendingCheques)}`} />
        <Kpi icon="⏳" label="چک در انتظار (ریال)" value={fa(totals.pendingCheques)} tone="amber" />
        <Kpi
          icon={totals.balance > 0 ? '🔴' : '🟢'}
          label="ماندهٔ خالص (ریال)"
          value={fa(Math.abs(totals.balance))}
          tone={totals.balance > 0 ? 'rose' : 'emerald'}
          sub={totals.balance > 0 ? 'بدهکار' : totals.balance < 0 ? 'بستانکار' : 'تسویه'}
        />
        {/* نرخ وصول — کارت تمام‌عرض */}
        <div className="col-span-2 rounded-xl border border-indigo-200 bg-gradient-to-b from-indigo-50 to-white p-3 shadow-sm md:col-span-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-black text-indigo-800">📈 نرخ وصول شهریه (پرداخت + چک وصولی + وام نسبت به خالص بدهی)</span>
            <span className="font-black text-indigo-700">{fa(collectionRate)}٪</span>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-teal-400 transition-all"
              style={{ width: `${collectionRate}%` }}
            />
          </div>
          <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-[11px] text-slate-500">
            <span>جمع وصولی: <b className="text-emerald-700">{fa(collected)} ریال</b></span>
            <span>خالص قابل‌وصول: <b className="text-rose-700">{fa(Math.max(0, netDebtBase))} ریال</b></span>
          </div>
        </div>
      </div>

      {/* ── فیلترها ── */}
      <form method="get" className="card print:hidden">
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
          <h2 className="text-xs font-black text-slate-700">🔍 فیلترها</h2>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <input type="checkbox" name="debtors" value="1" defaultChecked={onlyDebtors} className="accent-emerald-700" />
            فقط دانشجویان بدهکار
          </label>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-slate-600">رشته</span>
            <select name="majorId" defaultValue={majorId ?? ''} className={inputCls}>
              <option value="">همهٔ رشته‌ها</option>
              {options.majors.map((m) => (
                <option key={m.id} value={m.id}>{m.title}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-slate-600">مقطع</span>
            <select name="degreeLevelId" defaultValue={degreeLevelId ?? ''} className={inputCls}>
              <option value="">همهٔ مقاطع</option>
              {options.degrees.map((d) => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-slate-600">ورودی</span>
            <select name="entryYear" defaultValue={entryYear ?? ''} className={inputCls}>
              <option value="">همهٔ ورودی‌ها</option>
              {options.entryYears.map((y) => (
                <option key={y} value={y}>{fa(y)}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[11px] font-medium text-slate-600">جستجو (نام، کد ملی، شمارهٔ دانشجویی)</span>
            <input name="q" defaultValue={search} placeholder="جستجو…" className={inputCls} />
          </label>

          <div className="flex items-end gap-2">
            <button type="submit" className="rounded-lg bg-emerald-700 hover:bg-emerald-800 px-3 py-1.5 text-xs font-medium text-white shadow-sm">
              اعمال فیلتر
            </button>
            <Link href="/admin/finance" className="rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700">
              پاک‌کردن
            </Link>
          </div>
        </div>
      </form>

      {/* فهرست دانشجویان */}
      <div className="card">
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
          <h2 className="font-bold text-slate-800">فهرست دانشجویان ({fa(students.length)})</h2>
          <p className="text-[11px] text-slate-500 print:hidden">برای کارنامهٔ مالی روی نام دانشجو کلیک کنید</p>
        </div>

        {students.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-500">دانشجویی با این فیلترها یافت نشد.</p>
        ) : (
          <FinanceTable students={students} />
        )}
      </div>
    </div>
  );
}
