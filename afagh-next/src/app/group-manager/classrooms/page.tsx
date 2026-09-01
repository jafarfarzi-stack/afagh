import { db } from '@/db';
import { classrooms } from '@/db/schema';
import { requireDepHead } from '@/lib/group-manager';
import { deleteClassroomAction, saveClassroomAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function ClassroomsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  await requireDepHead();
  const rooms = await db.select().from(classrooms).orderBy(classrooms.name);

  return (
    <div className="space-y-4">
      {sp.msg && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">✓ {sp.msg}</p>}
      {sp.err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">⛔ {sp.err}</p>}

      <div className="card space-y-3">
        <h2 className="font-bold">تعریف کلاس جدید (نام کلاس، ظرفیت، ساختمان)</h2>
        <form action={saveClassroomAction} className="flex flex-wrap items-end gap-2 text-xs">
          <label className="text-slate-500">نام<input name="name" required className="input mt-1 !py-1 !px-2" placeholder="مثلاً اتاق ۳۰۵" /></label>
          <label className="text-slate-500">ظرفیت<input name="cap" type="number" min={1} required className="input mt-1 !py-1 !px-2 w-20" dir="ltr" /></label>
          <label className="text-slate-500">نوع
            <select name="roomType" className="input mt-1 !py-1 !px-2">
              <option value="">—</option><option>کلاس درس</option><option>آزمایشگاه</option><option>سالن</option><option>ورزشی</option>
            </select>
          </label>
          <label className="text-slate-500">ساختمان<input name="building" className="input mt-1 !py-1 !px-2" /></label>
          <label className="text-slate-500">ردیف‌ها (نیمکت)<input name="rows" type="number" min={0} className="input mt-1 !py-1 !px-2 w-16" dir="ltr" /></label>
          <label className="text-slate-500">ستون‌ها<input name="cols" type="number" min={0} className="input mt-1 !py-1 !px-2 w-16" dir="ltr" /></label>
          <button className="btn-primary !py-1 !px-3">افزودن کلاس</button>
        </form>
        <p className="text-[11px] text-slate-400">ردیف/ستون برای نقشهٔ حضور و غیاب (ماژول حضور و غیاب) استفاده می‌شود.</p>
      </div>

      <div className="card">
        <h2 className="mb-2 font-bold">کلاس‌ها ({rooms.length})</h2>
        <table className="w-full text-right text-xs">
          <thead><tr className="text-slate-500"><th className="p-2">نام</th><th className="p-2">ظرفیت</th><th className="p-2">نوع</th><th className="p-2">ساختمان</th><th className="p-2">نیمکت (ر×س)</th><th className="p-2"></th></tr></thead>
          <tbody>
            {rooms.map(r => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="p-2" colSpan={5}>
                  <form action={saveClassroomAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <input name="name" defaultValue={r.name} className="input !py-1 !px-2 w-32" />
                    <input name="cap" type="number" min={1} defaultValue={r.capacity} className="input !py-1 !px-2 w-16" dir="ltr" />
                    <input name="roomType" defaultValue={r.roomType ?? ''} className="input !py-1 !px-2 w-24" />
                    <input name="building" defaultValue={r.buildingName ?? ''} className="input !py-1 !px-2 w-28" />
                    <input name="rows" type="number" defaultValue={r.rowsCount ?? ''} className="input !py-1 !px-2 w-14" dir="ltr" />
                    <input name="cols" type="number" defaultValue={r.colsCount ?? ''} className="input !py-1 !px-2 w-14" dir="ltr" />
                    <button className="btn-ghost !py-1 !px-2">ذخیره</button>
                  </form>
                </td>
                <td className="p-2">
                  <form action={deleteClassroomAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="text-red-600 hover:underline">حذف</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
