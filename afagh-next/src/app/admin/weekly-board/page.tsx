import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms, classrooms, course_offerings, courses, departments, enrollments, faculties,
  majors, offering_professors, schedules, staff, students, users,
} from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { currentExpertFilters } from '@/lib/expert-scope';
import { getSetting, getBool } from '@/lib/settings';
import { groupIntoMerged, mergedGroupKey } from '@/lib/professor-calendar-layout';
import PrintButton from './PrintButton';

export const dynamic = 'force-dynamic';

const DAY_NAMES = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];
const HOURS = Array.from({ length: 13 }, (_, i) => `${String(8 + i).padStart(2, '0')}:00`); // 08:00..20:00

const faDigits = (s: string | number) => String(s).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

/** پیشوند هوشمند: اگر مقدار خودش با همان عنوان شروع شود، تکرار نمی‌شود
 * («دانشگاه دانشگاه آفاق» و «نیمسال نیمسال اول» پیش می‌آید چون عنوان رکوردها پیشوند دارد) */
const withPrefix = (prefix: string, value: unknown) => {
  const v = String(value ?? '').trim();
  if (!v) return '';
  return v.startsWith(prefix) || v.includes(prefix) ? v : `${prefix} ${v}`;
};

type BoardRow = {
  offeringId: number; groupNumber: number; enrolledCount: number | null;
  courseCode: string | null; courseTitle: string | null;
  dayOfWeek: number | null; startTime: string | null; endTime: string | null;
  roomId: number | null; roomName: string | null; buildingName: string | null;
  profFirstName: string | null; profLastName: string | null;
  profRank: string | null; profGender: string | null; profLegacyTitle: string | null;
  deptId: number | null; sharedKey: string | null;
};

const normFa = (s: unknown) => String(s ?? '').replace(/ي/g, 'ی').replace(/ك/g, 'ک');
/** ارقام فارسی/عربی به انگلیسی — برای جست‌وجوی کد استاد/شماره دانشجویی */
const faToEn = (s: unknown) => String(s ?? '').replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).trim();

/** نام نمایشی استاد با لقب احترام: استادیار و بالاتر «دکتر» + جناب آقای/سرکار خانم */
function profDisplay(
  m: Pick<BoardRow, 'profFirstName' | 'profLastName' | 'profRank' | 'profGender' | 'profLegacyTitle'>,
  showTitle: boolean, showFirst: boolean,
): string {
  const first = (m.profFirstName || '').trim();
  const last = (m.profLastName || '').trim();
  if (!showTitle) return [showFirst ? first : '', last].filter(Boolean).join(' ');
  const rank = normFa(m.profRank);
  const isDoctor = rank.includes('دانشیار') || rank.includes('استاد');
  let honor = '';
  if (m.profGender === 'FEMALE') honor = 'سرکار خانم';
  else if (m.profGender === 'MALE') honor = 'جناب آقای';
  else {
    const leg = normFa(m.profLegacyTitle);
    if (leg.includes('خانم')) honor = 'سرکار خانم';
    else if (leg.includes('آقا')) honor = 'جناب آقای';
  }
  return [honor, isDoctor ? 'دکتر' : '', showFirst ? first : '', last].filter(Boolean).join(' ');
}

