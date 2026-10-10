import { requireRole } from '@/lib/auth';
import { getBroadcastFilters } from './actions';
import BroadcastClient from './BroadcastClient';

export const dynamic = 'force-dynamic';

/**
 * ارسال پیام همگانی به مخاطبان فیلتردار — مدیر و کارشناس آموزش.
 * مخاطب: دانشجویان/اساتید یک رشته، گروه، دانشکده یا ورودی خاص.
 * هر ارسال با کد رهگیری یکتا (BROADCAST_*) لاگ می‌شود و سقف ۵۰۰۰ نفر دارد.
 */
export default async function BroadcastPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  const filters = await getBroadcastFilters().catch(() => ({
    faculties: [],
    departments: [],
    majors: [],
    entryYears: [],
  }));

  return (
    <div className="max-w-4xl mx-auto space-y-4 p-4" dir="rtl">
      <div className="card">
        <h1 className="font-black text-base sm:text-lg">📣 ارسال پیام همگانی</h1>
        <p className="mt-1 text-xs leading-6 text-slate-500">
          به دانشجویان یا اساتید یک رشته، گروه، دانشکده یا ورودی خاص پیام بفرستید.
          پیام در همهٔ کانال‌های انتخابی می‌رود و تحویل هر نفر ثبت می‌شود.
        </p>
      </div>
      <BroadcastClient filters={filters} />
    </div>
  );
}
