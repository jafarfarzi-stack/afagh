import { requireRole } from '@/lib/auth';
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { getCurrentUniversity } from '@/lib/university-scope';
import { saveCourseTuition, deactivateCourseTuition } from './actions';

export const dynamic = 'force-dynamic';

const FINANCE = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'];

type Row = Record<string, unknown>;

const fa = (v: unknown) => Number(v ?? 0).toLocaleString('fa-IR');

const ERRORS: Record<string, string> = {
  invalid: 'شمارهٔ دانشجویی، کد درس و مبلغِ هر واحد الزامی است (مبلغ باید بزرگ‌تر از صفر باشد).',
  student: 'دانشجویی با این شماره پیدا نشد.',
  course: 'درسی با این کد پیدا نشد.',
};

/**
 * شهریهٔ ویژهٔ یک درس برای یک دانشجوی خاص.
 *
 * در سندِ راهنمای سما: «شهریهٔ متغیر ویژه برای یک دانشجو خاص برای درس‌های مورد
 * نظر». این نرخ بر تعرفهٔ عمومی و بر فرمولِ ویژهٔ کلِ دانشجو اولویت دارد.
 */
export default async function CourseTuitionPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string; err?: string }>;
}) {
  await requireRole(FINANCE);
  const sp = (await searchParams) ?? {};
  const uni = await getCurrentUniversity();

  let rows: Row[] = [];
  let terms: Row[] = [];
  try {
    const r = await db.execute(sql`
      select o.id, s."studentCode" as student_code,
             coalesce(u."firstName" || ' ' || u."lastName", '—') as student,
             c.code as course_code, c.title as course_title,
             o."termId" as term_id, t.title as term_title,
             o."perUnitAmount" as per_unit, o.reason
      from student_course_tuition_overrides o
      join students s on s.id = o."studentId"
      left join users u on u.id = s."userId"
      join courses c on c.id = o."courseId"
      left join academic_terms t on t.id = o."termId"
      where o."isActive" = 1 and s."universityId" = ${uni.id}
      order by o.id desc
      limit 200
    `);
    rows = (r.rows ?? []) as Row[];
  } catch {
    rows = [];
  }
  try {
    const t = await db.execute(sql`
      select id, title from academic_terms order by id desc limit 60
    `);
    terms = (t.rows ?? []) as Row[];
  } catch {
    terms = [];
  }

  return (
    <div dir="rtl" className="mx-auto max-w-5xl space-y-4 p-4">
      <div>
        <h1 className="text-lg font-black text-slate-900">شهریهٔ ویژهٔ درس</h1>
        <p className="mt-1 text-2xs leading-5 text-slate-500">
          برای یک دانشجوی خاص، نرخِ هر واحدِ یک درس را جدا تعیین کنید. اولویت اعمال:
          <b> شهریهٔ ویژهٔ همین درس</b> ← فرمول ویژهٔ دانشجو ← تعرفهٔ عمومی.
        </p>
      </div>

      {sp.err && ERRORS[sp.err] ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-2xs font-bold text-rose-800">
          {ERRORS[sp.err]}
        </div>
      ) : null}
      {sp.ok ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-2xs font-bold text-emerald-800">
          ذخیره شد.
        </div>
      ) : null}

      <form action={saveCourseTuition} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-2xs font-bold text-slate-600">شمارهٔ دانشجویی</span>
          <input name="studentCode" required dir="ltr"
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-2xs font-bold text-slate-600">کد درس</span>
          <input name="courseCode" required dir="ltr"
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-2xs font-bold text-slate-600">ترم (خالی = همهٔ ترم‌ها)</span>
          <select name="termId" defaultValue=""
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">همهٔ ترم‌ها</option>
            {terms.map((t) => (
              <option key={String(t.id)} value={String(t.id)}>{String(t.title ?? t.id)}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-2xs font-bold text-slate-600">مبلغ هر واحد (ریال)</span>
          <input name="perUnitAmount" required inputMode="numeric" dir="ltr"
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-sm" />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-2xs font-bold text-slate-600">دلیل / توضیح</span>
          <input name="reason" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        <div className="flex items-end">
          <button type="submit"
            className="w-full rounded-lg bg-indigo-700 px-4 py-2 text-sm font-black text-white hover:bg-indigo-800">
            ثبت
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
          <h2 className="text-sm font-black text-slate-800">نرخ‌های فعال</h2>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-2xs font-black text-slate-700">
            {fa(rows.length)} رکورد
          </span>
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-2xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
                  <th className="border-b border-slate-200 px-2 py-1 text-right font-bold">دانشجو</th>
                  <th className="border-b border-slate-200 px-2 py-1 text-right font-bold">شماره</th>
                  <th className="border-b border-slate-200 px-2 py-1 text-right font-bold">درس</th>
                  <th className="border-b border-slate-200 px-2 py-1 text-right font-bold">ترم</th>
                  <th className="border-b border-slate-200 px-2 py-1 text-right font-bold">هر واحد</th>
                  <th className="border-b border-slate-200 px-2 py-1 text-right font-bold">دلیل</th>
                  <th className="border-b border-slate-200 px-2 py-1" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={String(r.id)} className="border-b border-slate-100 last:border-0">
                    <td className="px-2 py-1 text-slate-700">{String(r.student ?? '—')}</td>
                    <td className="px-2 py-1 font-mono text-slate-600">{String(r.student_code ?? '—')}</td>
                    <td className="px-2 py-1 text-slate-700">{String(r.course_code ?? '')} — {String(r.course_title ?? '')}</td>
                    <td className="px-2 py-1 text-slate-600">{r.term_title ? String(r.term_title) : 'همه'}</td>
                    <td className="px-2 py-1 font-mono font-bold text-slate-800">{fa(r.per_unit)}</td>
                    <td className="px-2 py-1 text-slate-500">{r.reason ? String(r.reason) : '—'}</td>
                    <td className="px-2 py-1">
                      <form action={deactivateCourseTuition}>
                        <input type="hidden" name="id" value={String(r.id)} />
                        <button type="submit" className="rounded border border-rose-300 px-2 py-0.5 text-2xs font-bold text-rose-700 hover:bg-rose-50">
                          غیرفعال
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-3 py-6 text-center text-2xs text-slate-400">هنوز نرخی ثبت نشده است.</p>
        )}
      </div>
    </div>
  );
}