export default async function WeeklyBoardPage({ searchParams }: {
  searchParams: Promise<{ term?: string; faculty?: string; dept?: string; room?: string; tab?: string; q?: string }>;
}) {
  const user = await requireRole(['ADMIN', 'EDU_EXPERT']);
  const uni = await getCurrentUniversity().catch(() => null);
  const sp = await searchParams;
  const tab = sp.tab === 'prof' || sp.tab === 'student' ? sp.tab : 'board';
  const q = faToEn(sp.q);
  const termId = Number(sp.term) || 0;
  const facultyId = Number(sp.faculty) || 0;
  const deptId = Number(sp.dept) || 0;
  const roomId = Number(sp.room) || 0;
  const posterMode = roomId > 0;

  // کلیدهای نمایش نام استاد (تنظیمات مدیر)
  const [showTitle, showFirst] = await Promise.all([
    getBool('WEEKLY_BOARD_PROF_TITLE').catch(() => true),
    getBool('WEEKLY_BOARD_SHOW_FIRSTNAME').catch(() => true),
  ]);

  const terms = await db.select({ id: academic_terms.id, title: academic_terms.title, isCurrent: academic_terms.isCurrent })
    .from(academic_terms)
    .where(uni ? eq(academic_terms.universityId, uni.id) : undefined)
    .orderBy(desc(academic_terms.id));
  const term = terms.find(t => t.id === termId) ?? terms.find(t => t.isCurrent === 1) ?? terms[0] ?? null;

  const facRows = await db.select({ id: faculties.id, name: faculties.name }).from(faculties)
    .where(uni ? eq(faculties.universityId, uni.id) : undefined)
    .orderBy(asc(faculties.name));
  // حذف تکراری‌های هم‌نام مهاجرت سما (دو ردیف یک نام) — کمترین id می‌ماند
  const facs = facRows.filter((f, i, a) => a.findIndex(x => x.name.trim() === f.name.trim()) === i);
  const facIds = new Set(facs.map(f => f.id));
  const depts = (await db.select({ id: departments.id, name: departments.name, facultyId: departments.facultyId }).from(departments)
    .where(uni ? eq(departments.universityId, uni.id) : undefined)
    .orderBy(asc(departments.name)))
    .filter(d => facIds.size === 0 || facIds.has(d.facultyId));
  const rooms = await db.select({ id: classrooms.id, name: classrooms.name, buildingName: classrooms.buildingName, capacity: classrooms.capacity, facultyId: classrooms.facultyId })
    .from(classrooms)
    .where(uni ? eq(classrooms.universityId, uni.id) : undefined)
    .orderBy(asc(classrooms.name));
  const selRoom = rooms.find(r => r.id === roomId) ?? null;

  // ستون‌های مشترک هر سه تب (تابلوی کلاس‌ها / برنامه استاد / برنامه دانشجو)
  const boardSelect = {
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
    profRank: staff.academicRank,
    profGender: users.gender,
    profLegacyTitle: staff.title,
    deptId: courses.departmentId,
    sharedKey: course_offerings.sharedScheduleGroupKey,
  };

  const rows = term && tab === 'board'
    ? await db
        .select(boardSelect)
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

const toMin = (t: string | null) => { if (!t) return 0; const [h, m] = String(t).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const fmtClock = (min: number) => faDigits(`${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`);

type MergedCell = BoardRow & {
  merged: boolean; codes: string; profs: string; groupLabel: string; enrolled: number;
  uid: number;
};

/** ادغامی‌ها مثل برنامهٔ استاد/دانشجو: یک بلوک واحد (کلید K مشترک، وگرنه سانس S) */
function collapseBoardRows(list: BoardRow[], showTitle: boolean, showFirst: boolean): MergedCell[] {
  return groupIntoMerged<BoardRow & { uid: number }>(
    list.map((r, i) => ({ ...r, uid: i })),
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
        profs: profDisplay(m, showTitle, showFirst), groupLabel: faDigits(m.groupNumber),
        enrolled: Number(m.enrolledCount) || 0,
      };
    }
    const codes = [...new Set(g.members.map(m => String(m.courseCode ?? '').trim()).filter(Boolean))];
    const profs = [...new Set(g.members.map(m => profDisplay(m, showTitle, showFirst)).filter(Boolean))];
    const groups = [...new Set(g.members.map(m => m.groupNumber))].sort((a, b) => a - b);
    const enrolled = g.members.reduce((s, m) => s + (Number(m.enrolledCount) || 0), 0);
    return {
      ...g.members[0], merged: true as const, codes: codes.join(' / '),
      profs: profs.join('، '), groupLabel: groups.map(faDigits).join('، '), enrolled,
    };
  });
}

type CellT = MergedCell & { start: number; end: number };
type Placed = { cell: CellT; first: number; span: number };

/** چیدمان تقویمی دقیق: هر سانس یک بلوک با rowSpan روی سطرهای ساعتی ۸ تا ۲۰ */
function placeBoardCells(merged: MergedCell[]): { placedByDay: Placed[][]; outside: CellT[] } {
  const placedByDay: Placed[][] = Array.from({ length: 7 }, () => []);
  const outside: CellT[] = [];
  for (const r of merged) {
    const d = r.dayOfWeek == null ? -1 : Number(r.dayOfWeek);
    if (d < 0 || d > 6) continue;
    const start = toMin(r.startTime), end = toMin(r.endTime);
    if (!(end > start)) { outside.push({ ...r, start, end }); continue; }
    const hits: number[] = [];
    for (let hi = 0; hi < HOURS.length; hi++) {
      if (start < (8 + hi + 1) * 60 && end > (8 + hi) * 60) hits.push(hi);
    }
    if (!hits.length) { outside.push({ ...r, start, end }); continue; }
    placedByDay[d].push({ cell: { ...r, start, end }, first: hits[0], span: hits.length });
  }
  for (const list of placedByDay) list.sort((a, b) => a.first - b.first || a.cell.start - b.cell.start);
  return { placedByDay, outside };
}

