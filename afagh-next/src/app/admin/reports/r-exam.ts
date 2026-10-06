import type { ReportFilters, ReportResult } from './report-helpers';
import { paged, studentWhere, joinAnd } from './report-helpers';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { requireRole } from '@/lib/auth';

export const CARDS = [
  { kind: 'exam-session-sheet', icon: '📄', title: 'صورت‌جلسه امتحان', needsTerm: true },
  { kind: 'seat-numbers', icon: '💺', title: 'شماره صندلی', needsTerm: true },
  { kind: 'final-exam-schedule', icon: '🗓', title: 'برنامه امتحانات پایان ترم', needsTerm: true },
  { kind: 'grade-entry-report', icon: '✍️', title: 'ثبت نمره استادان', needsTerm: true },
  { kind: 'grade-deadline', icon: '⏰', title: 'زمان‌بندی ثبت نمرات', needsTerm: true },
];

type F = ReportFilters & Record<string, unknown>;

async function effectiveTerm(f: ReportFilters): Promise<string> {
  if (f.term) return f.term;
  const r = await db.execute<{ code: string }>(
    sql`SELECT "termCode" AS code FROM academic_terms ORDER BY "termCode" DESC LIMIT 1`,
  );
  return r.rows[0]?.code ?? '';
}

export async function run(kind: string, f: F): Promise<ReportResult | null> {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  const term = await effectiveTerm(f);
  if (!term) {
    return {
      columns: [], rows: [], total: 0, page: 1, per: 1, totalPages: 1,
      summary: 'هیچ ترم تحصیلی در سیستم ثبت نشده است.',
    };
  }
  const uni = (tbl: string) =>
    f.universityId
      ? sql`(${sql.identifier(tbl)}."universityId" = ${f.universityId} OR ${sql.identifier(tbl)}."universityId" IS NULL)`
      : sql`1=1`;

  switch (kind) {
    // ── ۱. صورت‌جلسه امتحان: هر سانس امتحانی + دروس/سالن‌ها + ثبت‌نامی/حاضر/غایب ──
    // exam_sessions ستون درس/ارائه/سالن ندارد (فقط termId/examDate/startTime/endTime)؛
    // دروس از exam_course_packets و سالن‌ها از exam_minutes/seat_allocations می‌آیند.
    // حضور از exam_attendances (isPresent)؛ اگر ردیفی ثبت نشده باشد فقط ثبت‌نامی نمایش داده می‌شود.
    case 'exam-session-sheet': {
      const from = sql`FROM exam_sessions es
        JOIN academic_terms t ON t.id = es."termId"
        LEFT JOIN seat_allocations sa ON sa."sessionId" = es.id
        LEFT JOIN exam_attendances ea ON ea."examId" = es.id
        LEFT JOIN exam_course_packets ep ON ep."examId" = es.id
        LEFT JOIN courses c ON c.id = ep."courseId"
        LEFT JOIN exam_minutes em ON em."sessionId" = es.id
        LEFT JOIN exam_halls h ON h.id = em."hallId"`;
      const cols = sql`es.id AS session_id, es."examDate" AS exam_date,
        es."startTime" AS start_time, es."endTime" AS end_time,
        COALESCE(NULLIF(STRING_AGG(DISTINCT c.title, '، '), ''), '—') AS courses,
        COALESCE(NULLIF(STRING_AGG(DISTINCT h.name, '، '), ''), '—') AS halls,
        COUNT(DISTINCT sa."enrollmentId")::int AS enrolled,
        CASE WHEN COUNT(ea.id) = 0 THEN NULL
          ELSE COUNT(DISTINCT CASE WHEN ea."isPresent" = 1 THEN ea.id END)::int END AS present,
        CASE WHEN COUNT(ea.id) = 0 THEN NULL
          ELSE COUNT(DISTINCT CASE WHEN COALESCE(ea."isPresent", 0) = 0 THEN ea.id END)::int END AS absent,
        CASE WHEN COUNT(ea.id) = 0 THEN 'حضور ثبت نشده — فقط تعداد ثبت‌نامی' ELSE 'حضور ثبت شده' END AS attendance_note`;
      const r = await paged(
        [
          { key: 'session_id', title: 'شناسه سانس' }, { key: 'exam_date', title: 'تاریخ امتحان' },
          { key: 'start_time', title: 'شروع' }, { key: 'end_time', title: 'پایان' },
          { key: 'courses', title: 'دروس' }, { key: 'halls', title: 'سالن‌ها' },
          { key: 'enrolled', title: 'ثبت‌نامی' }, { key: 'present', title: 'حاضر' },
          { key: 'absent', title: 'غایب' }, { key: 'attendance_note', title: 'وضعیت حضور' },
        ],
        from,
        [sql`t."termCode" = ${term}`, uni('es')],
        cols,
        sql`ORDER BY exam_date, start_time`,
        f,
        sql`es.id, es."examDate", es."startTime", es."endTime"`,
      );
      r.summary = `${r.total.toLocaleString('fa-IR')} سانس امتحانی در ترم ${term} — ثبت‌نامی از seat_allocations، حضور از exam_attendances`;
      return r;
    }

    // ── ۲. شماره صندلی: لیست دانشجویان هر سانس با صندلی تخصیص‌یافته ──
    // جدول seat_allocations موجود است (seatNumber/hallId/sessionId/enrollmentId) — بدون fallback.
    case 'seat-numbers': {
      const extra = [];
      const sessRaw = f['sessionId'];
      const sessId = sessRaw === undefined || sessRaw === '' || sessRaw === null ? 0 : Number(sessRaw);
      if (sessId) extra.push(sql`es.id = ${sessId}`);
      const from = sql`FROM seat_allocations sa
        JOIN exam_sessions es ON es.id = sa."sessionId"
        JOIN academic_terms t ON t.id = es."termId"
        JOIN enrollments e ON e.id = sa."enrollmentId"
        JOIN students s ON s.id = e."studentId"
        JOIN users u ON u.id = s."userId"
        LEFT JOIN majors m ON m.id = s."majorId"
        LEFT JOIN course_offerings o ON o.id = e."offeringId"
        LEFT JOIN courses c ON c.id = o."courseId"
        LEFT JOIN exam_halls h ON h.id = sa."hallId"`;
      const cols = sql`sa."seatNumber" AS seat, s."studentCode" AS code,
        u."firstName" || ' ' || u."lastName" AS name,
        COALESCE(c.title, '—') AS course, COALESCE(h.name, '—') AS hall,
        es."examDate" AS exam_date, es."startTime" AS start_time`;
      const r = await paged(
        [
          { key: 'seat', title: 'شماره صندلی' }, { key: 'code', title: 'شماره دانشجویی' },
          { key: 'name', title: 'نام' }, { key: 'course', title: 'درس' },
          { key: 'hall', title: 'سالن' }, { key: 'exam_date', title: 'تاریخ امتحان' },
          { key: 'start_time', title: 'ساعت شروع' },
        ],
        from,
        [sql`t."termCode" = ${term}`, uni('sa'), ...studentWhere(f), ...extra],
        cols,
        sql`ORDER BY hall, seat`,
        f,
      );
      r.summary = `${r.total.toLocaleString('fa-IR')} صندلی تخصیص‌یافته در ترم ${term} (از seat_allocations)`;
      return r;
    }

    // ── ۳. برنامه امتحانات پایان ترم: امتحانات ارائه‌ها به ترتیب تاریخ/ساعت ──
    // منبع: schedules با scheduleType='EXAM' و examDate غیرتهی (همان که روی کارت ورود به جلسه می‌آید).
    case 'final-exam-schedule': {
      const from = sql`FROM schedules sc
        JOIN course_offerings o ON o.id = sc."offeringId"
        JOIN courses c ON c.id = o."courseId"
        JOIN academic_terms t ON t.id = o."termId"
        LEFT JOIN exam_halls h ON h.id = sc."roomId"
        LEFT JOIN staff st ON st.id = o."professorId"
        LEFT JOIN users pu ON pu.id = st."userId"`;
      const cols = sql`sc."examDate" AS exam_date, sc."startTime" AS start_time, sc."endTime" AS end_time,
        c.code AS course_code, c.title AS course, o."groupNumber" AS grp,
        COALESCE(pu."firstName" || ' ' || pu."lastName", 'تخصیص‌نیافته') AS professor,
        COALESCE(h.name, '—') AS room, o."enrolledCount" AS enrolled`;
      const r = await paged(
        [
          { key: 'exam_date', title: 'تاریخ امتحان' }, { key: 'start_time', title: 'شروع' },
          { key: 'end_time', title: 'پایان' }, { key: 'course_code', title: 'کد درس' },
          { key: 'course', title: 'نام درس' }, { key: 'grp', title: 'گروه' },
          { key: 'professor', title: 'استاد' }, { key: 'room', title: 'سالن' },
          { key: 'enrolled', title: 'ثبت‌نامی' },
        ],
        from,
        [sql`sc."scheduleType" = 'EXAM'`, sql`sc."examDate" IS NOT NULL`, sql`t."termCode" = ${term}`, uni('o')],
        cols,
        sql`ORDER BY exam_date, start_time, course_code`,
        f,
      );
      r.summary = `${r.total.toLocaleString('fa-IR')} امتحان برنامه‌ریزی‌شده در ترم ${term}`;
      return r;
    }

    // ── ۴. ثبت نمره استادان: ارائه‌ها/نهایی‌شده‌ها/مانده‌ها به تفکیک استاد ──
    case 'grade-entry-report': {
      const qCond = f.q
        ? sql`(st."staffCode" ILIKE ${`%${String(f.q)}%`} OR pu."firstName" ILIKE ${`%${String(f.q)}%`} OR pu."lastName" ILIKE ${`%${String(f.q)}%`})`
        : sql`1=1`;
      const from = sql`FROM offering_professors op
        JOIN course_offerings o ON o.id = op."offeringId"
        JOIN academic_terms t ON t.id = o."termId"
        JOIN staff st ON st.id = op."staffId"
        JOIN users pu ON pu.id = st."userId"`;
      const cols = sql`st."staffCode" AS code, pu."firstName" || ' ' || pu."lastName" AS professor,
        COUNT(DISTINCT op."offeringId")::int AS offerings,
        COUNT(DISTINCT CASE WHEN o."gradesFinalizedAt" IS NOT NULL THEN op."offeringId" END)::int AS finalized,
        COUNT(DISTINCT CASE WHEN o."gradesFinalizedAt" IS NULL THEN op."offeringId" END)::int AS pending`;
      const r = await paged(
        [
          { key: 'code', title: 'کد استاد' }, { key: 'professor', title: 'استاد' },
          { key: 'offerings', title: 'تعداد ارائه' }, { key: 'finalized', title: 'نهایی‌شده' },
          { key: 'pending', title: 'در انتظار ثبت' },
        ],
        from,
        [sql`t."termCode" = ${term}`, uni('o'), qCond],
        cols,
        sql`ORDER BY pending DESC, professor`,
        f,
        sql`st."staffCode", pu."firstName", pu."lastName"`,
      );
      r.summary = `${r.total.toLocaleString('fa-IR')} استاد دارای ارائه در ترم ${term} — نهایی‌شده یعنی gradesFinalizedAt غیرتهی`;
      return r;
    }

    // ── ۵. زمان‌بندی ثبت نمرات: مهلت هر ارائه + روزهای مانده + وضعیت ──
    // مهلت = customGradeDeadline ارائه وگرنه gradeEntryDeadline ترم.
    case 'grade-deadline': {
      const dl = sql`COALESCE(o."customGradeDeadline", t."gradeEntryDeadline")`;
      const from = sql`FROM course_offerings o
        JOIN academic_terms t ON t.id = o."termId"
        JOIN courses c ON c.id = o."courseId"
        LEFT JOIN staff st ON st.id = o."professorId"
        LEFT JOIN users pu ON pu.id = st."userId"`;
      const conds = [sql`t."termCode" = ${term}`, uni('o'), sql`${dl} IS NOT NULL`];
      const cols = sql`c.code AS course_code, c.title AS course, o."groupNumber" AS grp,
        COALESCE(pu."firstName" || ' ' || pu."lastName", 'تخصیص‌نیافته') AS professor,
        ${dl} AS deadline,
        EXTRACT(DAY FROM (${dl} - NOW()))::int AS days_left,
        CASE WHEN o."gradesFinalizedAt" IS NOT NULL THEN 'ثبت نهایی شده'
          WHEN ${dl} < NOW() THEN 'مهلت گذشته'
          WHEN ${dl} <= NOW() + INTERVAL '3 days' THEN 'فوری (≤۳ روز)'
          ELSE 'باز' END AS status,
        CASE WHEN o."customGradeDeadline" IS NOT NULL THEN 'اختصاصی ارائه' ELSE 'مهلت ترم' END AS deadline_source`;
      const r = await paged(
        [
          { key: 'course_code', title: 'کد درس' }, { key: 'course', title: 'نام درس' },
          { key: 'grp', title: 'گروه' }, { key: 'professor', title: 'استاد' },
          { key: 'deadline', title: 'مهلت ثبت' }, { key: 'days_left', title: 'روز مانده' },
          { key: 'status', title: 'وضعیت' }, { key: 'deadline_source', title: 'منبع مهلت' },
        ],
        from, conds, cols, sql`ORDER BY deadline`, f,
      );
      const where = joinAnd(conds);
      const agg = await db.execute<{ status: string; n: string }>(sql`
        SELECT CASE WHEN o."gradesFinalizedAt" IS NOT NULL THEN 'ثبت نهایی شده'
          WHEN ${dl} < NOW() THEN 'مهلت گذشته' ELSE 'باز/فوری' END AS status, COUNT(*)::int AS n
        ${from} ${where} GROUP BY 1 ORDER BY 1`);
      const parts = agg.rows.map(x => `${x.status}: ${Number(x.n).toLocaleString('fa-IR')}`).join(' — ');
      r.summary = `${r.total.toLocaleString('fa-IR')} ارائه دارای مهلت در ترم ${term}${parts ? ` (${parts})` : ''}`;
      return r;
    }

    default:
      return null;
  }
}
