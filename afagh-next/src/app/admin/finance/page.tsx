import Link from 'next/link';
import PrintButton from '@/components/PrintButton';
import { requireRole } from '@/lib/auth';
import { listFinanceStudents, listFinanceFilterOptions, summarizeFinanceStudents } from '@/lib/finance-engine';
import { getCurrentUniversity } from '@/lib/university-scope';
import { getTermScope } from '@/lib/term-scope';
import { faId } from '@/lib/calendar';
import FinanceTable from './FinanceTable';

export const dynamic = 'force-dynamic';

const FINANCE = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'];

const fa = (n: number) => Number(n || 0).toLocaleString('fa-IR');

/** ساخت URL صفحه‌بندی با حفظ پارامترهای فیلتر فعلی (رشته/مقطع/ورودی/جستجو/بدهکار). */
function buildFinanceHref(
  sp: { majorId?: string; degreeLevelId?: string; entryYear?: string; q?: string; debtors?: string; run?: string },
  p: number,
): string {
  const params = new URLSearchParams();
  if (sp.run) params.set('run', sp.run);
  if (sp.majorId) params.set('majorId', sp.majorId);
  if (sp.degreeLevelId) params.set('degreeLevelId', sp.degreeLevelId);
  if (sp.entryYear) params.set('entryYear', sp.entryYear);
  if (sp.q) params.set('q', sp.q);
  if (sp.debtors) params.set('debtors', sp.debtors);
  if (p > 1) params.set('page', String(p));
  const qs = params.toString();
  return qs ? `/admin/finance?${qs}` : '/admin/finance';
}

type KpiTone = 'slate' | 'rose' | 'violet' | 'indigo' | 'emerald' | 'amber' | 'sky';

const KPI_TONE: Record<KpiTone, { tile: string; text: string }> = {
  slate: { tile: 'bg-slate-50 text-slate-600 ring-slate-200/70', text: 'text-slate-700' },
  rose: { tile: 'bg-rose-50 text-rose-600 ring-rose-200/70', text: 'text-rose-700' },
  violet: { tile: 'bg-violet-50 text-violet-600 ring-violet-200/70', text: 'text-violet-700' },
  indigo: { tile: 'bg-indigo-50 text-indigo-600 ring-indigo-200/70', text: 'text-indigo-700' },
  emerald: { tile: 'bg-emerald-50 text-emerald-600 ring-emerald-200/70', text: 'text-emerald-700' },
  amber: { tile: 'bg-amber-50 text-amber-600 ring-amber-200/70', text: 'text-amber-700' },
  sky: { tile: 'bg-sky-50 text-sky-600 ring-sky-200/70', text: 'text-sky-700' },
};

/**
 * مقدارِ بلند را برای جا شدن در کارتِ KPI فشرده می‌کند (۱۲۳٬۴۵۶٬۷۸۹٬۰۱۲ → ۱۲۳ میلیارد).
 * عددِ دقیق همیشه در `title` می‌ماند، پس هیچ داده‌ای با کوتاه‌سازی از دست نمی‌رود.
 */
function compactFa(value: string): string {
  const latin = value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^\d]/g, '');
  const n = Number(latin);
  if (!n) return value;
  return new Intl.NumberFormat('fa-IR', { notation: 'compact' })
    .format(n)
    .replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

