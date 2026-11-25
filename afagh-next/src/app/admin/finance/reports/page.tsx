import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { getFilterOptions, allowedReportKinds } from '@/app/admin/reports/actions';
import { ALL_REPORT_KINDS } from '@/app/admin/reports/report-helpers';
import { getCurrentUniversity } from '@/lib/university-scope';
import ReportsClient from '@/app/admin/reports/ReportsClient';

export const dynamic = 'force-dynamic';

const TOOLS = [
  { href: '/admin/finance/base-data', title: 'دادهٔ پایهٔ مالی' },
  { href: '/admin/tuition', title: 'موتور شهریه' },
  { href: '/admin/finance/rules', title: 'قواعد مالی' },
  { href: '/admin/finance/reconciliation', title: 'مغایرت حساب' },
  { href: '/admin/finance/student-formula', title: 'فرمول ویژهٔ دانشجو' },
  { href: '/admin/finance/welfare', title: 'صندوق رفاه' },
  { href: '/admin/finance/pos', title: 'ترمینال‌های POS' },
  { href: '/admin/student-finance', title: 'امور مالی دانشجویان' },
] as const;

const AUDIT_REPORTS = [
  { href: '/admin/reports/semester-major-detail?scope=finance&auto=1', title: 'گزارش مالی دانشکده و رشته', desc: 'تجمیع به تفکیک رشته و نیمسال ورود' },
  { href: '/admin/finance/reports/faculty-financial', title: 'گزارش مالی دانشکده‌ها', desc: 'تجمیع به تفکیک دانشکده و ترم ورود' },
  { href: '/admin/reports/semester-detail?scope=finance&auto=1', title: 'گزارش تفصیلی دانشجویان نیمسال', desc: 'ریز مالی هر دانشجو در نیمسال' },
  { href: '/admin/finance/reports/semester-financial', title: 'گزارش مالی نیمسال', desc: 'تجمیع به تفکیک نیمسال ورود' },
] as const;

export default async function AdminFinanceReportsPage(props: {
  searchParams: Promise<{ kind?: string; term?: string; auto?: string }>;
}) {
  await requireRole(['ADMIN', 'FINANCE_EXPERT', 'FINANCE', 'CASHIER']);
  const sp = await props.searchParams;
  const initialKind = sp?.kind && ALL_REPORT_KINDS.includes(sp.kind) ? sp.kind : undefined;
  const initialAuto = sp?.auto === '1';

  const currentUniversity = await getCurrentUniversity();
  const currentUniversityId = currentUniversity?.id ?? null;

  const opts = await getFilterOptions({ universityId: currentUniversityId, signerForm: 'finance-report' });
  const allowed = await allowedReportKinds(ALL_REPORT_KINDS);

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-700">
        <div>
          <p className="text-[11px] font-bold tracking-wide text-slate-500 dark:text-slate-400">مالی</p>
          <h1 className="mt-1 text-xl font-black text-slate-900 dark:text-slate-100">مرکز گزارش‌های مالی</h1>
          {currentUniversity && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{currentUniversity.title}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link prefetch={false} href="/admin/finance" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
            کارتابل مالی
          </Link>
          <Link prefetch={false} href="/admin/finance/reports/student-statement" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
            کارنامهٔ مالی دانشجو
          </Link>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">گزارش‌های حسابرسی</h2>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">۴ گزارش اصلی</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {AUDIT_REPORTS.map((r) => (
            <Link
              prefetch={false}
              key={r.href}
              href={r.href}
              className="group rounded-xl border border-slate-200 bg-slate-50/40 px-4 py-3 transition hover:border-emerald-400 hover:bg-white hover:shadow-sm dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-emerald-500 dark:hover:bg-slate-800"
            >
              <div className="text-[13px] font-black text-slate-800 group-hover:text-emerald-800 dark:text-slate-100 dark:group-hover:text-emerald-300">{r.title}</div>
              <div className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">{r.desc}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-black text-slate-900 dark:text-slate-100">ابزارها</h2>
        <div className="flex flex-wrap gap-2">
          {TOOLS.map((t) => (
            <Link
              prefetch={false}
              key={t.href}
              href={t.href}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {t.title}
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-black text-slate-900 dark:text-slate-100">همهٔ گزارش‌ها</h2>
        <ReportsClient
          opts={opts}
          initialUniversityId={currentUniversityId ?? 0}
          allowedKinds={allowed}
          scope="finance"
          initialKind={initialKind}
          initialAuto={initialAuto}
          initialTerm={sp?.term}
          singleReport={!!initialKind}
        />
      </section>
    </div>
  );
}
