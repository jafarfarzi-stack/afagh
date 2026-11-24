import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms, class_sessions, course_offerings, courses, departments, enrollments,
  faculties, schedules, student_class_attendance, students, users,
} from '@/db/schema';
import { requireRoleOrPermission } from '@/lib/permissions-enforcer';
import { getCurrentUniversity } from '@/lib/university-scope';
import { faDigits } from '@/lib/calendar';
import { jalaliDateOf } from '@/lib/scheduling-core';
import { groupIntoMerged, mergedDisplayTitle, mergedGroupKey } from '@/lib/professor-data';
import { getReportPrintBrand } from '@/lib/report-print-brand';
import AttendanceControls, { type PickerOffering, type PickerTerm } from './controls';
import PersonPhoto from '../students/components/PersonPhoto';

export const dynamic = 'force-dynamic';

/**
 * صدور لیست حضور و غیاب یک کلاس — از کارتابل مدیریت.
 *
 *  · کلاس‌های ادغامی (sharedScheduleGroupKey / برنامهٔ هفتگی مشترک) یک لیست مشترک می‌گیرند:
 *    یک سربرگ، فهرست ترکیبی دانشجویان همهٔ اعضا و ستون جلسات بدون تکرار.
 *  · دو قالب چاپ: ماتریس جلسات (پیش‌فرض) یا «عکسدار» (چک‌باکس در نوار کنترل).
 *  · جستجوی درس/استاد و فیلتر دانشکده/گروه آموزشی در نوار کنترل (کلاینت).
 *
 * این صفحه فقط می‌خواند؛ ثبتِ حضور همچنان کارِ استاد در کارتابل خودش است.
 * گارد نقش همان «کنترل حضور و غیاب کلاس‌ها» است تا دسترسی جدیدی باز نشود.
 */

const ATT_ROLES = ['ADMIN', 'EDU_EXPERT', 'ATTENDANCE_CONTROLLER'] as const;
const ATT_PERMISSION = ['edu:attendance_control'];

/** نشانهٔ وضعیت حضور در چاپ — تک‌نویسه و کاغذدوست (سیاه‌وسفید) */
const MARKS: { [k: string]: string } = { PRESENT: '✓', ABSENT: '✗', LATE: 'ت', EXCUSED: 'م' };
const MAX_PHOTO_SESSION_COLS = 12;

/** کلید جلسهٔ فیزیکی — جلسات هم‌زمان اعضای کلاس ادغامی یکی می‌شوند */
const sessionDedupKey = (s: { sessionDate: string; startTime: string; endTime: string; replacedSessionId: number | null; isMakeUpSession: number | null }) =>
  `${s.sessionDate}|${s.startTime}|${s.endTime}|${s.replacedSessionId ?? 0}|${s.isMakeUpSession ?? 0}`;

const jalaliShort = (s: string) => {
  const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec((s || '').trim());
  return m ? `${m[2]}/${m[3]}` : (s || '');
};

type ClassGroup = {
  primaryId: number;
  merged: boolean;
  memberIds: number[];
  title: string;
  displayTitle: string;
  codes: string;
  groupNumber: number | null;
  faculty: string;
  department: string;
  profs: string;
  profCodes: string;
};

