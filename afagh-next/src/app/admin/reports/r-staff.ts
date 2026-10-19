import type { ReportFilters, ReportResult } from './report-helpers';
import { paged, studentWhere } from './report-helpers';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { CREDIT_LEDGER_TYPES, DEBT_LEDGER_TYPES } from '@/lib/ledger-balance';
import { escapeLikeChars } from '@/lib/persian-search';
import { requireRole } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

const READ_ROLES = ['ADMIN', 'EDU_EXPERT'] as never[];
const ADMIN_ROLES = ['ADMIN'] as never[];

export const CARDS = [
  { kind: 'staff-list', title: '👨‍🏫 اساتید', desc: 'کد/نام/مرتبه/گروه به‌همراه تعداد ارائه‌ها در ترم' },
  { kind: 'staff-courses', title: '📚 مدرس دروس', desc: 'ارائه‌ها و عناوین دروس هر استاد در ترم' },
  { kind: 'staff-timetable', title: '🗓 برنامه هفتگی اساتید', desc: 'جلسات هفتگی هر استاد به تفکیک روز (از schedules)' },
  { kind: 'attendance-list', title: '📝 حضور و غیاب', desc: 'آمار جلسات برگزار‌شده/لغو‌شده و غیبت دانشجویی هر ارائه' },
];

function uniCond(alias: string, f: ReportFilters) {
  if (!f.universityId) return null;
  const a = sql.identifier(alias);
  return sql`(${a}."universityId" = ${f.universityId} OR ${a}."universityId" IS NULL)`;
}

function pushUni(conds: ReturnType<typeof sql>[], alias: string, f: ReportFilters) {
  const c = uniCond(alias, f);
  if (c) conds.push(c);
}

