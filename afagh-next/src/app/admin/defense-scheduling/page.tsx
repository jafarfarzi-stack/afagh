import { requireRole } from '@/lib/auth';
import { boardAction } from './actions';
import DefenseSchedulingClient from './DefenseSchedulingClient';

export const dynamic = 'force-dynamic';

export default async function AdminDefenseSchedulingPage() {
  try {
  // هم‌راستا با `BOARD_ROLES` در ./actions و با `roles` ماژول در @/lib/admin-modules:
  // کارشناسان کل میز را می‌بینند، استاد راهنما و مدیر گروه فقط پروندهٔ خودشان را.
  await requireRole(['ADMIN', 'EDU_EXPERT', 'GRADUATION_EXPERT', 'DEP_HEAD', 'PROFESSOR']);

  const t0 = Date.now();
  console.error('[diag-defense] before boardAction');
  const res = await boardAction();
  console.error('[diag-defense] after boardAction', Date.now()-t0, res.ok);
  if (!res.ok) return <div className="card p-6 text-center text-rose-700 font-bold">{res.error}</div>;

  return (
    <div className="space-y-4">
      <div className="card !p-4 bg-white border-slate-300 shadow-sm flex items-center justify-between">
        <div>
          <h1 className="text-base font-extrabold text-slate-900">🛡️ برنامه‌ریزی و ثبت نتیجهٔ دفاع پایان‌نامه</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            تأیید پروپوزال و بارگذاری ایرانداک، تعیین وقت دفاع و ثبت نتیجه — اتاق و هیأت داوران به‌صورت خودکار از استخر داوران همان رشته تخصیص می‌یابد.
          </p>
        </div>
      </div>
      <DefenseSchedulingClient initial={res.board} />
    </div>
  );
  } catch (e) {
    const msg = e instanceof Error ? (e.message + '\n' + (e.stack || '')) : String(e);
    return <pre className="card p-4 text-xs text-rose-700 whitespace-pre-wrap" dir="ltr">{msg}</pre>;
  }
}