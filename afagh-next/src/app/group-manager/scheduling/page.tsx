import Link from 'next/link';
import { and, eq, inArray, desc } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms, classrooms, course_offerings, courses, majors,
  schedules, staff, users,
} from '@/db/schema';
import { requireDepHead } from '@/lib/group-manager';

export const dynamic = 'force-dynamic';

const DAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
const hm = (t: string | null) => (t ? String(t).slice(0, 5) : '');

type SchedRow = {
  id: number; offeringId: number; day: number | null;
  st: string | null; en: string | null; roomId: number | null; room: string | null;
};

/** آیا دو بازهٔ زمانی هم‌پوشانی دارند؟ (رشته‌های HH:MM با صفرِ ابتدایی مقایسه‌پذیرند) */
function overlap(aS: string | null, aE: string | null, bS: string | null, bE: string | null): boolean {
  if (!aS || !aE || !bS || !bE) return false;
  return aS < bE && bS < aE;
}

/**
 * کارتابل «برنامه‌ریزی درسی گروه» — نمای محدود به گروهِ مدیر.
 *
 * این صفحه همان منطقِ تابلوی برنامه‌ریزیِ ادمین (`/admin/scheduling`) را با
 * دامنهٔ محدود به «دروسِ همین گروه» بازتاب می‌دهد تا مدیر گروه ببیند کدام
 * ارائه‌ها نیاز به کم/زیادکردن ظرفیت یا جابه‌جاییِ جلسه دارند. فقط‌خواندنی است؛
 * ویرایشِ ظرفیت/جلسه از صفحهٔ «ارائه‌های ترم» انجام می‌شود.
 */
