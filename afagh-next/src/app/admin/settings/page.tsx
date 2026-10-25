import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { resolveAllSettings, SETTING_GROUPS } from '@/lib/settings';
import { SECRET_MASK, type SettingView } from '@/lib/settings-shared';
import { getCurrentUniversity } from '@/lib/university-scope';
import { db } from '@/db';
import { classrooms, faculties } from '@/db/schema';
import SettingsClient from './SettingsClient';
import ClassroomManager from './ClassroomManager';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  await requireRole(['ADMIN']);
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
    default: s.default,
    options: s.options,
  }));

  const uni = await getCurrentUniversity().catch(() => null);
  const rooms = uni
    ? await db.select().from(classrooms).where(eq(classrooms.universityId, uni.id)).orderBy(classrooms.name)
    : [];
  /**
   * دانشکده‌های همان دانشگاهِ فعال (سوییچ دانشگاه).
   *
   * چرا «دانشکده» و نه «ساختمان»؟ ساختمان در سامانه تعریف ندارد و ورودیِ آزاد
   * بود؛ نتیجه اینکه هر کس یک نام می‌نوشت («ساختمان ۲»، «ابوریحان»، «۲»…) و
   * داده قابل گزارش‌گیری نبود. دانشکده موجودیتِ واقعیِ سامانه است و با سوییچ
   * دانشگاه هم‌تراز می‌ماند. ستون `buildingName` در دیتابیس دست‌نخورده می‌ماند
   * (دادهٔ قبلی حذف نمی‌شود)، ولی از این پس نوشته نمی‌شود.
   */
  const facultiesOfUni = uni
    ? await db
        .select({ id: faculties.id, name: faculties.name })
        .from(faculties)
        .where(eq(faculties.universityId, uni.id))
        .orderBy(faculties.name)
    : [];

  return (
    <div className="space-y-8">
      <SettingsClient settings={view} groups={[...SETTING_GROUPS]} />

      {/* ── داده‌های پایه (رکوردها) ── */}
      <details open className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer select-none list-none px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-slate-800">داده‌های پایه (رکوردها)</h2>
            <p className="text-xs text-slate-500">افزودن/ویرایش کلاس‌ها و دیگر موجودیت‌ها — مختص دانشگاه «{uni?.title ?? '—'}».</p>
          </div>
          <span className="text-slate-400 text-sm group-open:hidden">▼ باز کردن</span>
          <span className="text-slate-400 text-sm hidden group-open:inline">▲ بستن</span>
        </summary>
        <div className="px-5 pb-5">
          {/* موجودیت‌های دیگر (دانشکده‌ها، رشته‌ها، ترم‌ها و…) در ادامه اینجا اضافه می‌شوند. */}
          <ClassroomManager rooms={rooms} faculties={facultiesOfUni} />
        </div>
      </details>
    </div>
  );
}