export async function run(kind: string, f: ReportFilters): Promise<ReportResult | null> {
  await requireRole(READ_ROLES);
  const term = f.term || '';

  switch (kind) {
    // ── 👨‍🏫 اساتید ──
    case 'staff-list': {
      const offCount = term
        ? sql`(SELECT COUNT(DISTINCT o.id) FROM course_offerings o JOIN academic_terms t ON t.id = o."termId" LEFT JOIN offering_professors op ON op."offeringId" = o.id WHERE (o."professorId" = st.id OR op."staffId" = st.id) AND t."termCode" = ${term}) AS offerings`
        : sql`(SELECT COUNT(DISTINCT o.id) FROM course_offerings o LEFT JOIN offering_professors op ON op."offeringId" = o.id WHERE (o."professorId" = st.id OR op."staffId" = st.id)) AS offerings`;
      const from = sql`FROM staff st JOIN users u ON u.id = st."userId" LEFT JOIN departments dep ON dep.id = st."departmentId"`;
      const conds: ReturnType<typeof sql>[] = [];
      pushUni(conds, 'st', f);
      if (f.departmentId) conds.push(sql`st."departmentId" = ${f.departmentId}`);
      if (f.facultyId) conds.push(sql`st."facultyId" = ${f.facultyId}`);
      if (f.q) {
        // 🔒 فرار wildcard ورودی کاربر (با ESCAPE '\')
        const like = `%${escapeLikeChars(String(f.q))}%`;
        conds.push(sql`(st."staffCode" ILIKE ${like} ESCAPE '\\' OR u."firstName" ILIKE ${like} ESCAPE '\\' OR u."lastName" ILIKE ${like} ESCAPE '\\')`);
      }
      const cols = sql`st."staffCode" AS code, u."firstName" || ' ' || u."lastName" AS name, st."academicRank" AS rank, dep.name AS department, st."staffType" AS type, ${offCount}`;
      const r = await paged(
        [
          { key: 'code', title: 'کد استاد' }, { key: 'name', title: 'نام' },
          { key: 'rank', title: 'مرتبه' }, { key: 'department', title: 'گروه' },
          { key: 'type', title: 'نوع همکاری' }, { key: 'offerings', title: 'تعداد ارائه' },
        ],
        from, conds, cols, sql`ORDER BY code`, f,
      );
      r.summary = `${r.total.toLocaleString('fa-IR')} استاد${term ? ` — ${r.total.toLocaleString('fa-IR')} ارائه در ترم ${term}` : ''}`;
      return r;
    }

    // ── 📚 مدرس دروس ──
    case 'staff-courses': {
      const from = sql`FROM course_offerings o JOIN academic_terms t ON t.id = o."termId" JOIN courses c ON c.id = o."courseId" LEFT JOIN staff st ON st.id = o."professorId" LEFT JOIN users u ON u.id = st."userId"`;
      const conds: ReturnType<typeof sql>[] = [];
      pushUni(conds, 'o', f);
      if (term) conds.push(sql`t."termCode" = ${term}`);
      if (f.departmentId) conds.push(sql`c."departmentId" = ${f.departmentId}`);
      if (f.q) {
        const like = `%${escapeLikeChars(String(f.q))}%`;
        conds.push(sql`(c.code ILIKE ${like} ESCAPE '\\' OR c.title ILIKE ${like} ESCAPE '\\' OR st."staffCode" ILIKE ${like} ESCAPE '\\' OR u."firstName" ILIKE ${like} ESCAPE '\\' OR u."lastName" ILIKE ${like} ESCAPE '\\')`);
      }
      const cols = sql`st."staffCode" AS staff_code, u."firstName" || ' ' || u."lastName" AS staff_name, c.code AS course_code, c.title AS course_title, o."groupNumber" AS grp, o.capacity AS capacity, o."enrolledCount" AS enrolled, t."termCode" AS term`;
      const r = await paged(
        [
          { key: 'staff_code', title: 'کد استاد' }, { key: 'staff_name', title: 'نام استاد' },
          { key: 'course_code', title: 'کد درس' }, { key: 'course_title', title: 'عنوان درس' },
          { key: 'grp', title: 'گروه' }, { key: 'capacity', title: 'ظرفیت' },
          { key: 'enrolled', title: 'ثبت‌نامی' }, { key: 'term', title: 'ترم' },
        ],
        from, conds, cols, sql`ORDER BY staff_code, course_code`, f,
      );
      r.summary = `${r.total.toLocaleString('fa-IR')} ارائه${term ? ` در ترم ${term}` : ''}`;
      return r;
    }

    // ── 🗓 برنامه هفتگی اساتید (schedules: dayOfWeek/startTime/endTime موجود است) ──
    case 'staff-timetable': {
      const from = sql`FROM schedules s JOIN course_offerings o ON o.id = s."offeringId" JOIN academic_terms t ON t.id = o."termId" JOIN courses c ON c.id = o."courseId" LEFT JOIN staff st ON st.id = o."professorId" LEFT JOIN users u ON u.id = st."userId" LEFT JOIN classrooms r ON r.id = s."roomId"`;
      const conds: ReturnType<typeof sql>[] = [sql`s."scheduleType" <> 'EXAM'`];
      pushUni(conds, 'o', f);
      if (term) conds.push(sql`t."termCode" = ${term}`);
      if (f.q) {
        const like = `%${escapeLikeChars(String(f.q))}%`;
        conds.push(sql`(st."staffCode" ILIKE ${like} ESCAPE '\\' OR u."firstName" ILIKE ${like} ESCAPE '\\' OR u."lastName" ILIKE ${like} ESCAPE '\\' OR c.title ILIKE ${like} ESCAPE '\\')`);
      }
      const cols = sql`st."staffCode" AS code, u."firstName" || ' ' || u."lastName" AS professor, s."dayOfWeek" AS day, s."startTime" AS start, s."endTime" AS finish, c.title AS course, r.name AS room`;
      const r = await paged(
        [
          { key: 'code', title: 'کد استاد' }, { key: 'professor', title: 'نام استاد' },
          { key: 'day', title: 'روز هفته' }, { key: 'start', title: 'شروع' },
          { key: 'finish', title: 'پایان' }, { key: 'course', title: 'درس' },
          { key: 'room', title: 'کلاس' },
        ],
        from, conds, cols, sql`ORDER BY s."dayOfWeek", s."startTime"`, f,
      );
      r.summary = `${r.total.toLocaleString('fa-IR')} جلسه هفتگی${term ? ` در ترم ${term}` : ''}`;
      return r;
    }

    // ── 📝 لیست حضور و غیاب دروس ترم — به‌ازای هر (دانشجو × درس) ──
    // مطابق فرم سیستم قدیم: فیلتر کد درس/کد استاد، فقط دانشجویان فعال،
    // نمایش وضعیت مالی، و ترتیب اسامی (شمارهٔ دانشجویی / نام / کد استاد).
    case 'attendance-list': {
      const orderBy = String(f.orderBy ?? 'NAME').toUpperCase();
      const showFinance = String(f.showFinance ?? '') === '1' || f.showFinance === true;
      const debtIn = sql`sl."transactionType" IN (${sql.join(DEBT_LEDGER_TYPES.map(t => sql`${t}`), sql`, `)})`;
      const creditIn = sql`sl."transactionType" IN (${sql.join(CREDIT_LEDGER_TYPES.map(t => sql`${t}`), sql`, `)})`;
      const from = sql`FROM enrollments e
        JOIN course_offerings o ON o.id = e."offeringId"
        JOIN academic_terms t ON t.id = o."termId"
        JOIN courses c ON c.id = o."courseId"
        JOIN students s ON s.id = e."studentId"
        JOIN users u ON u.id = s."userId"
        LEFT JOIN staff st ON st.id = o."professorId"
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS sessions,
                 COUNT(*) FILTER (WHERE sca.status = 'PRESENT')::int AS present,
                 COUNT(*) FILTER (WHERE sca.status = 'ABSENT')::int AS absent
            FROM student_class_attendance sca WHERE sca."enrollmentId" = e.id
        ) att ON true`;
      const conds: ReturnType<typeof sql>[] = [sql`e.status <> 'DROPPED'`, ...studentWhere(f)];
      pushUni(conds, 'o', f);
      if (term) conds.push(sql`t."termCode" = ${term}`);
      const courseCode = String(f.courseCode ?? '').trim();
      if (courseCode) conds.push(sql`c.code = ${courseCode}`);
      const professorCode = String(f.professorCode ?? '').trim();
      if (professorCode) conds.push(sql`st."staffCode" = ${professorCode}`);
      if (f.q) {
        const like = `%${escapeLikeChars(String(f.q))}%`;
        conds.push(sql`(c.code ILIKE ${like} ESCAPE '\\' OR c.title ILIKE ${like} ESCAPE '\\' OR st."staffCode" ILIKE ${like} ESCAPE '\\' OR u."lastName" ILIKE ${like} ESCAPE '\\' OR s."studentCode" ILIKE ${like} ESCAPE '\\')`);
      }
      const financeCol = showFinance
        ? sql`, CASE WHEN COALESCE((SELECT SUM(CASE WHEN ${debtIn} THEN sl.amount ELSE 0 END) - SUM(CASE WHEN ${creditIn} THEN sl.amount ELSE 0 END) FROM student_ledger sl WHERE sl."studentId" = s.id), 0) > 0 THEN 'بدهکار' ELSE 'تسویه' END AS finance`
        : sql``;
      const cols = sql`st."staffCode" AS prof, s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name, c.code AS course_code, c.title AS course_title, o."groupNumber" AS grp, t."termCode" AS term, att.sessions AS sessions, att.present AS present, att.absent AS absent, (CASE WHEN att.sessions > 0 THEN ROUND(100.0 * att.present / att.sessions)::int ELSE NULL END) AS present_pct${financeCol}`;
      const columns = [
        { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام دانشجو' },
        { key: 'course_code', title: 'کد درس' }, { key: 'course_title', title: 'عنوان درس' },
        { key: 'grp', title: 'گروه' }, { key: 'prof', title: 'کد استاد' }, { key: 'term', title: 'ترم' },
        { key: 'sessions', title: 'جلسات ثبت‌شده' }, { key: 'present', title: 'حاضر' },
        { key: 'absent', title: 'غایب' }, { key: 'present_pct', title: 'درصد حضور' },
        ...(showFinance ? [{ key: 'finance', title: 'وضعیت مالی' }] : []),
      ];
      const order = orderBy === 'CODE' ? sql`code, course_code` : orderBy === 'PROF' ? sql`prof, course_code, name` : sql`name, code, course_code`;
      const r = await paged(
        columns, from, conds, cols, order, f,
        sql`e.id, st."staffCode", s."studentCode", u."firstName", u."lastName", c.code, c.title, o."groupNumber", t."termCode", att.sessions, att.present, att.absent`,
      );
      r.summary = `${r.total.toLocaleString('fa-IR')} ردیف دانشجو×درس${term ? ` در ترم ${term}` : ''} — ترتیب: ${orderBy === 'CODE' ? 'شمارهٔ دانشجویی' : orderBy === 'PROF' ? 'کد استاد و درس' : 'نام و نام خانوادگی'}`
        + (showFinance ? ' · ستون وضعیت مالی بر پایهٔ دفتر کل کانونی' : '');
      return r;
    }

    default:
      return null;
  }
}

// ── تخصیص استاد مشاور (students."advisorCode" ← staff."staffCode") ──
export async function advisorAssign(
  studentIds: number[],
  staffId: number,
): Promise<{ ok: boolean; error?: string; updated?: number }> {
  await requireRole(ADMIN_ROLES);
  const ids = [...new Set((studentIds || []).map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, 500);
  if (!ids.length) return { ok: false, error: 'شناسه دانشجو معتبر نیست' };
  if (!Number.isInteger(staffId) || staffId <= 0) return { ok: false, error: 'شناسه استاد معتبر نیست' };
  const found = await db.execute<{ staffCode: string }>(
    sql`SELECT "staffCode" AS "staffCode" FROM staff WHERE id = ${staffId} LIMIT 1`,
  );
  const code = found.rows[0]?.staffCode;
  if (!code) return { ok: false, error: 'استاد یافت نشد' };
  const list = sql.join(ids.map(i => sql`${i}`), sql`, `);
  const upd = await db.execute(
    sql`UPDATE students SET "advisorCode" = ${code} WHERE id IN (${list})`,
  );
  revalidatePath('/admin/reports');
  return { ok: true, updated: upd.rowCount ?? ids.length };
}
