import { requireRole } from '@/lib/auth';
import { getLockState } from '@/lib/finance-time-control';
import TimeControlClient from './TimeControlClient';

export const dynamic = 'force-dynamic';

const FINANCE = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'];

/**
 * صفحهٔ «کنترل زمانی دقیق ثبت مالی»: تعیین پنجرهٔ دورهٔ مالی باز
 * (opens_at … closes_at) و قفل دستی. اِعمال قفل در ثبت‌های مالی با
 * assertEntryAllowed() در اکشن‌های مالی انجام می‌شود.
 */
export default async function FinanceTimeControlPage() {
  await requireRole(FINANCE);
  const state = await getLockState();

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-extrabold text-slate-800 text-base sm:text-lg">🔒 کنترل زمانی دقیق ثبت مالی</h1>
          <p className="text-xs text-slate-500 mt-1">
            ثبت مالی فقط داخل پنجرهٔ دورهٔ مالی باز و بدون قفل مجاز است؛ خارج از آن، همهٔ اکشن‌های مالی با پیام فارسی رد می‌شوند.
          </p>
        </div>
        <a href="/admin/finance" className="rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700">
          بازگشت به کارتابل
        </a>
      </div>

      <TimeControlClient initial={state} />
    </div>
  );
}