function Kpi({ icon, label, value, tone, sub }: { icon: string; label: string; value: string; tone: KpiTone; sub?: string }) {
  const t = KPI_TONE[tone];
  // واحد فقط برای کارت‌های ریالی؛ کارتِ «تعداد دانشجو» واحدِ نفر می‌گیرد.
  const unit = label.includes('ریال') ? 'ریال' : 'نفر';
  const shown = value.length > 12 ? compactFa(value) : value;
  return (
    <div
      title={`${label}: ${value} ${unit}`}
      className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-3 text-start shadow-e1 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-white/80"
    >
      <span
        aria-hidden
        className={`absolute end-3 top-3 flex h-8 w-8 items-center justify-center rounded-xl text-sm shadow-[inset_0_1px_0_rgba(255,255,255,.7)] ring-1 ring-inset ${t.tile}`}
      >
        {icon}
      </span>
      <p className="min-h-9 pe-11 text-2xs font-bold text-slate-600">{label}</p>
      <p className="mt-1 flex items-baseline gap-1 text-2xl font-black leading-none tracking-tight text-slate-900 tabular-nums sm:text-[1.75rem]">
        <span className="min-w-0 truncate" title={`${value} ${unit}`}>{shown}</span>
        <span className="text-2xs font-bold text-slate-500">{unit}</span>
      </p>
      {sub && <p className={`mt-1 text-3xs font-bold ${t.text}`}>{sub}</p>}
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
    all?: string;
    page?: string;
    run?: string;
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
  const run = sp.run === '1';
  const majorId = Number(sp.majorId) || null;
  const degreeLevelId = Number(sp.degreeLevelId) || null;
  const entryYear = Number(sp.entryYear) || null;
  const search = (sp.q || '').trim();
  const onlyDebtors = sp.debtors === '1';
  // پیش‌فرض فقط دانشجویان فعال؛ با ?all=1 همهٔ وضعیت‌ها (فارغ‌التحصیل/انصرافی…)
  const statusScope = sp.all === '1' || search !== '' ? 'ALL' : 'ACTIVE';
  // جستجوی صریح کد/نام هم فارغالتحصیلها را میگنجاند؛ داشبورد بدون کوئری ACTIVE میماند.
  const page = Math.max(1, Number(sp.page) || 1);
  // ⚡ ۵۰ ردیف در هر صفحه (پیشتر ۱۰۰): `FinanceTable` یک کامپوننت کلاینت است،
  //    پس ردیفها هم بهعنوان props در payloadـ RSC سریال میشوند و هم **دوبار** در
  //    HTML رندر (جدول دسکتاپ `hidden md:block` + کارتهای موبایل). با ۱۰۰ ردیف
  //    صفحه ~۶۰۷KB خام و ۱۶۸ boundary استریم داشت و تا دکمهها کامل بیایند ~۱
  //    ثانیه طول میکشید. نصفکردن سقف، حجم و تعداد boundaryها را نصف میکند بیآنکه
  //    چیزی از قابلیتها کم شود — صفحهبندی و آمار سربرگ (روی کل داده) سر جایشاناند.
  const pageSize = 50;

  // کارتابل صفحهبندی شده است:
  //   • students → فقط صفحهٔ جاری (۵۰ ردیف) — بار شبکه/پارس ~۱۰برابر کمتر
  //   • summary  → جمع کل روی همهٔ دانشجویانِ فیلتر‌شده (نوار KPI همچنان درست)
  //   • count    → تعداد کل برای نوار صفحه‌بندی
  const emptySummary = {
    studentCount: 0, debtorCount: 0, charges: 0, discounts: 0, sponsorships: 0,
    payments: 0, loans: 0, chequesCleared: 0, pendingCheques: 0, balance: 0,
  };
  const [options, students, summary] = run
    ? await Promise.all([
        listFinanceFilterOptions({ universityId: currentUniversityId }),
        listFinanceStudents({
          majorId, degreeLevelId, entryYear, search, onlyDebtors, status: statusScope,
          limit: pageSize, offset: (page - 1) * pageSize,
          universityId: currentUniversityId,
          termId: scopeTermId,
        }),
        summarizeFinanceStudents({
          majorId, degreeLevelId, entryYear, search, onlyDebtors, status: statusScope,
          universityId: currentUniversityId,
          termId: scopeTermId,
        }),
      ])
    : [await listFinanceFilterOptions({ universityId: currentUniversityId }), [], emptySummary];
  // تعداد کل از همان اسکن خلاصه (COUNT(*) OVER) — کوئری شمارش جدا حذف شد
  const count = summary.studentCount;

  const collected = summary.payments + summary.chequesCleared + summary.loans;
  const netDebtBase = summary.charges - summary.discounts - summary.sponsorships;
  const collectionRate = netDebtBase > 0
    ? Math.min(100, Math.round((collected / netDebtBase) * 100))
    : collected > 0 ? 100 : 0;

  const pageCount = Math.max(1, Math.ceil(count / pageSize));
  const rangeFrom = (page - 1) * pageSize + 1;
  const rangeTo = Math.min(page * pageSize, count);

  const inputCls =
    'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500';
  // تنها CTA سربرگ: بقیهٔ عملیات مالی قبلاً هم در `/admin/c/fin` (کاشیهای دستهٔ
  // مالی) موجوداند و تکرارشان در اینجا فقط سربرگ را شلوغ میکرد. `prefetch=false`
  // هم از رندر بیمورد RSC در پسزمینه جلوگیری میکند.
  const toolsCtaCls =
    'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/30 bg-white/15 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-white/25';

  return (
    <div className="space-y-4" dir="rtl">
      {/* ── سربرگ premium ── */}
      <div className="overflow-hidden rounded-2xl border border-emerald-900/20 bg-gradient-to-l from-emerald-700 via-teal-700 to-slate-900 p-5 text-white shadow-lg print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-black sm:text-xl">🗂️ کارتابل کارشناس مالی</h1>
            <p className="mt-1 text-xs text-emerald-50/90">
              فهرست کامل دانشجویان با ماندهٔ مالی — فیلتر رشته، مقطع و ورودی؛ ورود مستقیم به کارنامهٔ مالی هر دانشجو
            </p>
            {/* دامنهٔ فعال: دانشگاه × نیمسال — تا معلوم باشد اعداد متعلق به کدام بازه‌اند */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-2xs font-bold">
                🏛️ {currentUniversity ? currentUniversity.title : 'بدون دانشگاه'}
              </span>
              <span className="hidden">{scopeTermTitle ?? ''}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link prefetch={false} href="/admin/c/fin" className={toolsCtaCls}>
              🧰 ابزارهای مالی
            </Link>
          </div>
        </div>
      </div>

      {/* ── ابزارهای سریع مالی ──
          پیش‌تر این ابزارها فقط پشتِ صفحهٔ /admin/c/fin بودند و کارشناس مالی
          داخلِ کارتابل هیچ دسترسی مستقیمی نداشت (گلایهٔ کاربر: «فقط کارنامهٔ
          مالی داره»). حالا همان‌جا یک ردیف چسبیده به سربرگ نشسته است. */}
      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm print:hidden">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="px-1 text-2xs font-black text-slate-500">دسترسی سریع:</span>
          {[
            { href: '/admin/student-finance', icon: '📒', label: 'دفتر مالی دانشجویان' },
            { href: '/admin/tuition', icon: '⚙️', label: 'موتور شهریه' },
            { href: '/admin/course-finance', icon: '📚', label: 'نوع درس مالی' },
            { href: '/admin/finance/rules', icon: '🧮', label: 'قواعد مالی' },
            { href: '/admin/finance/course-tuition', icon: '🎯', label: 'شهریهٔ ویژهٔ درس' },
            { href: '/admin/finance/reconciliation', icon: '🧩', label: 'مغایرت حساب' },
            { href: '/admin/finance/reports', icon: '📊', label: 'گزارش‌ها' },
            { href: '/admin/finance/reports/faculty-financial', icon: '🏢', label: 'گزارش مالی دانشکده ها' },
            { href: '/admin/finance/reports/student-statement', icon: '🧾', label: 'صورت حساب' },
            { href: '/admin/finance/pos', icon: '💳', label: 'POS' },
          ].map((l) => (
            <Link
              key={l.href}
              prefetch={false}
              href={l.href}
              className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-2xs font-bold text-slate-700 transition hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-800"
            >
              <span>{l.icon}</span>
              {l.label}
            </Link>
          ))}
        </div>
      </div>

      {!run ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center print:hidden">
          <p className="text-sm font-bold text-slate-700">برای نمایش کارتابل مالی، فیلترها را تنظیم کنید و «نمایش» را بزنید.</p>
          <p className="mt-1 text-xs text-slate-500">برای سرعت بیشتر، دادهٔ سنگین فقط پس از درخواست شما بارگذاری می‌شود.</p>
        </div>
      ) : (
        /* ── نوار KPI ── */
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 print:hidden">
          <Kpi icon="👥" label="دانشجوی فیلتر‌شده" value={fa(count)} tone="slate" sub={`${fa(summary.debtorCount)} بدهکار`} />
          <Kpi icon="💸" label="شهریهٔ ناخالص (ریال)" value={fa(summary.charges)} tone="rose" />
          <Kpi icon="🎁" label="جمع تخفیف (ریال)" value={fa(summary.discounts)} tone="violet" />
          <Kpi icon="🏛️" label="پوشش بنیادها (ریال)" value={fa(summary.sponsorships)} tone="indigo" />
          <Kpi icon="💵" label="پرداخت نقدی (ریال)" value={fa(summary.payments)} tone="emerald" sub={`وام: ${fa(summary.loans)}`} />
          <Kpi icon="🧾" label="چک وصول‌شده (ریال)" value={fa(summary.chequesCleared)} tone="emerald" sub={`در انتظار: ${fa(summary.pendingCheques)}`} />
          <Kpi icon="⏳" label="چک در انتظار (ریال)" value={fa(summary.pendingCheques)} tone="amber" />
          <Kpi
            icon={summary.balance > 0 ? '🔴' : '🟢'}
            label="ماندهٔ بدهی (ریال)"
            value={fa(Math.abs(summary.balance))}
            tone={summary.balance > 0 ? 'rose' : 'emerald'}
            sub={summary.balance > 0 ? 'بدهکار' : summary.balance < 0 ? 'بستانکار' : 'تسویه'}
          />
          {/* نرخ وصول — کارت تمام‌عرض */}
          <div className="col-span-2 rounded-2xl border border-indigo-200/80 bg-gradient-to-b from-indigo-50 to-white p-3 shadow-e1 md:col-span-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-black text-indigo-800">📈 نرخ وصول شهریه (پرداخت + چک وصولی + وام نسبت به شهریهٔ پس از تخفیف)</span>
              <span className="text-3xl font-black tabular-nums text-indigo-700">{fa(collectionRate)}٪</span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200/70">
              <div
                className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-teal-400"
                style={{ width: `${collectionRate}%` }}
              />
            </div>
            <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-2xs text-slate-500">
              <span>جمع وصولی: <b className="text-emerald-700">{fa(collected)} ریال</b></span>
              <span>خالص شهریه پس از تخفیف: <b className="text-rose-700">{fa(Math.max(0, netDebtBase))} ریال</b></span>
            </div>
          </div>
        </div>
      )}

      {/* ── فیلترها ── */}
      <form method="get" className="card print:hidden">
        <input type="hidden" name="run" value="1" />
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
          <h2 className="text-xs font-black text-slate-700">🔍 فیلترها</h2>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <input type="checkbox" name="debtors" value="1" defaultChecked={onlyDebtors} className="accent-emerald-700" />
              فقط دانشجویان بدهکار
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700" title="پیش‌فرض فقط دانشجویان در حال تحصیل نمایش داده می‌شوند">
              <input type="checkbox" name="all" value="1" defaultChecked={statusScope === 'ALL'} className="accent-emerald-700" />
              همهٔ وضعیت‌ها
            </label>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-medium text-slate-600">رشته</span>
            <select name="majorId" defaultValue={majorId ?? ''} className={inputCls}>
              <option value="">همهٔ رشته‌ها</option>
              {options.majors.map((m) => (
                <option key={m.id} value={m.id}>{m.title}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-2xs font-medium text-slate-600">مقطع</span>
            <select name="degreeLevelId" defaultValue={degreeLevelId ?? ''} className={inputCls}>
              <option value="">همهٔ مقاطع</option>
              {options.degrees.map((d) => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-2xs font-medium text-slate-600">ورودی</span>
            <select name="entryYear" defaultValue={entryYear ?? ''} className={inputCls}>
              <option value="">همهٔ ورودی‌ها</option>
              {options.entryYears.map((y) => (
                <option key={y} value={y}>{faId(y)}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-2xs font-medium text-slate-600">جستجو (نام، کد ملی، شمارهٔ دانشجویی)</span>
            <input name="q" defaultValue={search} placeholder="جستجو…" className={inputCls} />
          </label>

          <div className="flex items-end gap-2">
            <button type="submit" className="rounded-lg bg-emerald-700 hover:bg-emerald-800 px-3 py-1.5 text-xs font-medium text-white shadow-sm">
              نمایش
            </button>
            <Link prefetch={false} href="/admin/finance" className="rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700">
              پاک‌کردن
            </Link>
          </div>
        </div>
      </form>

      {run && (
        <>
          {/* فهرست دانشجویان — تنها دکمهٔ باقیمانده (چاپ) در بالای جدول قرار میگیرد */}
          <div className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <div className="min-w-0">
            <h2 className="font-bold text-slate-800">
              فهرست دانشجویان ({fa(students.length)} از {fa(count)})
            </h2>
            <p className="mt-0.5 text-2xs text-slate-500 print:hidden">
              برای کارنامهٔ مالی روی نام دانشجو کلیک کنید
            </p>
          </div>
          <PrintButton />
        </div>

        {students.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-xs text-slate-500">دانشجویی با این فیلترها یافت نشد.</p>
            {search !== '' && sp.all !== '1' && (
              <p className="mt-1 text-2xs text-amber-700">
                اگر دانشجو فارغالتحصیل/غیرفعال است، گزینهٔ «همهٔ وضعیتها» را فعال کنید.
              </p>
            )}
          </div>
        ) : (
          <FinanceTable students={students} />
        )}

        {/* نوار صفحه‌بندی */}
        {count > pageSize && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 print:hidden">
            <span className="text-2xs text-slate-500">
              صفحهٔ {fa(page)} از {fa(pageCount)} - نمایش {fa(rangeFrom)} تا {fa(rangeTo)}
            </span>
            <div className="flex items-center gap-2">
              <Link prefetch={false}
                href={buildFinanceHref(sp, page - 1)}
                aria-disabled={page <= 1}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  page <= 1
                    ? 'pointer-events-none bg-slate-100 text-slate-400'
                    : 'bg-emerald-700 text-white hover:bg-emerald-800'
                }`}
              >
                › قبلی
              </Link>
              <Link prefetch={false}
                href={buildFinanceHref(sp, page + 1)}
                aria-disabled={page >= pageCount}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  page >= pageCount
                    ? 'pointer-events-none bg-slate-100 text-slate-400'
                    : 'bg-emerald-700 text-white hover:bg-emerald-800'
                }`}
              >
                بعدی ‹
              </Link>
            </div>
          </div>
        )}
          </div>
        </>
      )}
    </div>
  );
}
