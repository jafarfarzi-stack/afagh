import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { getFilterOptions, allowedReportKinds } from '@/app/admin/reports/actions';
import { ALL_REPORT_KINDS } from '@/app/admin/reports/report-helpers';
import { getCurrentUniversity } from '@/lib/university-scope';
import ReportsClient from '@/app/admin/reports/ReportsClient';

export const dynamic = 'force-dynamic';

/** کاشی‌های دسترسی سریع به میزهای تخصصی مالی — جدا از گزارش‌های اجرایی */
const DOCKS: { href: string; icon: string; title: string; desc: string; tone: string }[] = [
  // ⚠ کاشی‌های «گزارش» اینجا حذف شدند: همان ۱۴ گزارش، کارتِ اجراییِ خودشان را
  //    در ReportsClient پایین همین صفحه دارند و تکرارشان کاربر را سردرگم
  //    می‌کرد (دو کاشی با یک مقصد). این آرایه فقط ابزارها/میزهای تخصصی را
  //    نگه می‌دارد؛ گزارش‌ها از کاتالوگ پایین اجرا می‌شوند.
  // ── ورودِ دادهٔ پایه — بدون این، گزارش‌های بالا خالی می‌مانند ──
  { href: '/admin/finance/base-data', icon: '🗂️', title: 'دادهٔ پایهٔ مالی', desc: 'بودجه، پیمانکار، هزینه، VAT، انبار و پروندهٔ حقوقی', tone: 'from-fuchsia-500/15 to-fuchsia-50/60 border-fuchsia-300 hover:border-fuchsia-500' },
  { href: '/admin/tuition', icon: '🧮', title: 'موتور شهریه', desc: 'تعرفه، ضریب و محاسبهٔ شهریه', tone: 'from-slate-500/15 to-slate-50/60 border-slate-300 hover:border-slate-500' },
  { href: '/admin/finance/rules', icon: '⚙️', title: 'قواعد مالی', desc: 'انواع تخفیف، بنیادها و فرمول‌ها', tone: 'from-slate-500/15 to-slate-50/60 border-slate-300 hover:border-slate-500' },
  { href: '/admin/finance/reports/faculty-financial', icon: '🏢', title: 'گزارش مالی دانشکده ها (شکل سما)', desc: 'چاپ دقیق با ستونهای شهریه، تخفیف، پرداختی و مانده', tone: 'from-indigo-500/15 to-indigo-50/60 border-indigo-300 hover:border-indigo-500' },
  { href: '/admin/finance/reconciliation', icon: '🧩', title: 'گزارش مغایرت حساب', desc: 'ثبت تکراری، پرداخت بدون فیش، مبلغ نامعتبر، ترم بدون شهریه', tone: 'from-rose-500/15 to-rose-50/60 border-rose-300 hover:border-rose-500' },
  { href: '/admin/finance/student-formula', icon: '🎯', title: 'فرمول ویژهٔ دانشجو', desc: 'استثناهای شهریهٔ دانشجویی', tone: 'from-amber-500/15 to-amber-50/60 border-amber-300 hover:border-amber-500' },
  { href: '/admin/finance/welfare', icon: '🤝', title: 'صندوق رفاه', desc: 'وام‌ها و پوشش‌های رفاهی', tone: 'from-sky-500/15 to-sky-50/60 border-sky-300 hover:border-sky-500' },
  { href: '/admin/finance/pos', icon: '🏧', title: 'ترمینال‌های POS', desc: 'دستگاه‌ها و تراکنش‌ها', tone: 'from-teal-500/15 to-teal-50/60 border-teal-300 hover:border-teal-500' },
  { href: '/admin/student-finance', icon: '💳', title: 'امور مالی دانشجویان', desc: 'ثبت پرداخت، چک و تخفیف', tone: 'from-rose-500/15 to-rose-50/60 border-rose-300 hover:border-rose-500' },
];

