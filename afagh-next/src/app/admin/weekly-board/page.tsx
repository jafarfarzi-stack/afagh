import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms, classrooms, course_offerings, courses, departments, faculties,
  schedules, staff, users,
} from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { currentExpertFilters } from '@/lib/expert-scope';
import { getSetting } from '@/lib/settings';
import { groupIntoMerged, mergedGroupKey } from '@/lib/professor-calendar-layout';
import PrintButton from './PrintButton';

export const dynamic = 'force-dynamic';

const DAY_NAMES = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];
const HOURS = Array.from({ length: 13 }, (_, i) => `${String(8 + i).padStart(2, '0')}:00`); // 08:00..20:00

const faDigits = (s: string | number) => String(s).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

type BoardRow = {
  offeringId: number; groupNumber: number; enrolledCount: number | null;
  courseCode: string | null; courseTitle: string | null;
  dayOfWeek: number | null; startTime: string | null; endTime: string | null;
  roomId: number | null; roomName: string | null; buildingName: string | null;
  profFirstName: string | null; profLastName: string | null;
  deptId: number | null; sharedKey: string | null;
};

function profName(m: Pick<BoardRow, 'profFirstName' | 'profLastName'>): string {
  return `${m.profFirstName || ''} ${m.profLastName || ''}`.trim();
}