export default async function AttendanceListPage({ searchParams }: { searchParams?: Promise<{ term?: string; cid?: string; photos?: string }> }) {
  await requireRoleOrPermission([...ATT_ROLES], [...ATT_PERMISSION]);
  const uni = await getCurrentUniversity().catch(() => null);
  const universityId = uni?.id ?? null;
  const sp: { term?: string; cid?: string; photos?: string } = (await searchParams) ?? {};
  const photos = sp.photos === '1';
  const brand = await getReportPrintBrand('attendance-list', universityId);

  // ── ترم‌ها: جدیدترین اول؛ پیش‌فرض = ترم جاری ──
  const termRows: PickerTerm[] = await db
    .select({ id: academic_terms.id, title: academic_terms.title, isCurrent: academic_terms.isCurrent })
    .from(academic_terms)
    .where(universityId ? eq(academic_terms.universityId, universityId) : undefined)
    .orderBy(sql`"sortOrder" DESC NULLS LAST`, sql`id DESC`)
    .limit(60);
  const currentTerm = termRows.find(t => t.isCurrent === 1) ?? termRows[0];
  const termParam = Number(sp.term);
  const selectedTerm = Number.isInteger(termParam) && termRows.some(t => t.id === termParam) ? termParam : currentTerm?.id;
  const termTitle = termRows.find(t => t.id === selectedTerm)?.title ?? '';

  // ── همهٔ کلاس‌های ترم + اساتید (نام و کد) + دانشکده/گروه آموزشی ──
  const offeringRows = selectedTerm
    ? await db
        .select({
          id: course_offerings.id,
          termId: course_offerings.termId,
          groupNumber: course_offerings.groupNumber,
          sharedKey: course_offerings.sharedScheduleGroupKey,
          title: courses.title,
          code: courses.code,
          department: departments.name,
          faculty: faculties.name,
          profs: sql<string>`COALESCE(
            (select string_agg(u2."firstName" || ' ' || u2."lastName", ' ، ' order by u2."lastName")
             from offering_professors op
             join staff st2 on st2.id = op."staffId"
             join users u2 on u2.id = st2."userId"
             where op."offeringId" = course_offerings.id),
            (select u3."firstName" || ' ' || u3."lastName"
             from staff st3 join users u3 on u3.id = st3."userId"
             where st3.id = course_offerings."professorId")
          )`,
          profCodes: sql<string>`COALESCE(
            (select string_agg(st2."staffCode", ' ، ' order by st2."staffCode")
             from offering_professors op
             join staff st2 on st2.id = op."staffId"
             where op."offeringId" = course_offerings.id),
            (select st3."staffCode" from staff st3 where st3.id = course_offerings."professorId")
          )`,
        })
        .from(course_offerings)
        .innerJoin(courses, eq(courses.id, course_offerings.courseId))
        .leftJoin(departments, eq(departments.id, courses.departmentId))
        .leftJoin(faculties, eq(faculties.id, departments.facultyId))
        .where(and(
          eq(course_offerings.termId, selectedTerm),
          universityId ? eq(course_offerings.universityId, universityId) : undefined,
          eq(course_offerings.isActive, 1),
        ))
        .orderBy(asc(courses.title), asc(course_offerings.groupNumber), asc(course_offerings.id))
    : [];

  // برنامهٔ هفتگی CLASS برای کلید ادغام (الگوی کارتابل استاد)
  const offeringIds = offeringRows.map(o => o.id);
  const schedRows = offeringIds.length
    ? await db
        .select({ offeringId: schedules.offeringId, dayOfWeek: schedules.dayOfWeek, startTime: schedules.startTime, endTime: schedules.endTime, roomId: schedules.roomId })
        .from(schedules)
        .where(and(inArray(schedules.offeringId, offeringIds), eq(schedules.scheduleType, 'CLASS')))
    : [];
  const classSlotsByOffering = new Map<number, { dayOfWeek: number | null; startTime: string | null; endTime: string | null; roomKey: number | null }[]>();
  for (const r of schedRows) {
    const list = classSlotsByOffering.get(r.offeringId) ?? [];
    list.push({ dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime, roomKey: r.roomId });
    classSlotsByOffering.set(r.offeringId, list);
  }

  // ── گروه‌بندی کلاس‌های ادغامی — یک لیست خروجی برای کل گروه ──
  const groups: ClassGroup[] = groupIntoMerged(
    offeringRows,
    o => o.id,
    o => {
      const k = mergedGroupKey(o.sharedKey ?? null, classSlotsByOffering.get(o.id) ?? []);
      return k ? `${o.termId}|${k}` : null;
    },
  ).map(g => {
    const primary = g.members[0];
    const codes = [...new Set(g.members.map(m => m.code))];
    return {
      primaryId: g.primaryId,
      merged: g.merged,
      memberIds: g.memberIds,
      title: primary.title,
      displayTitle: g.merged ? mergedDisplayTitle(primary.title, codes) : primary.title,
      codes: codes.join('، '),
      groupNumber: primary.groupNumber,
      faculty: primary.faculty ?? '',
      department: primary.department ?? '',
      profs: [...new Set(g.members.map(m => m.profs).filter(Boolean))].join(' ، '),
      profCodes: [...new Set(g.members.map(m => m.profCodes).filter(Boolean))].join(' ، '),
    };
  });

  const cidParam = Number(sp.cid);
  const chosen = Number.isInteger(cidParam)
    ? groups.find(g => g.primaryId === cidParam) ?? null
    : groups[0] ?? null;

  // ── جلساتِ گروه (بدون تکرارِ جلسهٔ فیزیکی)، ثبت‌نامی‌ها و حضور اعضا ──
  const memberIds = chosen?.memberIds ?? [];
  const rawSessions = memberIds.length
    ? await db
        .select({
          id: class_sessions.id, offeringId: class_sessions.offeringId, sessionNo: class_sessions.sessionNo,
          sessionDate: class_sessions.sessionDate, startTime: class_sessions.startTime, endTime: class_sessions.endTime,
          replacedSessionId: class_sessions.replacedSessionId, isMakeUpSession: class_sessions.isMakeUpSession,
        })
        .from(class_sessions)
        .where(and(inArray(class_sessions.offeringId, memberIds), eq(class_sessions.isActive, 1)))
    : [];
  // جلسهٔ ارائهٔ اصلی اولویت دارد؛ بقیهٔ اعضا بعد
  rawSessions.sort((a, b) =>
    (a.offeringId === chosen!.primaryId ? 0 : 1) - (b.offeringId === chosen!.primaryId ? 0 : 1)
    || (a.sessionNo ?? 0) - (b.sessionNo ?? 0) || a.id - b.id);
  const seenKeys = new Set<string>();
  const columns: { key: string; sessionNo: number | null; sessionDate: string; isMakeUp: boolean }[] = [];
  const keyBySessionId = new Map<number, string>();
  for (const s of rawSessions) {
    const k = sessionDedupKey(s);
    keyBySessionId.set(s.id, k);
    if (seenKeys.has(k)) continue;
    seenKeys.add(k);
    columns.push({ key: k, sessionNo: s.sessionNo, sessionDate: s.sessionDate, isMakeUp: s.isMakeUpSession === 1 });
  }

  const rosterRows = memberIds.length
    ? await db
        .select({
          studentId: enrollments.studentId,
          studentCode: students.studentCode,
          userId: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          photoKey: users.photoKey,
        })
        .from(enrollments)
        .innerJoin(students, eq(students.id, enrollments.studentId))
        .innerJoin(users, eq(users.id, students.userId))
        .where(and(
          inArray(enrollments.offeringId, memberIds),
          inArray(enrollments.status, ['REGISTERED', 'PENDING_COUNCIL']),
        ))
    : [];
  const seenStudents = new Set<number>();
  const roster = rosterRows.filter(r => {
    if (seenStudents.has(r.studentId)) return false;
    seenStudents.add(r.studentId);
    return true;
  }).sort((a, b) =>
    (a.lastName ?? '').trim().localeCompare((b.lastName ?? '').trim(), 'fa')
    || `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim().localeCompare(`${b.firstName ?? ''} ${b.lastName ?? ''}`.trim(), 'fa'));

  const sessionIds = [...keyBySessionId.keys()];
  const attRows = sessionIds.length && roster.length
    ? await db
        .select({
          sessionId: student_class_attendance.sessionId,
          studentId: enrollments.studentId,
          status: student_class_attendance.status,
          lateMinutes: student_class_attendance.lateMinutes,
        })
        .from(student_class_attendance)
        .innerJoin(enrollments, eq(enrollments.id, student_class_attendance.enrollmentId))
        .where(inArray(student_class_attendance.sessionId, sessionIds))
    : [];
  const att = new Map<string, { status: string; lateMinutes: number | null }>();
  for (const r of attRows) {
    const k = keyBySessionId.get(r.sessionId);
    if (!k) continue;
    att.set(`${k}:${r.studentId}`, { status: r.status, lateMinutes: r.lateMinutes });
  }

  const pickerItems: PickerOffering[] = groups.map(g => ({
    id: g.primaryId,
    displayTitle: g.displayTitle,
    codes: g.codes,
    groupNumber: g.groupNumber,
    faculty: g.faculty,
    department: g.department,
    profs: g.profs,
    profCodes: g.profCodes,
    mergedCount: g.memberIds.length,
  }));
  const photoCols = columns.slice(0, MAX_PHOTO_SESSION_COLS);
  const todayJ = jalaliDateOf(new Date());

  const sheetHeader = (
    <div className="attl-head">
      <div className="flex items-center justify-center gap-3">
        {brand.universityLogoUrl ? (
          <img src={brand.universityLogoUrl} alt="آرم دانشگاه" className="attl-logo" />
        ) : (
          <span className="attl-logo-ph">ارم دانشگاه</span>
        )}
        <div className="min-w-0">
          <div className="attl-uni">{brand.universityTitle || 'دانشگاه'}</div>
          <div className="attl-title">{photos ? 'لیست حضور و غیاب (همراه عکس)' : 'لیست حضور و غیاب'}</div>
          {chosen && (
            <div className="attl-meta">
              <span>{chosen.displayTitle} ({chosen.codes})</span>
              {chosen.merged && <span className="attl-badge">ادغامی × {faDigits(String(chosen.memberIds.length))}</span>}
              {chosen.groupNumber != null && <span>— گروه {faDigits(String(chosen.groupNumber))}</span>}
              <span className="attl-sep">|</span>
              <span>استاد: {chosen.profs || '—'}{chosen.profCodes ? ` (${chosen.profCodes})` : ''}</span>
            </div>
          )}
          <div className="attl-meta attl-meta2">
            <span>{termTitle}</span>
            <span className="attl-sep">|</span>
            <span>تعداد جلسات: {faDigits(String(columns.length))}</span>
            <span className="attl-sep">|</span>
            <span>تعداد دانشجو: {faDigits(String(roster.length))}</span>
            <span className="attl-sep">|</span>
            <span>تاریخ چاپ: {faDigits(todayJ)}</span>
            {chosen?.faculty && <span className="attl-sep">|</span>}
            {chosen?.faculty && <span>{chosen.department ? `${chosen.faculty} — ${chosen.department}` : chosen.faculty}</span>}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <AttendanceControls
        terms={termRows}
        offerings={pickerItems}
        selectedTerm={selectedTerm ?? null}
        selectedCid={chosen?.primaryId ?? null}
        photos={photos}
      />

      {!selectedTerm || !chosen ? (
        <div className="card text-center p-8 text-slate-500 text-sm print:hidden">ابتدا نیمسال و کلاس را انتخاب کنید.</div>
      ) : roster.length === 0 ? (
        <div className="card text-center p-8 text-slate-500 text-sm print:hidden">برای این کلاس ثبت‌نام فعالی وجود ندارد.</div>
      ) : (
        <div className="print-area">
          <style>{`
            @media print {
              @page { size: A4 ${photos ? 'portrait' : 'landscape'}; margin: 8mm; }
            }
            .attl-head { border: 1.5px solid #334155; border-radius: 6px; padding: 6px 10px; margin-bottom: 6px; text-align: center; }
            .attl-logo { height: 14mm; width: 14mm; object-fit: contain; }
            .attl-logo-ph { display: inline-block; height: 12mm; width: 12mm; border: 1.5px dashed #94a3b8; border-radius: 4px; line-height: 12mm; font-size: 6.5pt; font-weight: 700; color: #94a3b8; }
            .attl-uni { font-weight: 900; font-size: 10.5pt; }
            .attl-title { font-weight: 900; font-size: 11pt; margin-top: 1px; }
            .attl-meta { font-size: 8.5pt; font-weight: 700; color: #1e293b; margin-top: 2px; }
            .attl-badge { display: inline-block; margin: 0 3px; padding: 0 4px; border: 1px solid #b45309; border-radius: 3px; color: #b45309; font-size: 7pt; }
            .attl-meta2 { color: #475569; font-size: 8pt; }
            .attl-sep { padding: 0 4px; color: #94a3b8; }
            table.attl { width: 100%; border-collapse: collapse; font-size: ${photos ? '8.5pt' : '7.5pt'}; }
            table.attl th, table.attl td { border: 1px solid #64748b; padding: ${photos ? '3px 4px' : '2px 3px'}; text-align: center; vertical-align: middle; }
            table.attl thead { display: table-header-group; }
            table.attl tr { break-inside: avoid; page-break-inside: avoid; }
            table.attl th { background: #f1f5f9; font-weight: 900; font-size: ${photos ? '8pt' : '7pt'}; line-height: 1.4; }
            .attl-name { text-align: right !important; font-weight: 700; white-space: nowrap; }
            .attl-code { direction: ltr; white-space: nowrap; }
            .attl-photo { width: 9mm; height: 12mm; }
            .attl-photo > div, .attl-photo > img { width: 9mm !important; height: 12mm !important; }
            .attl-sig { width: 22mm; }
            .attl-mk { font-size: 9pt; font-weight: 900; }
            .attl-sign-row td { height: 14mm; border: 0; text-align: right; font-size: 9pt; font-weight: 700; }
            .attl-legend { margin-top: 4px; font-size: 7.5pt; font-weight: 700; color: #475569; text-align: right; }
          `}</style>
          {sheetHeader}

          {!photos ? (
            <>
              <table className="attl">
                <thead>
                  <tr>
                    <th style={{ width: '7mm' }}>#</th>
                    <th style={{ width: '34mm' }}>نام و نام خانوادگی</th>
                    <th style={{ width: '20mm' }}>شماره دانشجویی</th>
                    {columns.map((c, i) => (
                      <th key={c.key} style={{ minWidth: '11mm' }}>
                        ج{faDigits(String(c.sessionNo ?? i + 1))}
                        <br />
                        <span style={{ fontWeight: 700, fontSize: '6.5pt' }}>{faDigits(jalaliShort(c.sessionDate))}{c.isMakeUp ? ' جبرانی' : ''}</span>
                      </th>
                    ))}
                    <th style={{ width: '9mm' }}>حاضر</th>
                    <th style={{ width: '9mm' }}>غایب</th>
                    <th style={{ width: '9mm' }}>تأخیر</th>
                    <th style={{ width: '9mm' }}>موجه</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((r, i) => {
                    const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
                    for (const c of columns) {
                      const cell = att.get(`${c.key}:${r.studentId}`);
                      if (cell && counts[cell.status as keyof typeof counts] !== undefined) counts[cell.status as keyof typeof counts] += 1;
                    }
                    return (
                      <tr key={r.studentId}>
                        <td>{faDigits(String(i + 1))}</td>
                        <td className="attl-name">{`${r.firstName ?? ''} ${r.lastName ?? ''}`.trim()}</td>
                        <td className="attl-code">{r.studentCode}</td>
                        {columns.map(c => {
                          const cell = att.get(`${c.key}:${r.studentId}`);
                          const mk = cell ? MARKS[cell.status] ?? '' : '';
                          return (
                            <td key={c.key}>
                              {mk ? <span className="attl-mk">{mk}{cell?.status === 'LATE' && cell.lateMinutes ? <sup>{faDigits(String(cell.lateMinutes))}</sup> : null}</span> : '—'}
                            </td>
                          );
                        })}
                        <td>{faDigits(String(counts.PRESENT))}</td>
                        <td>{faDigits(String(counts.ABSENT))}</td>
                        <td>{faDigits(String(counts.LATE))}</td>
                        <td>{faDigits(String(counts.EXCUSED))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="attl-legend">نشانه‌ها: ✓ حاضر — ✗ غایب — ت تأخیر (بالانویس: دقیقه) — م موجه — «—» ثبت نشده{chosen.merged ? ' — لیست مشترک کلاس ادغامی' : ''}</div>
            </>
          ) : (
            <>
              <table className="attl">
                <thead>
                  <tr>
                    <th style={{ width: '7mm' }}>#</th>
                    <th style={{ width: '12mm' }}>عکس</th>
                    <th style={{ width: '38mm' }}>نام و نام خانوادگی</th>
                    <th style={{ width: '20mm' }}>شماره دانشجویی</th>
                    {photoCols.map((c, i) => (
                      <th key={c.key} style={{ minWidth: '9mm' }}>
                        {faDigits(String(c.sessionNo ?? i + 1))}
                        <br />
                        <span style={{ fontWeight: 700, fontSize: '6.5pt' }}>{faDigits(jalaliShort(c.sessionDate))}</span>
                      </th>
                    ))}
                    {columns.length > photoCols.length && (
                      <th style={{ minWidth: '9mm' }}>… جلسات {faDigits(String(photoCols.length + 1))} به بعد</th>
                    )}
                    <th className="attl-sig">امضا</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((r, i) => (
                    <tr key={r.studentId}>
                      <td>{faDigits(String(i + 1))}</td>
                      <td className="attl-photo">
                        <PersonPhoto userId={r.userId} hasPhoto={!!r.photoKey} className="w-10 h-12" icon="👤" label="عکس" />
                      </td>
                      <td className="attl-name">{`${r.firstName ?? ''} ${r.lastName ?? ''}`.trim()}</td>
                      <td className="attl-code">{r.studentCode}</td>
                      {photoCols.map(c => <td key={c.key} />)}
                      {columns.length > photoCols.length && <td />}
                      <td />
                    </tr>
                  ))}
                </tbody>
              </table>
              {columns.length > photoCols.length && (
                <div className="attl-legend">ستون‌های جلسه به حداکثر {faDigits(String(MAX_PHOTO_SESSION_COLS))} ستون محدود است؛ جلسات بعدی را از چاپ بدون تیک (ماتریس) بگیرید.</div>
              )}
            </>
          )}

          <table className="attl">
            <tbody>
              <tr className="attl-sign-row">
                <td style={{ width: '50%' }}>امضای استاد درس</td>
                <td style={{ width: '50%' }}>امضای کارشناس آموزش</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