export default async function AdminFinanceReportsPage(props: {
  searchParams: Promise<{ kind?: string; term?: string }>;
}) {
  await requireRole(['ADMIN', 'FINANCE_EXPERT', 'FINANCE', 'CASHIER']);
  const sp = await props.searchParams;
  const initialKind = sp?.kind && ALL_REPORT_KINDS.includes(sp.kind) ? sp.kind : undefined;

  const currentUniversity = await getCurrentUniversity();
  const currentUniversityId = currentUniversity?.id ?? null;

  const opts = await getFilterOptions({ universityId: currentUniversityId, signerForm: 'finance-report' });
  const allowed = await allowedReportKinds(ALL_REPORT_KINDS);

  return (
    <div className="space-y-4" dir="rtl">
      {/* ── سربرگ premium ── */}
      <div className="overflow-hidden rounded-2xl border border-emerald-900/20 bg-gradient-to-l from-emerald-700 via-teal-700 to-slate-900 p-5 text-white shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-black sm:text-xl">💰 مرکز گزارش‌های مالی (سما)</h1>
            <p className="mt-1 text-xs text-emerald-50/90">
              شهریه، تعرفه، صورت‌حساب، کارتابل مالی، حق‌التدریس و BI مالی — همه صفحه‌بندی‌شده با خروجی Excel
            </p>
            {currentUniversity && (
              <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-2xs font-bold">
                🏛️ {currentUniversity.title}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link prefetch={false} href="/admin/finance" className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-bold backdrop-blur transition hover:bg-white/20">
              🗂️ کارتابل مالی
            </Link>
            <Link prefetch={false} href="/admin/finance/reports/student-statement" className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-bold backdrop-blur transition hover:bg-white/20">
              📄 کارنامهٔ مالی دانشجو
            </Link>
          </div>
        </div>
      </div>

      {/* ── چهار گزارش همسان با سام — کنارهم، دسترسی مستقیم ── */}
      <div className="rounded-2xl border border-emerald-300/70 bg-gradient-to-l from-emerald-50 to-white p-3 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm">🎯</span>
          <h2 className="text-xs font-black text-emerald-900">گزارشهای همسان با سام (زنده)</h2>
          <span className="text-3xs font-bold text-emerald-700">چاپ و اعداد مطابق فرمهای رسمی سام</span>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            { href: '/admin/finance/reports/faculty-financial', icon: '🏢', title: 'مالی دانشکدهها', code: 'SumDaneshkadehReport' },
            { href: '/admin/finance/reports?kind=semester-detail', icon: '🧾', title: 'تفصیلی نیمسال', code: 'fqTrDaTe2' },
            { href: '/admin/finance/reports?kind=daily-journal', icon: '📅', title: 'دفتر روزنامه', code: 'daily-journal' },
            { href: '/admin/finance/reports?kind=cash-flow', icon: '💧', title: 'جریان نقدی', code: 'cash-flow' },
          ].map((b) => (
            <Link
              prefetch={false}
              key={b.href}
              href={b.href}
              className="group flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-500 hover:shadow-md"
            >
              <span className="text-lg">{b.icon}</span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-black text-slate-800 group-hover:text-emerald-800">{b.title}</span>
                <span className="block truncate text-3xs font-bold text-slate-500" dir="ltr">{b.code}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* ── کاشی‌های دسترسی سریع به میزهای تخصصی ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {DOCKS.map((d) => (
          <Link prefetch={false}
            key={d.href}
            href={d.href}
            className={`group rounded-xl border bg-gradient-to-b p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${d.tone}`}
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">{d.icon}</span>
              <span className="text-[12px] font-black text-slate-800 group-hover:text-slate-950">{d.title}</span>
            </div>
            <p className="mt-1 text-3xs leading-4 text-slate-500">{d.desc}</p>
          </Link>
        ))}
      </div>

      {/* ── گزارش‌های اجرایی ── */}
      <ReportsClient
        opts={opts}
        initialUniversityId={currentUniversityId ?? 0}
        allowedKinds={allowed}
        scope="finance"
        initialKind={initialKind}
        initialTerm={sp?.term}
      />
    </div>
  );
}
