import Link from 'next/link';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms, class_sessions, course_offerings, courses, enrollments,
  student_class_attendance, students, universities, users,
} from '@/db/schema';
import { requireRoleOrPermission } from '@/lib/permissions-enforcer';
import { getCurrentUniversity } from '@/lib/university-scope';
import { faDigits } from '@/lib/calendar';
import { jalaliDateOf } from '@/lib/scheduling-core';
import PrintButton from '@/components/PrintButton';
import PersonPhoto from '../students/components/PersonPhoto';

export const dynamic = 'force-dynamic';

/**
 * صدور لیست حضور و غیاب یک درس — از کارتابل مدیریت.
 *
 * دو قالب چاپ:
 *  · matrix  — همان حالتِ کارتابل استاد: ماتریس جلسات × دانشجویان با وضعیت ثبت‌شده
 *  · photos  — لیست همراه عکس دانشجویان (برای امضای حضوریِ دستی در کلاس)
 *
 * این صفحه فقط می‌خواند؛ ثبتِ حضور همچنان کارِ استاد در کارتابل خودش است.
 * گارد نقش همان «کنترل حضور و غیاب کلاس‌ها» است تا دسترسی جدیدی باز نشود.
 */

const ATT_ROLES = ['ADMIN', 'EDU_EXPERT', 'ATTENDANCE_CONTROLLER'] as const;
const ATT_PERMISSION = ['edu:attendance_control'];

/** نشانهٔ وضعیت حضور در چاپ — تک‌نویسه و کاغذدوست (سیاه‌وسفید) */
const MARKS: { [k: string]: string } = { PRESENT: '✓', ABSENT: '✗', LATE: 'ت', EXCUSED: 'م' };
const MAX_PHOTO_SESSION_COLS = 12;

type AttCell = { status: string; lateMinutes: number | null };
const cellKey = (sessionId: number, enrollmentId: number) => `${sessionId}:${enrollmentId}`;

const jalaliShort = (s: string) => {
  const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec((s || '').trim());
  return m ? `${m[2]}/${m[3]}` : (s || '');
};

