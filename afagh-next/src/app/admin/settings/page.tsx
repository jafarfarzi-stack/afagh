import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { resolveAllSettings, SETTING_GROUPS } from '@/lib/settings';
import { SECRET_MASK, type SettingView } from '@/lib/settings-shared';
import { getCurrentUniversity } from '@/lib/university-scope';
import { db } from '@/db';
import { classrooms } from '@/db/schema';
import SettingsClient from './SettingsClient';
import { adminSaveClassroomAction, adminDeleteClassroomAction } from './actions';

export const dynamic = 'force-dynamic';

const ROOM_TYPES = ['', 'کلاس درس', 'آزمایشگاه', 'سالن', 'ورزشی'];

export default async function AdminSettingsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireRole(['ADMIN']);
  const sp = await searchParams;
  const all = await resolveAllSettings();

  // مقادیر محرمانه هرگز به مرورگر فرستاده نمی‌شوند — فقط ماسک
  const view: SettingView[] = all.map(s => ({
    key: s.key,
    env: s.env,
    group: s.group,
    label: s.label,
    type: s.type,
    help: s.help,
    envOnly: s.envOnly,
    source: s.source,
    hasEnv: s.hasEnv,
    value: s.type === 'secret' ? (s.value ? SECRET_MASK : '') : s.value,
  }));

  const uni = await getCurrentUniversity().catch(() => null);
  const rooms = uni
    ? await db.select().from(classrooms).where(eq(classrooms.universityId, uni.id)).orderBy(classrooms.name)
    : [];

  return (
    <div className="space-y-8">
      <SettingsClient settings={view} groups={[...SETTING_GROUPS]} />

      {/* ── داده‌های پایه (رکوردها) ── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800">داده‌های پایه (رکوردها)</h2>
          <p className="text-xs text-slate-500">افزودن/ویرایش کلاس‌ها و دیگر موجودیت‌ها — مختص دانشگاه «{uni?.title ?? '—'}».</p>
        </div>

        {sp.msg && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">✓ {sp.msg}</p>}
        {sp.err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">⛔ {sp.err}</p>}

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
          <h3 className="font-bold text-slate-800">کلاس‌ها (اتاق‌های درس قابل برنامه‌ریزی)</h3>
          <form action={adminSaveClassroomAction} className="flex flex-wrap items-end gap-2 text-xs">
            <label className="text-slate-500">نام<input name="name" required className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="مثلاً اتاق ۳۰۵" /></label>
            <label className="text-slate-500">ظرفیت<input name="cap" type="number" min={1} required className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm w-20" dir="ltr" /></label>
            <label className="text-slate-500">نوع
              <select name="roomType" className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm">
                {ROOM_TYPES.map(t => <option key={t} value={t}>{t || '—'}</option>)}
              </select>
            </label>
            <label className="text-slate-500">ساختمان<input name="building" className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
            <label className="text-slate-500">طبقه<input name="floor" className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm w-16" dir="ltr" placeholder="مثلاً ۲" /></label>
            <label className="text-slate-500">ردیف‌ها<input name="rows" type="number" min={0} className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm w-16" dir="ltr" /></label>
            <label className="text-slate-500">ستون‌ها<input name="cols" type="number" min={0} className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm w-16" dir="ltr" /></label>
            <label className="flex items-center gap-1 text-slate-600"><input type="checkbox" name="isActive" value="1" defaultChecked className="w-4 h-4" /> فعال</label>
            <button className="rounded-xl bg-indigo-700 px-5 py-2 text-white font-black text-sm">افزودن کلاس</button>
          </form>
          <p className="text-[11px] text-slate-400">ردیف/ستون برای نقشهٔ حضور و غیاب. کلاس غیرفعال در انتخاب‌گر سردر کلاس نمایش داده نمی‌شود.</p>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="p-2">نام</th><th className="p-2">ظرفیت</th><th className="p-2">نوع</th>
                  <th className="p-2">ساختمان</th><th className="p-2">طبقه</th><th className="p-2">نیمکت (ر×س)</th><th className="p-2">وضعیت</th><th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rooms.map(r => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="p-2" colSpan={7}>
                      <form action={adminSaveClassroomAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={r.id} />
                        <input name="name" defaultValue={r.name} className="border border-slate-300 rounded-lg px-2 py-1 w-32 text-sm" />
                        <input name="cap" type="number" min={1} defaultValue={r.capacity} className="border border-slate-300 rounded-lg px-2 py-1 w-16 text-sm" dir="ltr" />
                        <input name="roomType" defaultValue={r.roomType ?? ''} className="border border-slate-300 rounded-lg px-2 py-1 w-24 text-sm" />
                        <input name="building" defaultValue={r.buildingName ?? ''} className="border border-slate-300 rounded-lg px-2 py-1 w-28 text-sm" />
                        <input name="floor" defaultValue={r.floor ?? ''} className="border border-slate-300 rounded-lg px-2 py-1 w-14 text-sm" dir="ltr" />
                        <input name="rows" type="number" defaultValue={r.rowsCount ?? ''} className="border border-slate-300 rounded-lg px-2 py-1 w-14 text-sm" dir="ltr" />
                        <input name="cols" type="number" defaultValue={r.colsCount ?? ''} className="border border-slate-300 rounded-lg px-2 py-1 w-14 text-sm" dir="ltr" />
                        <select name="isActive" defaultValue={String(r.isActive ?? 1)} className="border border-slate-300 rounded-lg px-2 py-1 w-20 text-sm">
                          <option value="1">فعال</option>
                          <option value="0">غیرفعال</option>
                        </select>
                        <button className="rounded-lg border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50">ذخیره</button>
                      </form>
                    </td>
                    <td className="p-2">
                      <form action={adminDeleteClassroomAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="text-red-600 hover:underline text-xs">حذف</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* موجودیت‌های دیگر (دانشکده‌ها، رشته‌ها، ترم‌ها و…) در ادامه اینجا اضافه می‌شوند. */}
      </section>
    </div>
  );
}