export default async function GroupSchedulingPage() {
  const { deptId, dept } = await requireDepHead();

  // ترم جاری (اگر نبود، آخرین ترم)
  const [term] = await db
    .select({ id: academic_terms.id, title: academic_terms.title })
    .from(academic_terms)
    .where(eq(academic_terms.isCurrent, 1))
    .limit(1);
  const currentTerm = term ?? (await db
    .select({ id: academic_terms.id, title: academic_terms.title })
    .from(academic_terms)
    .orderBy(desc(academic_terms.termCode))
    .limit(1))[0];

  // دروس گروه
  const deptCourses = await db
    .select({ id: courses.id, code: courses.code, title: courses.title, units: courses.units })
    .from(courses)
    .where(eq(courses.departmentId, deptId))
    .orderBy(courses.code);
  const courseById = new Map(deptCourses.map(c => [c.id, c]));

  // ارائه‌های فعالِ ترمِ جاری در گروه
  const offs = currentTerm && courseById.size > 0
    ? await db
        .select({
          id: course_offerings.id,
          courseId: course_offerings.courseId,
          groupNumber: course_offerings.groupNumber,
          capacity: course_offerings.capacity,
          enrolledCount: course_offerings.enrolledCount,
          professorId: course_offerings.professorId,
          targetMajorId: course_offerings.targetMajorId,
          entryYearStart: course_offerings.entryYearStart,
          entryYearEnd: course_offerings.entryYearEnd,
        })
        .from(course_offerings)
        .where(and(
          eq(course_offerings.termId, currentTerm.id),
          eq(course_offerings.isActive, 1),
          inArray(course_offerings.courseId, [...courseById.keys()]),
        ))
        .orderBy(course_offerings.id)
    : [];

  const offIds = offs.map(o => o.id);

  // استادها (هر کسی که روی این ارائه‌هاست — حتی از گروه دیگر)
  const profIds = [...new Set(offs.map(o => o.professorId).filter((x): x is number => x != null))];
  const profRows = profIds.length
    ? await db
        .select({ id: staff.id, name: users.firstName, family: users.lastName })
        .from(staff)
        .innerJoin(users, eq(users.id, staff.userId))
        .where(inArray(staff.id, profIds))
    : [];
  const profName = new Map(profRows.map(p => [p.id, `${p.name} ${p.family}`.trim()]));

  // رشته‌ها برای برچسب هدف‌گیری
  const majorRows = await db.select({ id: majors.id, name: majors.name }).from(majors);
  const majorTitle = new Map(majorRows.map(m => [m.id, m.name]));

  // جلسه‌های هفتگیِ این ارائه‌ها
  const scheds: SchedRow[] = offIds.length
    ? await db
        .select({
          id: schedules.id,
          offeringId: schedules.offeringId,
          day: schedules.dayOfWeek,
          st: schedules.startTime,
          en: schedules.endTime,
          roomId: schedules.roomId,
          room: classrooms.name,
        })
        .from(schedules)
        .leftJoin(classrooms, eq(classrooms.id, schedules.roomId))
        .where(and(inArray(schedules.offeringId, offIds), eq(schedules.scheduleType, 'CLASS')))
    : [];

  const schedByOffering = new Map<number, SchedRow[]>();
  for (const s of scheds) {
    if (!schedByOffering.has(s.offeringId)) schedByOffering.set(s.offeringId, []);
    schedByOffering.get(s.offeringId)!.push(s);
  }

  // ── تشخیص تعارض‌ها (اتاق/استاد) در دامنهٔ همین گروه ──
  const offById = new Map(offs.map(o => [o.id, o]));
  const conflicts: { kind: 'ROOM' | 'PROF'; label: string }[] = [];
  for (let i = 0; i < scheds.length; i++) {
    for (let j = i + 1; j < scheds.length; j++) {
      const a = scheds[i], b = scheds[j];
      if (a.offeringId === b.offeringId) continue;
      if (a.day !== b.day) continue;
      if (!overlap(a.st, a.en, b.st, b.en)) continue;
      const ca = offById.get(a.offeringId), cb = offById.get(b.offeringId);
      const nameA = ca ? courseById.get(ca.courseId)?.title ?? '—' : '—';
      const nameB = cb ? courseById.get(cb.courseId)?.title ?? '—' : '—';
      if (a.roomId != null && a.roomId === b.roomId) {
        conflicts.push({
          kind: 'ROOM',
          label: `${DAYS[a.day ?? 0]} ${hm(a.st)}–${hm(a.en)} · ${a.room ?? 'کلاس'} — «${nameA}» و «${nameB}»`,
        });
      }
      if (ca?.professorId != null && ca.professorId === cb?.professorId) {
        conflicts.push({
          kind: 'PROF',
          label: `${DAYS[a.day ?? 0]} ${hm(a.st)}–${hm(a.en)} · استاد ${profName.get(ca.professorId) ?? '—'} — «${nameA}» و «${nameB}»`,
        });
      }
    }
  }

  // ── شاخص‌ها ──
  const totalCap = offs.reduce((s, o) => s + (o.capacity ?? 0), 0);
  const totalEnr = offs.reduce((s, o) => s + (o.enrolledCount ?? 0), 0);
  const fill = totalCap > 0 ? Math.round((totalEnr / totalCap) * 100) : 0;
  const unscheduled = offs.filter(o => (schedByOffering.get(o.id)?.length ?? 0) === 0).length;
  const noProf = offs.filter(o => o.professorId == null).length;
  const overCap = offs.filter(o => (o.enrolledCount ?? 0) > (o.capacity ?? 0)).length;

  const kpi = (label: string, value: string, tone: string) => (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-[10px] font-bold text-slate-500">{label}</p>
      <p className={`mt-0.5 text-lg font-black ${tone}`}>{value}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-base font-black text-slate-800">برنامه‌ریزی درسی گروه</h1>
          <p className="text-[11px] text-slate-500">
            دامنه: <b>{dept.name}</b> · ترم: <b>{currentTerm?.title ?? '—'}</b>
            {' · '}نمای فقط‌خواندنی (ویرایش ظرفیت/جلسه از «ارائه‌های ترم»)
          </p>
        </div>
        <Link href="/group-manager/offerings" className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-800">
          ویرایش ارائه‌ها ←
        </Link>
      </div>

      {/* شاخص‌های کلیدی */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {kpi('ارائه‌ها', offs.length.toLocaleString('fa-IR'), 'text-slate-800')}
        {kpi('ظرفیت کل', totalCap.toLocaleString('fa-IR'), 'text-slate-800')}
        {kpi('ثبت‌نام', totalEnr.toLocaleString('fa-IR'), 'text-emerald-700')}
        {kpi('پرشدگی', `${fill.toLocaleString('fa-IR')}٪`, fill >= 90 ? 'text-rose-600' : 'text-slate-800')}
        {kpi('بدون جلسه', unscheduled.toLocaleString('fa-IR'), unscheduled > 0 ? 'text-amber-600' : 'text-slate-800')}
        {kpi('تعارض', conflicts.length.toLocaleString('fa-IR'), conflicts.length > 0 ? 'text-rose-600' : 'text-emerald-700')}
      </div>

      {/* هشدارهای نیازمند رسیدگی */}
      {(noProf > 0 || overCap > 0 || unscheduled > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <b>نیازمند رسیدگی:</b>
          {noProf > 0 && <span> {noProf.toLocaleString('fa-IR')} ارائه بدون استاد ·</span>}
          {overCap > 0 && <span> {overCap.toLocaleString('fa-IR')} ارائه بیش از ظرفیت ·</span>}
          {unscheduled > 0 && <span> {unscheduled.toLocaleString('fa-IR')} ارائه بدون جلسهٔ هفتگی</span>}
        </div>
      )}

      {/* تعارض‌ها */}
      {conflicts.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
          <p className="mb-1 text-xs font-black text-rose-800">تعارض‌های زمان‌بندی در گروه</p>
          <ul className="list-disc space-y-0.5 ps-5 text-[11px] text-rose-800">
            {conflicts.slice(0, 20).map((c, i) => (
              <li key={i}>{c.kind === 'ROOM' ? '🚪 اتاق' : '👨‍🏫 استاد'}: {c.label}</li>
            ))}
          </ul>
        </div>
      )}

      {/* جدول ارائه‌ها */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-right text-xs">
          <thead className="bg-slate-50 text-[11px] text-slate-500">
            <tr>
              <th className="px-2 py-2 font-bold">درس</th>
              <th className="px-2 py-2 font-bold">گروه</th>
              <th className="px-2 py-2 font-bold">استاد</th>
              <th className="px-2 py-2 font-bold">ظرفیت</th>
              <th className="px-2 py-2 font-bold">ثبت‌نام</th>
              <th className="px-2 py-2 font-bold">پرشدگی</th>
              <th className="px-2 py-2 font-bold">جلسه‌ها</th>
              <th className="px-2 py-2 font-bold">هدف</th>
            </tr>
          </thead>
          <tbody>
            {offs.map(o => {
              const c = courseById.get(o.courseId);
              const cap = o.capacity ?? 0;
              const enr = o.enrolledCount ?? 0;
              const pct = cap > 0 ? Math.min(100, Math.round((enr / cap) * 100)) : 0;
              const sch = schedByOffering.get(o.id) ?? [];
              const target = o.targetMajorId
                ? majorTitle.get(o.targetMajorId) ?? '—'
                : 'همهٔ رشته‌ها';
              const targetRange = o.entryYearStart
                ? `${target} · ورودی ${o.entryYearStart}${o.entryYearEnd && o.entryYearEnd !== o.entryYearStart ? `–${o.entryYearEnd}` : ''}`
                : target;
              return (
                <tr key={o.id} className="border-t border-slate-100 align-top">
                  <td className="px-2 py-2">
                    <span className="font-bold text-slate-800">{c?.title ?? '—'}</span>
                    <span className="ms-1 font-mono text-[10px] text-slate-400" dir="ltr">{c?.code}</span>
                    {o.professorId == null && <span className="ms-1 rounded bg-rose-100 px-1 text-[9px] font-bold text-rose-700">بدون استاد</span>}
                  </td>
                  <td className="px-2 py-2 text-slate-600">{o.groupNumber}</td>
                  <td className="px-2 py-2 text-slate-600">{o.professorId ? profName.get(o.professorId) ?? '—' : '—'}</td>
                  <td className="px-2 py-2 text-slate-700">{cap.toLocaleString('fa-IR')}</td>
                  <td className={`px-2 py-2 font-bold ${enr > cap ? 'text-rose-600' : 'text-slate-700'}`}>{enr.toLocaleString('fa-IR')}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full ${pct >= 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] text-slate-500">{pct.toLocaleString('fa-IR')}٪</span>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    {sch.length === 0 ? (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">بدون جلسه</span>
                    ) : (
                      <span className="text-[10px] text-slate-600">
                        {sch.length.toLocaleString('fa-IR')} جلسه
                        <span className="block text-[10px] text-slate-400">
                          {sch.slice(0, 2).map(s => `${DAYS[s.day ?? 0]} ${hm(s.st)}`).join(' · ')}
                          {sch.length > 2 ? ' …' : ''}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-[10px] text-slate-500">{targetRange}</td>
                </tr>
              );
            })}
            {offs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-2 py-6 text-center text-sm text-slate-400">
                  ارائه‌ای برای ترم جاری در گروه شما ثبت نشده است.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