export default async function AttendanceListPage({ searchParams }: { searchParams?: Promise<{ term?: string; offering?: string; format?: string }> }) {
  await requireRoleOrPermission([...ATT_ROLES], [...ATT_PERMISSION]);
  const uni = await getCurrentUniversity().catch(() => null);
  const universityId = uni?.id ?? null;
  const sp: { term?: string; offering?: string; format?: string } = (await searchParams) ?? {};

  // ── ترم‌ها: جدیدترین اول؛ پیش‌فرض = ترم جاری ──
  const termRows = await db
    .select({ id: academic_terms.id, title: academic_terms.title, isCurrent: academic_terms.isCurrent })
    .from(academic_terms)
    .where(universityId ? eq(academic_terms.universityId, universityId) : undefined)
    .orderBy(desc(academic_terms.sortOrder), desc(academic_terms.id))
    .limit(60);
  const currentTerm = termRows.find(t => t.isCurrent === 1) ?? termRows[0];
  const termParam = Number(sp.term);
  const selectedTerm = Number.isInteger(termParam) && termRows.some(t => t.id === termParam) ? termParam : currentTerm?.id;
  const termTitle = termRows.find(t => t.id === selectedTerm)?.title ?? '';

  const uniTitle = universityId
    ? (await db.select({ title: universities.title }).from(universities).where(eq(universities.id, universityId)).limit(1))[0]?.title ?? ''
    : '';

  // ── ارائه‌های ترم + اساتید هر کلاس ──
  const offeringRows = selectedTerm
    ? await db
        .select({
          id: course_offerings.id,
          title: courses.title,
          code: courses.code,
          groupNumber: course_offerings.groupNumber,
          profs: sql<string>`(
            select string_agg(u2."firstName" || ' ' || u2."lastName", ' ، ' order by u2."lastName")
            from offering_professors op
            join staff st2 on st2.id = op."staffId"
            join users u2 on u2.id = st2."userId"
            where op."offeringId" = course_offerings.id
          )`,
        })
        .from(course_offerings)
        .innerJoin(courses, eq(courses.id, course_offerings.courseId))
        .where(and(
          eq(course_offerings.termId, selectedTerm),
          universityId ? eq(course_offerings.universityId, universityId) : undefined,
          eq(course_offerings.isActive, 1),
        ))
        .orderBy(asc(courses.title), asc(course_offerings.groupNumber), asc(course_offerings.id))
    : [];
  const offeringParam = Number(sp.offering);
  const selectedOffering = Number.isInteger(offeringParam) && offeringRows.some(o => o.id === offeringParam)
    ? offeringParam
    : offeringRows[0]?.id;
  const chosen = offeringRows.find(o => o.id === selectedOffering) ?? null;

  // ── جلسات، ثبت‌نامی‌ها و رکوردهای حضورِ ارائهٔ انتخابی ──
  const sessionRows = selectedOffering
    ? await db
        .select({ id: class_sessions.id, sessionNo: class_sessions.sessionNo, sessionDate: class_sessions.sessionDate, isMakeUpSession: class_sessions.isMakeUpSession })
        .from(class_sessions)
        .where(and(eq(class_sessions.offeringId, selectedOffering), eq(class_sessions.isActive, 1)))
        .orderBy(asc(class_sessions.sessionNo), asc(class_sessions.id))
    : [];

  const rosterRows = selectedOffering
    ? await db
        .select({
          enrollmentId: enrollments.id,
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
          eq(enrollments.offeringId, selectedOffering),
          inArray(enrollments.status, ['REGISTERED', 'PENDING_COUNCIL']),
        ))
    : [];
  // مرتب‌سازی بر اساس نام خانوادگی (مطابق کارتابل استاد)
  const roster = [...rosterRows].sort((a, b) =>
    (a.lastName ?? '').trim().localeCompare((b.lastName ?? '').trim(), 'fa')
    || `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim().localeCompare(`${b.firstName ?? ''} ${b.lastName ?? ''}`.trim(), 'fa'));

  const attRows = sessionRows.length && roster.length
    ? await db
        .select({ sessionId: student_class_attendance.sessionId, enrollmentId: student_class_attendance.enrollmentId, status: student_class_attendance.status, lateMinutes: student_class_attendance.lateMinutes })
        .from(student_class_attendance)
        .where(inArray(student_class_attendance.sessionId, sessionRows.map(s => s.id)))
    : [];
  const att = new Map<string, AttCell>();
  for (const r of attRows) att.set(cellKey(r.sessionId, r.enrollmentId), { status: r.status, lateMinutes: r.lateMinutes });

  const format = sp.format === 'photos' ? 'photos' : 'matrix';
  const buildHref = (f: string) => `/admin/attendance-list?term=${selectedTerm ?? ''}&offering=${selectedOffering ?? ''}&format=${f}`;
  const photoCols = sessionRows.slice(0, MAX_PHOTO_SESSION_COLS);
  const todayJ = jalaliDateOf(new Date());

  const sheetHeader = (
    <div className="attl-head">
      <div className="attl-uni">{uniTitle || 'دانشگاه'}</div>
      <div className="attl-title">{format === 'photos' ? 'لیست حضور و غیاب (همراه عکس)' : 'لیست حضور و غیاب'}</div>
      {chosen && (
        <div className="attl-meta">
          <span>{termTitle}</span>
          <span className="attl-sep">|</span>
          <span>{chosen.title} ({chosen.code}) — گروه {faDigits(String(chosen.groupNumber ?? ''))}</span>
          <span className="attl-sep">|</span>
          <span>استاد: {chosen.profs || '—'}</span>
        </div>
      )}
      <div className="attl-meta attl-meta2">
        <span>تعداد جلسات: {faDigits(String(sessionRows.length))}</span>
        <span className="attl-sep">|</span>
        <span>تعداد دانشجو: {faDigits(String(roster.length))}</span>
        <span className="attl-sep">|</span>
        <span>تاریخ چاپ: {faDigits(todayJ)}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* ═══ نوار کنترل — فقط روی صفحه، در چاپ نمی‌آید ═══ */}
      <div className="card p-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-sm font-black text-slate-900 sm:text-base">صدور لیست حضور و غیاب</h1>
            <p className="mt-0.5 text-2xs font-bold text-slate-500">انتخاب نیمسال و درس، سپس چاپ در یکی از دو قالب — ماتریس جلسات یا لیست همراه عکس</p>
          </div>
          <PrintButton />
        </div>
        <form method="get" className="mt-3 flex flex-wrap items-center gap-2">
          <select name="term" defaultValue={selectedTerm ?? ''} className="border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900">
            {termRows.map(t => (
              <option key={t.id} value={t.id}>{t.title}{t.isCurrent === 1 ? ' (جاری)' : ''}</option>
            ))}
          </select>
          <select name="offering" defaultValue={selectedOffering ?? ''} className="max-w-72 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900">
            {offeringRows.map(o => (
              <option key={o.id} value={o.id}>{o.code} — {o.title} (گروه {faDigits(String(o.groupNumber ?? ''))})</option>
            ))}
          </select>
          <input type="hidden" name="format" value={format} />
          <button type="submit" className="rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-xs font-bold px-4 py-2 transition">نمایش</button>
          <span className="flex overflow-hidden rounded-xl border border-slate-300 text-xs font-bold">
            <Link href={buildHref('matrix')} className={`px-3 py-2 transition ${format === 'matrix' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>قالب ماتریس جلسات</Link>
            <Link href={buildHref('photos')} className={`px-3 py-2 transition ${format === 'photos' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>قالب همراه عکس</Link>
          </span>
        </form>
      </div>

      {!selectedTerm || !chosen ? (
        <div className="card text-center p-8 text-slate-500 text-sm print:hidden">ابتدا نیمسال و درس را انتخاب کنید.</div>
      ) : roster.length === 0 ? (
        <div className="card text-center p-8 text-slate-500 text-sm print:hidden">برای این درس ثبت‌نام فعالی وجود ندارد.</div>
      ) : (
        <div className="print-area">
          <style>{`
            @media print {
              @page { size: A4 ${format === 'photos' ? 'portrait' : 'landscape'}; margin: 8mm; }
            }
            .attl-head { border: 1.5px solid #334155; border-radius: 6px; padding: 6px 10px; margin-bottom: 6px; text-align: center; }
            .attl-uni { font-weight: 900; font-size: 10.5pt; }
            .attl-title { font-weight: 900; font-size: 11pt; margin-top: 1px; }
            .attl-meta { font-size: 8.5pt; font-weight: 700; color: #1e293b; margin-top: 2px; }
            .attl-meta2 { color: #475569; font-size: 8pt; }
            .attl-sep { padding: 0 4px; color: #94a3b8; }
            table.attl { width: 100%; border-collapse: collapse; font-size: ${format === 'photos' ? '8.5pt' : '7.5pt'}; }
            table.attl th, table.attl td { border: 1px solid #64748b; padding: ${format === 'photos' ? '3px 4px' : '2px 3px'}; text-align: center; vertical-align: middle; }
            table.attl thead { display: table-header-group; }
            table.attl tr { break-inside: avoid; page-break-inside: avoid; }
            table.attl th { background: #f1f5f9; font-weight: 900; font-size: ${format === 'photos' ? '8pt' : '7pt'}; line-height: 1.4; }
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

          {format === 'matrix' ? (
            <>
              <table className="attl">
                <thead>
                  <tr>
                    <th style={{ width: '7mm' }}>#</th>
                    <th style={{ width: '34mm' }}>نام و نام خانوادگی</th>
                    <th style={{ width: '20mm' }}>شماره دانشجویی</th>
                    {sessionRows.map((s, i) => (
                      <th key={s.id} style={{ minWidth: '11mm' }}>
                        ج{faDigits(String(s.sessionNo ?? i + 1))}
                        <br />
                        <span style={{ fontWeight: 700, fontSize: '6.5pt' }}>{faDigits(jalaliShort(s.sessionDate))}{s.isMakeUpSession === 1 ? ' جبرانی' : ''}</span>
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
                    for (const s of sessionRows) {
                      const c = att.get(cellKey(s.id, r.enrollmentId));
                      if (c && counts[c.status as keyof typeof counts] !== undefined) counts[c.status as keyof typeof counts] += 1;
                    }
                    return (
                      <tr key={r.enrollmentId}>
                        <td>{faDigits(String(i + 1))}</td>
                        <td className="attl-name">{`${r.firstName ?? ''} ${r.lastName ?? ''}`.trim()}</td>
                        <td className="attl-code">{r.studentCode}</td>
                        {sessionRows.map(s => {
                          const c = att.get(cellKey(s.id, r.enrollmentId));
                          const mk = c ? MARKS[c.status] ?? '' : '';
                          return (
                            <td key={s.id}>
                              {mk ? <span className="attl-mk">{mk}{c?.status === 'LATE' && c.lateMinutes ? <sup>{faDigits(String(c.lateMinutes))}</sup> : null}</span> : '—'}
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
              <div className="attl-legend">نشانه‌ها: ✓ حاضر — ✗ غایب — ت تأخیر (بالانویس: دقیقه) — م موجه — «—» ثبت نشده</div>
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
                    {photoCols.map((s, i) => (
                      <th key={s.id} style={{ minWidth: '9mm' }}>
                        {faDigits(String(s.sessionNo ?? i + 1))}
                        <br />
                        <span style={{ fontWeight: 700, fontSize: '6.5pt' }}>{faDigits(jalaliShort(s.sessionDate))}</span>
                      </th>
                    ))}
                    {sessionRows.length > photoCols.length && (
                      <th style={{ minWidth: '9mm' }}>… جلسات {faDigits(String(photoCols.length + 1))} به بعد</th>
                    )}
                    <th className="attl-sig">امضا</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((r, i) => (
                    <tr key={r.enrollmentId}>
                      <td>{faDigits(String(i + 1))}</td>
                      <td className="attl-photo">
                        <PersonPhoto userId={r.userId} hasPhoto={!!r.photoKey} className="w-10 h-12" icon="👤" label="عکس" />
                      </td>
                      <td className="attl-name">{`${r.firstName ?? ''} ${r.lastName ?? ''}`.trim()}</td>
                      <td className="attl-code">{r.studentCode}</td>
                      {photoCols.map(s => <td key={s.id} />)}
                      {sessionRows.length > photoCols.length && <td />}
                      <td />
                    </tr>
                  ))}
                </tbody>
              </table>
              {sessionRows.length > photoCols.length && (
                <div className="attl-legend">ستون‌های جلسه به حداکثر {faDigits(String(MAX_PHOTO_SESSION_COLS))} ستون محدود است؛ جلسات بعدی را از قالب «ماتریس جلسات» بگیرید.</div>
              )}
            </>
          )}

          <table className="attl-sign">
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
