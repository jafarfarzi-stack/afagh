import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { courses, departments } from '@/db/schema';
import { requireDepHead } from '@/lib/group-manager';
import { createCourseAction, deleteCourseAction, updateCourseAction } from './actions';

export const dynamic = 'force-dynamic';

const TYPE_OPTS = ['عمومی', 'پایه', 'تخصصی', 'اختیاری'];

export default async function CoursesPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const { staff: me, deptId } = await requireDepHead();
  const [dept] = await db.select().from(departments).where(eq(departments.id, deptId)).limit(1);
  const rows = await db.select().from(courses).where(eq(courses.departmentId, deptId)).orderBy(courses.code);

  return (
    <div className="space-y-4">
      {sp.msg && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">✓ {sp.msg}</p>}
      {sp.err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">⛔ {sp.err}</p>}

      <div className="card space-y-3">
        <h2 className="font-bold">تعریف درس جدید — گروه {dept?.name ?? deptId}</h2>
        <form action={createCourseAction} className="grid items-end gap-3 md:grid-cols-6">
          <label className="text-xs text-slate-500">کد<input name="code" required className="input mt-1" dir="ltr" placeholder="مثلاً 5122305" /></label>
          <label className="text-xs text-slate-500 md:col-span-2">عنوان<input name="title" required className="input mt-1" placeholder="مثلاً یادگیری ماشین" /></label>
          <label className="text-xs text-slate-500">تئوری<input name="theo" type="number" min={0} defaultValue={3} className="input mt-1" dir="ltr" /></label>
          <label className="text-xs text-slate-500">عملی<input name="prac" type="number" min={0} defaultValue={0} className="input mt-1" dir="ltr" /></label>
          <label className="text-xs text-slate-500">نوع
            <select name="type" className="input mt-1">{TYPE_OPTS.map(t => <option key={t}>{t}</option>)}</select>
          </label>
          <label className="text-xs text-slate-500">نمره‌دهی
            <select name="grading" className="input mt-1"><option value="NUMERIC">عددی</option><option value="PASS_FAIL">قبول/رد</option></select>
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-500">موثر بر معدل<input type="checkbox" name="gpa" defaultChecked className="size-4" /></label>
          <button className="btn-primary">افزودن درس</button>
        </form>
      </div>

      <div className="card">
        <h2 className="mb-2 font-bold">دروس گروه ({rows.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead><tr className="text-slate-500"><th className="p-2">کد</th><th className="p-2">عنوان</th><th className="p-2">تئوری</th><th className="p-2">عملی</th><th className="p-2">نوع</th><th className="p-2">نمره‌دهی</th><th className="p-2">معدل</th><th className="p-2"></th></tr></thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="p-2" colSpan={7}>
                    <form action={updateCourseAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={c.id} />
                      <input name="code" defaultValue={c.code} className="input !py-1 !px-2 w-24" dir="ltr" />
                      <input name="title" defaultValue={c.title} className="input !py-1 !px-2 flex-1 min-w-40" />
                      <input name="theo" type="number" min={0} defaultValue={Number(c.theoreticalUnits ?? 0)} className="input !py-1 !px-2 w-16" dir="ltr" />
                      <input name="prac" type="number" min={0} defaultValue={Number(c.practicalUnits ?? 0)} className="input !py-1 !px-2 w-16" dir="ltr" />
                      <select name="type" defaultValue={TYPE_OPTS.includes(c.courseType ?? '') ? c.courseType as string : 'تخصصی'} className="input !py-1 !px-2">{TYPE_OPTS.map(t => <option key={t}>{t}</option>)}</select>
                      <select name="grading" defaultValue={c.gradingType ?? 'NUMERIC'} className="input !py-1 !px-2"><option value="NUMERIC">عددی</option><option value="PASS_FAIL">قبول/رد</option>{c.gradingType && !['NUMERIC','PASS_FAIL'].includes(c.gradingType) && <option value={c.gradingType}>{c.gradingType}</option>}</select>
                      <label className="flex items-center gap-1 text-slate-500">معدل<input type="checkbox" name="gpa" defaultChecked={!!c.affectsGpa} className="size-4" /></label>
                      <button className="btn-ghost !py-1 !px-2">ذخیره</button>
                    </form>
                  </td>
                  <td className="p-2">
                    <form action={deleteCourseAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className="text-red-600 hover:underline">حذف</button>
                    </form>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="p-3 text-center text-slate-400">درسی تعریف نشده است.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