/** جدول تقویمی + فهرست خارج‌بازه — مشترک تابلوی کلاس‌ها و تب‌های استاد/دانشجو */
function BoardGrid({ placedByDay, outside, big, showRoom }: {
  placedByDay: Placed[][]; outside: CellT[]; big?: boolean; showRoom?: boolean;
}) {
  return (
    <>
      <table className={`w-full border-collapse ${big ? 'text-sm' : 'text-[11px]'}`}>
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
                const p = placedByDay[di].find(x => x.first === hi);
                if (p) {
                  const c = p.cell;
                  return (
                    <td key={di} rowSpan={p.span} className="border border-slate-200 p-1 align-top bg-white" style={{ minHeight: 46 }}>
                      <div className={`rounded border-r-4 px-2 py-1 leading-6 ${c.merged ? 'bg-amber-50 border-amber-500' : 'bg-indigo-50 border-indigo-500'} ${big ? 'text-sm' : 'text-[11px]'}`}>
                        <div className="font-black text-slate-900">🕗 از {fmtClock(c.start)} تا {fmtClock(c.end)}</div>
                        <div><b>{c.codes} {c.courseTitle}</b> گروه {c.groupLabel}
                          {c.merged && <span className="mr-1 rounded bg-amber-200 px-1 text-[10px] font-black">🔗 ادغامی</span>}
                        </div>
                        {showRoom && <div className="text-slate-500">{c.roomName || '—'}{c.buildingName ? ` (${c.buildingName})` : ''}</div>}
                        <div className="text-slate-600">{c.profs} · {faDigits(c.enrolled)} نفر</div>
                      </div>
                    </td>
                  );
                }
                const covered = placedByDay[di].some(x => hi > x.first && hi < x.first + x.span);
                if (covered) return null;
                return <td key={di} className="border border-slate-200 p-0.5 align-top" style={{ minHeight: 46 }} />;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {outside.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
          <b>⏰ خارج از بازهٔ ۸ تا ۲۰:</b>
          <ul className="mt-1 space-y-0.5">
            {outside.map((c, i) => (
              <li key={i}>{DAY_NAMES[Number(c.dayOfWeek)] ?? ''} — {c.codes} {c.courseTitle} (از {fmtClock(c.start)} تا {fmtClock(c.end)} · {c.roomName || '—'})</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

  const mergedCells = collapseBoardRows(rows, showTitle, showFirst);
  const { placedByDay, outside } = placeBoardCells(mergedCells);

  // ── تب‌های برنامهٔ استاد / دانشجو (جست‌وجو با کد استادی / شماره دانشجویی) ──
  type PersonInfo = { kind: 'prof' | 'student'; name: string; code: string; extra: string };
  let personInfo: PersonInfo | null = null;
  let personSearched = false;
  let personRows: BoardRow[] = [];
  if ((tab === 'prof' || tab === 'student') && q && term) {
    personSearched = true;
    const scope = await scopeConds(user.roles, 0, 0);
    if (tab === 'prof') {
      const [p] = await db.select({
        id: staff.id, staffCode: staff.staffCode,
        firstName: users.firstName, lastName: users.lastName,
        rank: staff.academicRank, gender: users.gender, legacyTitle: staff.title,
        deptName: departments.name,
      }).from(staff)
        .innerJoin(users, eq(users.id, staff.userId))
        .leftJoin(departments, eq(departments.id, staff.departmentId))
        .where(and(eq(staff.staffCode, q), uni ? eq(users.universityId, uni.id) : undefined))
        .limit(1);
      if (p) {
        personInfo = {
          kind: 'prof', code: p.staffCode,
          name: profDisplay({ profFirstName: p.firstName, profLastName: p.lastName, profRank: p.rank, profGender: p.gender, profLegacyTitle: p.legacyTitle }, showTitle, showFirst),
          extra: p.deptName || '',
        };
        const coIds = (await db.select({ offeringId: offering_professors.offeringId })
          .from(offering_professors).where(eq(offering_professors.staffId, p.id))).map(r => r.offeringId);
        personRows = await db.select(boardSelect)
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
            coIds.length
              ? or(eq(course_offerings.professorId, p.id), inArray(course_offerings.id, coIds))
              : eq(course_offerings.professorId, p.id),
            ...scope,
          ))
          .orderBy(asc(courses.title), asc(course_offerings.groupNumber));
      }
    } else {
      const [s] = await db.select({
        id: students.id, code: students.studentCode,
        firstName: users.firstName, lastName: users.lastName, majorName: majors.name,
      }).from(students)
        .innerJoin(users, eq(users.id, students.userId))
        .leftJoin(majors, eq(majors.id, students.majorId))
        .where(and(eq(students.studentCode, q), uni ? eq(students.universityId, uni.id) : undefined))
        .limit(1);
      if (s) {
        personInfo = {
          kind: 'student', code: s.code,
          name: `${s.firstName || ''} ${s.lastName || ''}`.trim() || '—',
          extra: s.majorName || '',
        };
        const offIds = (await db.select({ offeringId: enrollments.offeringId })
          .from(enrollments)
          .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
          .where(and(
            eq(enrollments.studentId, s.id),
            eq(course_offerings.termId, term.id),
            inArray(enrollments.status, ['REGISTERED', 'FINALIZED', 'WAITLISTED', 'PENDING_COUNCIL']),
          ))).map(r => r.offeringId);
        if (offIds.length) {
          personRows = await db.select(boardSelect)
            .from(schedules)
            .innerJoin(course_offerings, eq(course_offerings.id, schedules.offeringId))
            .innerJoin(courses, eq(courses.id, course_offerings.courseId))
            .leftJoin(staff, eq(staff.id, course_offerings.professorId))
            .leftJoin(users, eq(users.id, staff.userId))
            .leftJoin(classrooms, eq(classrooms.id, schedules.roomId))
            .where(and(
              eq(schedules.scheduleType, 'CLASS'),
              inArray(course_offerings.id, offIds),
              eq(course_offerings.isActive, 1),
              ...scope,
            ))
            .orderBy(asc(courses.title), asc(course_offerings.groupNumber));
        }
      }
    }
  }
  const personMerged = collapseBoardRows(personRows, showTitle, showFirst);
  const personPlaced = placeBoardCells(personMerged);

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
      {/* تب‌ها: تابلوی کلاس‌ها / برنامهٔ استاد / برنامهٔ دانشجو */}
      <div className="card flex flex-wrap gap-2 print:hidden">
        {([['board', '🗓 تابلوی کلاس‌ها'], ['prof', '👨‍🏫 برنامهٔ استاد'], ['student', '🎓 برنامهٔ دانشجو']] as const).map(([v, t]) => (
          <a
            key={v}
            href={`/admin/weekly-board?term=${term?.id ?? ''}&tab=${v}`}
            className={`rounded-xl px-4 py-2 text-sm font-black ${tab === v ? 'bg-teal-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            {t}
          </a>
        ))}
      </div>

      {tab === 'board' ? (
      <>
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
              <h1 className="text-2xl font-black text-slate-900">🚪 برنامهٔ هفتگی {withPrefix('کلاس', poster.name)}</h1>
              <p className="text-base font-black text-slate-800 mt-2">
                {headerFaculty ? `${withPrefix('دانشکدهٔ', headerFaculty)} · ` : ''}{withPrefix('نیمسال', term.title)}{poster.buildingName ? ` · ${poster.buildingName}` : ''}
              </p>
              <p className="text-sm font-bold text-slate-600 mt-1">
                {withPrefix('دانشگاه', uni?.title ?? '')}
              </p>
            </div>
          ) : (
            <div className="text-center">
              <div className="flex items-center justify-center gap-2">
                {logoUrl && <img src={logoUrl} alt="ارم دانشگاه" className="h-10 w-10 object-contain" />}
                <h1 className="text-base font-black text-slate-900">برنامهٔ هفتگی کلاس‌ها — {term.title}</h1>
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
                    const p = placedByDay[di].find(x => x.first === hi);
                    if (p) {
                      const c = p.cell;
                      return (
                        <td key={di} rowSpan={p.span} className="border border-slate-200 p-1 align-top bg-white" style={{ minHeight: 46 }}>
                          <div className={`rounded border-r-4 px-2 py-1 leading-6 ${c.merged ? 'bg-amber-50 border-amber-500' : 'bg-indigo-50 border-indigo-500'} ${poster ? 'text-sm' : 'text-[11px]'}`}>
                            <div className="font-black text-slate-900">🕗 از {fmtClock(c.start)} تا {fmtClock(c.end)}</div>
                            <div><b>{c.codes} {c.courseTitle}</b> گروه {c.groupLabel}
                              {c.merged && <span className="mr-1 rounded bg-amber-200 px-1 text-[10px] font-black">🔗 ادغامی</span>}
                            </div>
                            {!poster && <div className="text-slate-500">{c.roomName || '—'}{c.buildingName ? ` (${c.buildingName})` : ''}</div>}
                            <div className="text-slate-600">{c.profs} · {faDigits(c.enrolled)} نفر</div>
                          </div>
                        </td>
                      );
                    }
                    const covered = placedByDay[di].some(x => hi > x.first && hi < x.first + x.span);
                    if (covered) return null;
                    return <td key={di} className="border border-slate-200 p-0.5 align-top" style={{ minHeight: 46 }} />;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {outside.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
              <b>⏰ خارج از بازهٔ ۸ تا ۲۰:</b>
              <ul className="mt-1 space-y-0.5">
                {outside.map((c, i) => (
                  <li key={i}>{DAY_NAMES[Number(c.dayOfWeek)] ?? ''} — {c.codes} {c.courseTitle} (از {fmtClock(c.start)} تا {fmtClock(c.end)} · {c.roomName || '—'})</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      </>
      ) : (
      <>
      <form method="get" className="card flex flex-wrap items-end gap-3 print:hidden">
        <input type="hidden" name="tab" value={tab} />
        <input type="hidden" name="term" value={term?.id ?? ''} />
        <label className="text-xs font-bold">{tab === 'prof' ? 'کد استادی' : 'شماره دانشجویی'}
          <input name="q" defaultValue={q} dir="ltr" placeholder={tab === 'prof' ? 'مثل ۱۰۰۱' : 'مثل ۴۰۲…'} className="block mt-1 border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white font-mono" />
        </label>
        <button className="rounded-xl bg-indigo-700 px-5 py-2 text-white font-black text-sm">جست‌وجو</button>
        <PrintButton />
      </form>

      {term && personSearched && personInfo && (
        <div className="print-area rounded-2xl border border-slate-300 bg-white p-4 space-y-3 overflow-x-auto" dir="rtl">
          <div className="text-center border-b-4 border-double border-slate-800 pb-3">
            <div className="flex items-center justify-center gap-2">
              {logoUrl && <img src={logoUrl} alt="ارم دانشگاه" className="h-14 w-14 object-contain" />}
              <h1 className="text-xl font-black text-slate-900">
                {personInfo.kind === 'prof' ? '👨‍🏫 برنامهٔ هفتگی استاد' : '🎓 برنامهٔ هفتگی دانشجو'}
              </h1>
            </div>
            <p className="text-lg font-black text-slate-800 mt-1">{personInfo.name}</p>
            <p className="text-sm font-bold text-slate-600 mt-1">
              {personInfo.kind === 'prof' ? 'کد استادی' : 'شماره دانشجویی'} {faDigits(personInfo.code)}
              {personInfo.extra ? ` · ${personInfo.extra}` : ''} · {term.title} · دانشگاه {uni?.title ?? ''}
            </p>
          </div>
          <BoardGrid placedByDay={personPlaced.placedByDay} outside={personPlaced.outside} showRoom />
        </div>
      )}
      {term && personSearched && !personInfo && (
        <div className="card p-6 text-center text-sm font-bold text-rose-700">
          {tab === 'prof' ? 'استادی با این کد در این دانشگاه یافت نشد.' : 'دانشجویی با این شماره در این دانشگاه یافت نشد.'}
        </div>
      )}
      {term && !personSearched && (
        <div className="card p-6 text-center text-sm text-slate-500">
          {tab === 'prof' ? 'کد استادی را وارد و جست‌وجو کنید تا برنامهٔ هفتگی تدریس نمایش داده شود.' : 'شماره دانشجویی را وارد و جست‌وجو کنید تا برنامهٔ هفتگی کلاس‌ها نمایش داده شود.'}
        </div>
      )}
      </>
      )}
    </div>
  );
}

async function scopeConds(roles: string[], deptId: number, facultyId: number): Promise<any[]> {
  const c: any[] = [];
  if (deptId) c.push(eq(courses.departmentId, deptId));
  else if (facultyId) {
    const ids = (await db.select({ id: departments.id }).from(departments).where(eq(departments.facultyId, facultyId))).map(r => r.id);
    // fail-closed: دانشکدهٔ بدون گروه یعنی «هیچ» — نه «همه» (باگ نمایش همهٔ دانشکده‌ها)
    c.push(ids.length ? inArray(courses.departmentId, ids) : sql`1=0`);
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