import { db } from '@/db';
import { eq } from 'drizzle-orm';
import { faculties } from '@/db/schema';
import { requireDepHead } from '@/lib/group-manager';
import { deleteClassroomAction } from './actions';
import ClassroomRowForm from './ClassroomRowForm';
import { listClassroomsForUniversity } from '@/lib/offering-scheduling';

export const dynamic = 'force-dynamic';

export default async function ClassroomsPage() {
  const { staff: me } = await requireDepHead();
  // فقط کلاس‌های همین دانشگاه (G3) — کلاس عام/سیستمی برای مشاهده هم نیست.
  const rooms = await listClassroomsForUniversity(db, me.universityId ?? null);
  // دانشکده‌های همان دانشگاه — «ساختمان» در سامانه تعریف ندارد
  const facultiesOfUni = me.universityId
    ? await db
        .select({ id: faculties.id, name: faculties.name })
        .from(faculties)
        .where(eq(faculties.universityId, me.universityId))
        .orderBy(faculties.name)
    : [];

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <h2 className="font-bold">تعریف کلاس جدید (نام کلاس، ظرفیت، دانشکده)</h2>
        <ClassroomRowForm variant="new" faculties={facultiesOfUni} />
        <p className="text-[11px] text-slate-400">ردیف/ستون برای نقشهٔ حضور و غیاب (ماژول حضور و غیاب) استفاده می‌شود.</p>
      </div>

      <div className="card">
        <h2 className="mb-2 font-bold">کلاس‌ها ({rooms.length})</h2>
        <div className="overflow-x-auto">
        <table className="w-full text-right text-xs rt">
          <thead><tr className="text-slate-500"><th className="p-2">نام</th><th className="p-2">ظرفیت</th><th className="p-2">نوع</th><th className="p-2">دانشکده</th><th className="p-2">نیمکت (ر×س)</th><th className="p-2"></th></tr></thead>
          <tbody>
            {rooms.map(r => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="p-2" colSpan={5}>
                  <ClassroomRowForm
                    id={r.id}
                    name={r.name}
                    cap={r.capacity}
                    roomType={r.roomType}
                    facultyId={r.facultyId}
                    floor={r.floor}
                    rows={r.rowsCount}
                    cols={r.colsCount}
                    isActive={r.isActive ?? 1}
                    faculties={facultiesOfUni}
                  />
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
    </div>
  );
}
