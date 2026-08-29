import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms, classrooms, course_offerings, courses, degree_level_configs, majors, offering_professors, schedules, staff, users } from '@/db/schema';
import { requireDepHead } from '@/lib/group-manager';
import { targetingLabel } from '@/lib/offering-targeting';
import { addScheduleAction, createOfferingAction, deactivateOfferingAction, deleteScheduleAction, updateOfferingAction } from './actions';

export const dynamic = 'force-dynamic';
const DAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
const hm = (t: string | null) => (t ? String(t).slice(0, 5) : '');

export default async function OfferingsPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { staff: me, deptId } = await requireDepHead();
  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1)).limit(1);

  const deptCourses = await db.select().from(courses).where(eq(courses.departmentId, deptId)).orderBy(courses.code);
  const courseById = new Map(deptCourses.map(c => [c.id, c]));

  const offs = term
    ? await db.select().from(course_offerings)
        .where(and(eq(course_offerings.termId, term.id), eq(course_offerings.isActive, 1)))
    : [];
  const mine = offs.filter(o => courseById.has(o.courseId));
  const offIds = mine.map(o => o.id);

  const profs = await db.select({ id: staff.id, name: users.firstName, family: users.lastName, rank: staff.academicRank })
    .from(staff).innerJoin(users, eq(users.id, staff.userId)).where(eq(staff.departmentId, deptId));
  const profName = new Map(profs.map(p => [p.id, p.name + ' ' + p.family]));

  const scheds = offIds.length
    ? await db.select({ id: schedules.id, offeringId: schedules.offeringId, day: schedules.dayOfWeek, st: schedules.startTime, en: schedules.endTime, roomId: schedules.roomId, room: classrooms.name })
        .from(schedules).leftJoin(classrooms, eq(classrooms.id, schedules.roomId))
        .where(and(inArray(schedules.offeringId, offIds), eq(schedules.scheduleType, 'CLASS')))
    : [];

  const rooms = await db.select().from(classrooms).orderBy(classrooms.name);
  const degrees = await db.select().from(degree_level_configs);
  const majorRows = await db.select().from(majors);
  const degTitle = (id: number) => degrees.find(d => d.id === id)?.title ?? String(id);
  const majorTitle = (id: number) => majorRows.find(m => m.id === id)?.name ?? String(id);
  void offering_professors;

  const TargetSelects = (o: typeof mine[number] | null) => (
    <>
      <select name="deg" defaultValue={o?.targetDegreeLevelId ?? ''} className="input !py-1 !px-2">
        <option value="">مقطع: همه</option>
        {degrees.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
      </select>
      <select name="major" defaultValue={o?.targetMajorId ?? ''} className="input !py-1 !px-2">
        <option value="">رشته: همه</option>
        {majorRows.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <input name="ys" type="number" placeholder="ورودی از" defaultValue={o?.entryYearStart ?? ''} className="input !py-1 !px-2 w-20" dir="ltr" />
      <input name="ye" type="number" placeholder="تا" defaultValue={o?.entryYearEnd ?? ''} className="input !py-1 !px-2 w-20" dir="ltr" />
    </>
  );

  return (
    <div className="space-y-4">
      {searchParams.msg && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">✓ {searchParams.msg}</p>}
      {searchParams.err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">⛔ {searchParams.err}</p>}

      <div className="card space-y-3">
        <h2 className="font-bold">ارائهٔ جدید — ترم جاری: {term?.title ?? '—'}</h2>
        <form action={createOfferingAction} className="flex flex-wrap items-center gap-2 text-xs">
          <input type="hidden" name="termId" value={term?.id ?? 0} />
          <select name="courseId" required className="input !py-1 !px-2 min-w-44">
            <option value="">درس…</option>
            {deptCourses.map(c => <option key={c.id} value={c.id}>{c.title} ({c.code})</option>)}
          </select>
          <input name="group" type="number" min={1} defaultValue={1} title="گروه" className="input !py-1 !px-2 w-16" dir="ltr" />
          <input name="cap" type="number" min={1} required placeholder="ظرفیت" className="input !py-1 !px-2 w-20" dir="ltr" />
          <input name="waitCap" type="number" min={0} placeholder="لیست انتظار" className="input !py-1 !px-2 w-24" dir="ltr" />
          <select name="professorId" className="input !py-1 !px-2 min-w-36">
            <option value="">استاد…</option>
            {profs.map(p => <option key={p.id} value={p.id}>{p.name} {p.family}</option>)}
          </select>
          {TargetSelects(null)}
          <button className="btn-primary !py-1 !px-3">ایجاد ارائه</button>
        </form>
      </div>

      <div className="space-y-3">
        {mine.map(o => {
          const c = courseById.get(o.courseId)!;
          const sch = scheds.filter(s => s.offeringId === o.id);
          return (
            <div key={o.id} className="card space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold">{c.title} <span className="font-mono text-xs text-slate-400" dir="ltr">{c.code}</span> · گروه {o.groupNumber}</p>
                <p className="text-xs text-slate-500">ثبت‌نام: {o.enrolledCount}/{o.capacity} · استاد: {o.professorId ? profName.get(o.professorId) ?? '—' : '—'} · هدف: {targetingLabel(o, degTitle, majorTitle)}</p>
              </div>
              <form action={updateOfferingAction} className="flex flex-wrap items-center gap-2 text-xs">
                <input type="hidden" name="id" value={o.id} />
                <input name="group" type="number" min={1} defaultValue={o.groupNumber} title="گروه" className="input !py-1 !px-2 w-16" dir="ltr" />
                <input name="cap" type="number" min={1} defaultValue={o.capacity} title="ظرفیت" className="input !py-1 !px-2 w-20" dir="ltr" />
                <input name="waitCap" type="number" min={0} defaultValue={o.waitlistCapacity ?? 0} title="لیست انتظار" className="input !py-1 !px-2 w-20" dir="ltr" />
                <select name="professorId" defaultValue={o.professorId ?? ''} className="input !py-1 !px-2 min-w-36">
                  <option value="">استاد…</option>
                  {profs.map(p => <option key={p.id} value={p.id}>{p.name} {p.family}</option>)}
                </select>
                {TargetSelects(o)}
                <button className="btn-ghost !py-1 !px-2">ذخیره</button>
              </form>
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 text-xs">
                <span className="text-slate-500">برنامهٔ هفتگی:</span>
                {sch.map(s => (
                  <form key={s.id} action={deleteScheduleAction} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1">
                    <input type="hidden" name="id" value={s.id} />
                    <span>{DAYS[s.day ?? 0]} {hm(s.st)}–{hm(s.en)}{s.room ? ' · ' + s.room : ''}</span>
                    <button className="text-red-500 hover:underline">×</button>
                  </form>
                ))}
                <form action={addScheduleAction} className="flex items-center gap-1">
                  <input type="hidden" name="offeringId" value={o.id} />
                  <select name="day" className="input !py-1 !px-2">{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
                  <input name="start" type="time" required className="input !py-1 !px-2" dir="ltr" />
                  <input name="end" type="time" required className="input !py-1 !px-2" dir="ltr" />
                  <select name="roomId" className="input !py-1 !px-2">
                    <option value="">کلاس…</option>
                    {rooms.map(r => <option key={r.id} value={r.id}>{r.name} ({r.capacity})</option>)}
                  </select>
                  <button className="btn-ghost !py-1 !px-2">+</button>
                </form>
                <form action={deactivateOfferingAction} className="ms-auto">
                  <input type="hidden" name="id" value={o.id} />
                  <button className="text-red-600 text-xs hover:underline">{o.enrolledCount > 0 ? 'غیرفعال‌سازی' : 'حذف ارائه'}</button>
                </form>
              </div>
            </div>
          );
        })}
        {mine.length === 0 && <p className="card text-center text-sm text-slate-400">ارائه‌ای برای ترم جاری در گروه شما نیست.</p>}
      </div>
    </div>
  );
}
