import { requireDepHead } from '@/lib/group-manager';
import { bypassInboxForManager } from '@/lib/bypass-requests';
import BypassInboxClient from './BypassInboxClient';

export const dynamic = 'force-dynamic';

export default async function GroupManagerBypassPage() {
  const { depts, dept } = await requireDepHead();
  const rows = await bypassInboxForManager(depts.map(d => d.id));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-black text-slate-900">درخواست‌های بدون رعایت پیش‌نیاز / تداخل امتحانی</h1>
        <p className="mt-1 text-xs leading-6 text-slate-600">
          دانشجو برای گرفتن درسی که پیش‌نیاز آن را نگذرانده یا تداخل امتحانی دارد، درخواست ثبت می‌کند.
          تا تصمیم شما صندلی درس برای او رزرو می‌ماند. اگر تا پایان مهلت تصمیمی نگیرید، درخواست به
          کارشناس آموزش رشته ارجاع می‌شود و پس از آن هم می‌توانید تصمیم بگیرید؛ هر تصمیمی زودتر ثبت شود،
          پرونده را می‌بندد.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          گروه فعال: <span className="font-bold text-slate-700">{dept.name}</span>
          {depts.length > 1 ? ' — درخواست‌های همهٔ گروه‌های تحت مدیریت شما نمایش داده می‌شود.' : ''}
        </p>
      </div>

      <BypassInboxClient rows={rows} />
    </div>
  );
}