export default async function WeeklyBoardPage({ searchParams }: {
  searchParams: Promise<{ term?: string; faculty?: string; dept?: string; room?: string }>;
}) {
  const user = await requireRole(['ADMIN', 'EDU_EXPERT']);
  const uni = await getCurrentUniversity().catch(() => null);
  const sp = await searchParams;
  const termId = Number(sp.term) || 0;
  const facultyId = Number(sp.faculty) || 0;
  const deptId = Number(sp.dept) || 0;
  const roomId = Number(sp.room) || 0;
  const posterMode = roomId > 0;

  const terms = await db.select({ id: academic_terms.id, title: academic_terms.title, isCurrent: academic_terms.isCurrent })
    .from(academic_terms)
    .where(uni ? eq(academic_terms.universityId, uni.id) : undefined)
    .orderBy(desc(academic_terms.id));
  const term = terms.find(t => t.id === termId) ?? terms.find(t => t.isCurrent === 1) ?? terms[0] ?? null;

  const facs = await db.select({ id: faculties.id, name: faculties.name }).from(faculties).orderBy(asc(faculties.name));
  const depts = await db.select({ id: departments.id, name: departments.name, facultyId: departments.facultyId }).from(departments).orderBy(asc(departments.name));
  const rooms = await db.select({ id: classrooms.id, name: classrooms.name, buildingName: classrooms.buildingName, capacity: classrooms.capacity, facultyId: classrooms.facultyId })
    .from(classrooms)
    .where(uni ? eq(classrooms.universityId, uni.id) : undefined)
    .orderBy(asc(classrooms.name));
  const selRoom = rooms.find(r => r.id === roomId) ?? null;

  const rows = term
    ? await db
        .select({
          offeringId: course_offerings.id,
          groupNumber: course_offerings.groupNumber,
          enrolledCount: course_offerings.enrolledCount,
          courseCode: courses.code,
          courseTitle: courses.title,
          dayOfWeek: schedules.dayOfWeek,
          startTime: schedules.startTime,
          endTime: schedules.endTime,
          roomId: schedules.roomId,
          roomName: classrooms.name,
          buildingName: classrooms.buildingName,
          profFirstName: users.firstName,
          profLastName: users.lastName,
          deptId: courses.departmentId,
          sharedKey: course_offerings.sharedScheduleGroupKey,
        })
        .from(schedules)
        .innerJoin(course_offerings, eq(course_offerings.id, schedules.offeringId))
        .innerJoin(courses, eq(courses.id, course_offerings.courseId))
        .leftJoin(staff, eq(staff.id, course_offerings.professorId))
        .leftJoin(users, eq(users.id, staff.userId))
        .leftJoin(classrooms, eq(classrooms.id, schedules.roomId))
        .where(and(
          eq(schedules.scheduleType, 'CLASS'),
          eq(course_offerings.termId, term.id),
          eq(course_offerings.isActive, 1),
          ...(roomId ? [eq(schedules.roomId, roomId)] : []),
          ...await scopeConds(user.roles, deptId, facultyId),
        ))
        .orderBy(asc(courses.title), asc(course_offerings.groupNumber))
    : [];

  // ── ادغامی‌ها مثل برنامهٔ استاد/دانشجو: یک بلوک واحد ──
  // کلید = sharedScheduleGroupKey ارائه (K) وگرنه سانس یکسان روز/ساعت/کلاس (S).
  const mergedCells = groupIntoMerged<BoardRow & { uid: number }>(
    rows.map((r, i) => ({ ...r, uid: i })),
    (m) => m.offeringId * 100000 + m.uid,
    (m) => {
      const shared = String(m.sharedKey ?? '').trim();
      const slot = mergedGroupKey(null, {
        dayOfWeek: m.dayOfWeek,
        startTime: m.startTime,
        endTime: m.endTime,
        roomKey: m.roomId ?? m.roomName ?? null,
      });
      if (slot == null) return shared ? `K:${shared}` : null;
      return shared ? `K:${shared}|${slot}` : slot;
    },
  ).map(g => {
    if (!g.merged) {
      const m = g.members[0];
      return {
        ...m, merged: false as const, codes: String(m.courseCode ?? ''),
        profs: profName(m), groupLabel: faDigits(m.groupNumber),
        enrolled: Number(m.enrolledCount) || 0,
      };
    }
    const codes = [...new Set(g.members.map(m => String(m.courseCode ?? '').trim()).filter(Boolean))];
    const profs = [...new Set(g.members.map(profName).filter(Boolean))];
    const groups = [...new Set(g.members.map(m => m.groupNumber))].sort((a, b) => a - b);
    const enrolled = g.members.reduce((s, m) => s + (Number(m.enrolledCount) || 0), 0);
    return {
      ...g.members[0], merged: true as const, codes: codes.join(' / '),
      profs: profs.join('، '), groupLabel: groups.map(faDigits).join('، '), enrolled,
    };
  });

  const toMin = (t: string | null) => { if (!t) return 0; const [h, m] = String(t).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const fmtClock = (min: number) => faDigits(`${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`);
  const grid: Record<number, { r: (typeof mergedCells)[number]; start: number; end: number }[]> = {};
  for (const r of mergedCells) {
    const d = r.dayOfWeek == null ? -1 : Number(r.dayOfWeek);
    if (d < 0 || d > 6) continue;
    const start = toMin(r.startTime), end = toMin(r.endTime);
    (grid[d] ??= []).push({ r, start, end });
  }

  const poster = posterMode && selRoom ? selRoom : null;

  // ── سربرگ چاپ: دانشکده • نیمسال • کلاس ──
  const facName = (id: number | null | undefined) => facs.find(f => f.id === id)?.name ?? '';
  const headerFaculty = facultyId
    ? facName(facultyId)
    : poster?.facultyId
      ? facName(poster.facultyId)
      : (() => {
          const deptFac = new Map(depts.map(d => [d.id, d.facultyId] as const));
          const names = [...new Set(mergedCells.map(m => facName(deptFac.get(m.deptId ?? -1))).filter(Boolean))];
          return names.length <= 2 ? names.join('، ') : `${names.slice(0, 2).join('، ')} و …`;
        })();
  const headerDept = deptId ? depts.find(d => d.id === deptId)?.name ?? '' : '';

  // ارم دانشگاه (الگوی سراسری اسناد: logoUrl دانشگاه، وگرنه UNIVERSITY_LOGO)
  const logoUrl = uni?.logoUrl || (await getSetting('UNIVERSITY_LOGO').catch(() => '')) || null;

  return (
    <div className="space-y-4" dir="rtl">
      <form method="get" className="card flex flex-wrap items-end gap-3 print:hidden">
        <label className="text-xs font-bold">ترم
          <select name="term" defaultValue={term?.id} className="block mt-1 border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white">
            {terms.map(t => <option key={t.id} value={t.id}>{t.title}{t.isCurrent === 1 ? ' (جاری)' : ''}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold">دانشکده
          <select name="faculty" defaultValue={facultyId || ''} className="block mt-1 border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white">
            <option value="">همه</option>
            {facs.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold">گروه
          <select name="dept" defaultValue={deptId || ''} className="block mt-1 border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white">
            <option value="">همه</option>
            {depts.filter(d => !facultyId || d.facultyId === facultyId).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold">🚪 کلاس (پوستر درب)
          <select name="room" defaultValue={roomId || ''} className="block mt-1 border border-teal-500 rounded-xl px-3 py-2 text-sm bg-teal-50 font-black">
            <option value="">همهٔ کلاس‌ها (تابلوی کلی)</option>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name}{r.buildingName ? ` — ${r.buildingName}` : ''}</option>)}
          </select>
        </label>
        <button className="rounded-xl bg-indigo-700 px-5 py-2 text-white font-black text-sm">نمایش</button>
        <PrintButton />
      </form>

      {term && (
        <div className="print-area rounded-2xl border border-slate-300 bg-white p-4 space-y-3 overflow-x-auto" dir="rtl">
          {poster && <style>{`@page { size: A4 landscape; margin: 8mm 8mm; }`}</style>}
          {poster ? (
            <div className="text-center border-b-4 border-double border-slate-800 pb-3">
              {logoUrl && <img src={logoUrl} alt="ارم دانشگاه" className="mx-auto mb-2 h-16 w-16 object-contain" />}
              <h1 className="text-2xl font-black text-slate-900">🚪 برنامهٔ هفتگی کلاس {poster.name}</h1>
              <p className="text-base font-black text-slate-800 mt-2">
                {headerFaculty ? `دانشکدهٔ ${headerFaculty} · ` : ''}نیمسال {term.title}{poster.buildingName ? ` · ${poster.buildingName}` : ''}
              </p>
              <p className="text-sm font-bold text-slate-600 mt-1">
                کلاس {poster.name} · ظرفیت {faDigits(poster.capacity)} نفر · دانشگاه {uni?.title ?? ''}
              </p>
            </div>
          ) : (
            <div className="text-center">
              <div className="flex items-center justify-center gap-2">
                {logoUrl && <img src={logoUrl} alt="ارم دانشگاه" className="h-10 w-10 object-contain" />}
                <h1 className="text-base font-black text-slate-900">برنامهٔ هفتگی کلاس‌ها — نیمسال {term.title}</h1>
              </div>
              <p className="text-[11px] text-slate-500">
                دانشگاه {uni?.title ?? ''}
                {headerFaculty ? ` · دانشکدهٔ ${headerFaculty}` : ''}
                {headerDept ? ` · گروه ${headerDept}` : ''} · {mergedCells.length} سانس
                <span className="print:hidden"> (دامنهٔ انتخابی)</span>
              </p>
            </div>
          )}
          <table className={`w-full border-collapse ${poster ? 'text-sm' : 'text-[11px]'}`}>
            <thead>
              <tr>
                <th className="border border-slate-300 bg-slate-100 p-1">ساعت</th>
                {DAY_NAMES.map(d => <th key={d} className="border border-slate-300 bg-slate-100 p-1 rounded-t">{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {HOURS.map((h, hi) => (
                <tr key={h}>
                  <td className="border border-slate-300 bg-slate-50 p-1 text-center font-mono">{faDigits(h)}</td>
                  {DAY_NAMES.map((_, di) => {
                    const cells = (grid[di] ?? []).filter(c => c.start < toMin(`${hi + 8 + 1}:00`) && c.end > toMin(`${hi + 8}:00`));
                    return (
                      <td key={di} className="border border-slate-200 p-0.5 align-top" style={{ minHeight: 46 }}>
                        {cells.map((c, i) => (
                          <div key={i} className={`mb-0.5 rounded border-r-2 px-1 py-0.5 leading-5 ${c.r.merged ? 'bg-amber-50 border-amber-500' : 'bg-indigo-50 border-indigo-500'} ${poster ? 'text-[13px]' : 'text-[10px] leading-4'}`}>
                            <b>{c.r.codes} {c.r.courseTitle}</b> گروه {c.r.groupLabel}
                            {c.r.merged && <span className="mr-1 rounded bg-amber-200 px-1 text-[10px] font-black">🔗 ادغامی</span>}
                            <div className="text-slate-500">{fmtClock(c.start)}–{fmtClock(c.end)}{poster ? '' : ` · ${c.r.roomName || '—'}`}</div>
                            <div className="text-slate-600">{c.r.profs} · {faDigits(c.r.enrolled)} نفر</div>
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

async function scopeConds(roles: string[], deptId: number, facultyId: number): Promise<any[]> {
  const c: any[] = [];
  if (deptId) c.push(eq(courses.departmentId, deptId));
  else if (facultyId) {
    const ids = (await db.select({ id: departments.id }).from(departments).where(eq(departments.facultyId, facultyId))).map(r => r.id);
    if (ids.length) c.push(inArray(courses.departmentId, ids));
  }
  if (roles.includes('EDU_EXPERT')) {
    const eff = await currentExpertFilters().catch(() => null);
    if (eff?.departmentIds) c.push(inArray(courses.departmentId, eff.departmentIds));
    else if (eff?.facultyIds) {
      const ids = (await db.select({ id: departments.id }).from(departments).where(inArray(departments.facultyId, eff.facultyIds))).map(r => r.id);
      if (ids.length) c.push(inArray(courses.departmentId, ids));
    }
  }
  return c;
}