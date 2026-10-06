import type { ReportFilters, ReportResult } from './report-helpers';
import { paged, studentListReport, studentWhere } from './report-helpers';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { requireRole } from '@/lib/auth';

const READ_ROLES = ['ADMIN', 'EDU_EXPERT'];

export const CARDS: { kind: string; icon: string; title: string; needsTerm?: boolean; soon?: boolean }[] = [
  { kind: 'council-edu', icon: '🏛️', title: 'شورای آموزشی (اخذهای در انتظار بررسی)', needsTerm: true },
  // NEEDS-SCHEMA: جدول انضباطی وجود ندارد (DDL پیشنهادی در مستندات گزارش)
  { kind: 'discipline', icon: '⚖️', title: 'کمیته انضباطی', soon: true },
  { kind: 'letter-templates', icon: '📝', title: 'مدیریت قالب‌های مکاتبات' },
  { kind: 'transcript-card', icon: '📋', title: 'کارنامه دانشجویان' },
  { kind: 'exam-entry-card', icon: '🎫', title: 'کارت ورود به جلسه', needsTerm: true },
  { kind: 'student-card', icon: '🪪', title: 'صدور کارت دانشجویی' },
  { kind: 'study-cert', icon: '📜', title: 'گواهی اشتغال به تحصیل' },
  { kind: 'edu-confirm', icon: '✅', title: 'تاییدیه تحصیلی' },
  { kind: 'grad-cert', icon: '🎓', title: 'گواهی پایان تحصیلات' },
  { kind: 'military-defer', icon: '🪖', title: 'معافیت تحصیلی (مشمولان)' },
];

async function latestTerm(): Promise<string> {
  const r = await db.execute<{ code: string }>(
    sql`SELECT "termCode" AS code FROM academic_terms ORDER BY "termCode" DESC LIMIT 1`,
  );
  return r.rows[0]?.code ?? '';
}

export async function run(kind: string, f: ReportFilters): Promise<ReportResult | null> {
  await requireRole(READ_ROLES);
  const term = f.term || '';

  switch (kind) {
    // ── شورای آموزشی: اخذهای با وضعیت در انتظار بررسی شورا (ستون واقعی enrollments.status) ──
    // توجه: مدیریت کامل پرونده/جلسه/رأی شورا جدول جدا می‌خواهد (NEEDS-SCHEMA)؛ این گزارش صف انتظار است.
    case 'council-edu': {
      const from = sql`FROM enrollments ce
        JOIN course_offerings o ON o.id = ce."offeringId"
        JOIN courses c ON c.id = o."courseId"
        JOIN academic_terms t ON t.id = o."termId"
        JOIN students s ON s.id = ce."studentId"
        JOIN users u ON u.id = s."userId"
        LEFT JOIN majors m ON m.id = s."majorId"
        LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"`;
      const conds = [
        sql`ce.status = 'PENDING_COUNCIL'`,
        ...(term ? [sql`t."termCode" = ${term}`] : []),
        ...studentWhere(f),
      ];
      const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name,
        m.name AS major, d.title AS degree, c.code AS course_code, c.title AS course_title, t."termCode" AS term`;
      const r = await paged(
        [
          { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
          { key: 'major', title: 'رشته' }, { key: 'degree', title: 'مقطع' },
          { key: 'course_code', title: 'کد درس' }, { key: 'course_title', title: 'نام درس' },
          { key: 'term', title: 'ترم' },
        ],
        from, conds, cols, sql`ORDER BY code`, f,
      );
      r.summary = `${r.total.toLocaleString('fa-IR')} اخذ در انتظار بررسی شورا${term ? ` در ترم ${term}` : ''}`;
      return r;
    }

    // ── قالب‌های مکاتبات (document_templates واقعی) ──
    case 'letter-templates': {
      const conds = [];
      if (f.universityId) conds.push(sql`(dt."universityId" = ${f.universityId} OR dt."universityId" IS NULL)`);
      if (f.q) {
        const like = `%${f.q}%`;
        conds.push(sql`(dt.code ILIKE ${like} OR dt.title ILIKE ${like})`);
      }
      const r = await paged(
        [
          { key: 'code', title: 'کد قالب' }, { key: 'title', title: 'عنوان قالب' },
        ],
        sql`FROM document_templates dt`,
        conds,
        sql`dt.code AS code, dt.title AS title`,
        sql`ORDER BY code`,
        f,
      );
      r.summary = `${r.total.toLocaleString('fa-IR')} قالب مکاتبات`;
      return r;
    }

    // ── کارنامه: دانشجویان + تعداد اسنپ‌شات کارنامه و دروس نهایی‌شده ──
    case 'transcript-card': {
      const from = sql`FROM students s JOIN users u ON u.id = s."userId"
        LEFT JOIN majors m ON m.id = s."majorId"
        LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"`;
      const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name,
        m.name AS major, d.title AS degree, s."entryYear" AS y,
        (SELECT COUNT(*)::int FROM transcript_snapshots ts WHERE ts."studentId" = s.id) AS snaps,
        (SELECT COUNT(*)::int FROM enrollments e WHERE e."studentId" = s.id AND e."gradeStatus" = 'FINALIZED') AS fin`;
      const r = await paged(
        [
          { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
          { key: 'major', title: 'رشته' }, { key: 'degree', title: 'مقطع' },
          { key: 'y', title: 'ورودی' }, { key: 'snaps', title: 'اسنپ‌شات کارنامه' },
          { key: 'fin', title: 'درس نهایی‌شده' },
        ],
        from, [...studentWhere(f)], cols, sql`ORDER BY code`, f,
      );
      r.summary = `${r.total.toLocaleString('fa-IR')} پرونده کارنامه`;
      return r;
    }

    // ── کارت ورود به جلسه: دانشجویان دارای تخصیص صندلی در ترم ──
    case 'exam-entry-card': {
      const effectiveTerm = term || (await latestTerm());
      const from = sql`FROM seat_allocations sa
        JOIN enrollments e ON e.id = sa."enrollmentId"
        JOIN exam_sessions es ON es.id = sa."sessionId"
        JOIN academic_terms t ON t.id = es."termId"
        JOIN students s ON s.id = e."studentId"
        JOIN users u ON u.id = s."userId"
        LEFT JOIN majors m ON m.id = s."majorId"`;
      const conds = [sql`t."termCode" = ${effectiveTerm}`, ...studentWhere(f)];
      const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name,
        m.name AS major, es."examDate" AS exam_date, COUNT(sa.id)::int AS seats`;
      const r = await paged(
        [
          { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
          { key: 'major', title: 'رشته' }, { key: 'exam_date', title: 'تاریخ آزمون' },
          { key: 'seats', title: 'صندلی' },
        ],
        from, conds, cols, sql`ORDER BY code, exam_date`, f,
        sql`s."studentCode", u."firstName", u."lastName", m.name, es."examDate"`,
      );
      r.summary = `${r.total.toLocaleString('fa-IR')} رکورد کارت ورود در ترم ${effectiveTerm}`;
      return r;
    }

    // ── کارت دانشجویی: دانشجویان فعال + وضعیت چاپ کارت (student_cards واقعی) ──
    case 'student-card': {
      const from = sql`FROM students s JOIN users u ON u.id = s."userId"
        LEFT JOIN majors m ON m.id = s."majorId"
        LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"
        LEFT JOIN student_cards sc ON sc."studentId" = s.id`;
      const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name,
        m.name AS major, d.title AS degree,
        COALESCE(sc."printStatus", '— ثبت‌نشده —') AS card, sc."issuedAt" AS issued`;
      const r = await paged(
        [
          { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
          { key: 'major', title: 'رشته' }, { key: 'degree', title: 'مقطع' },
          { key: 'card', title: 'وضعیت کارت' }, { key: 'issued', title: 'تاریخ صدور' },
        ],
        from, [sql`s.status = 'ACTIVE'`, ...studentWhere(f)], cols, sql`ORDER BY code`, f,
      );
      r.summary = `${r.total.toLocaleString('fa-IR')} دانشجوی فعال واجد کارت`;
      return r;
    }

    // ── گواهی اشتغال به تحصیل: دانشجویان فعال ──
    case 'study-cert': {
      const r = await studentListReport(
        [
          { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
          { key: 'nc', title: 'کد ملی' }, { key: 'major', title: 'رشته' },
          { key: 'degree', title: 'مقطع' }, { key: 'y', title: 'ورودی' },
        ],
        [sql`s.status = 'ACTIVE'`], f,
      );
      r.summary = `${r.total.toLocaleString('fa-IR')} دانشجوی فعال واجد گواهی اشتغال`;
      return r;
    }

    // ── تاییدیه تحصیلی: درخواست‌های دانشجویی با فرایند تاییدیه‌ای ──
    case 'edu-confirm': {
      const from = sql`FROM student_requests r
        JOIN students s ON s.id = r."studentId"
        JOIN users u ON u.id = s."userId"
        JOIN process_definitions p ON p.id = r."processId"
        LEFT JOIN majors m ON m.id = s."majorId"`;
      const conds = [
        sql`(p.code ILIKE '%CONFIRM%' OR p.title ILIKE '%تاییدیه%' OR p.title ILIKE '%تأییدیه%')`,
        ...studentWhere(f),
      ];
      const cols = sql`r."trackingCode" AS track, u."firstName" || ' ' || u."lastName" AS name,
        s."studentCode" AS code, m.name AS major, p.title AS process, r.status AS st, r."createdAt" AS created`;
      const r = await paged(
        [
          { key: 'track', title: 'کد رهگیری' }, { key: 'name', title: 'نام' },
          { key: 'code', title: 'شماره دانشجویی' }, { key: 'major', title: 'رشته' },
          { key: 'process', title: 'فرایند' }, { key: 'st', title: 'وضعیت' },
          { key: 'created', title: 'ثبت' },
        ],
        from, conds, cols, sql`ORDER BY created DESC`, f,
      );
      r.summary = `${r.total.toLocaleString('fa-IR')} درخواست تاییدیه تحصیلی`;
      return r;
    }

    // ── گواهی پایان تحصیلات: فارغ‌التحصیلان + مدرک صادره (issued_degrees واقعی) ──
    case 'grad-cert': {
      const from = sql`FROM students s JOIN users u ON u.id = s."userId"
        LEFT JOIN majors m ON m.id = s."majorId"
        LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"
        LEFT JOIN issued_degrees ig ON ig."studentId" = s.id AND ig."degreeType" IN ('TEMPORARY', 'PERMANENT')`;
      const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name,
        m.name AS major, d.title AS degree, s."entryYear" AS y,
        COALESCE(ig."serialNo", '— ثبت‌نشده —') AS doc, ig."issuedAt" AS issued`;
      const r = await paged(
        [
          { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
          { key: 'major', title: 'رشته' }, { key: 'degree', title: 'مقطع' },
          { key: 'y', title: 'ورودی' }, { key: 'doc', title: 'سریال مدرک' },
          { key: 'issued', title: 'تاریخ صدور' },
        ],
        from, [sql`s.status = 'GRADUATED'`, ...studentWhere(f)], cols, sql`ORDER BY code`, f,
      );
      r.summary = `${r.total.toLocaleString('fa-IR')} فارغ‌التحصیل`;
      return r;
    }

    // ── معافیت تحصیلی: مردان فعال + وضعیت نظام‌وظیفه (users.gender و military_service_records واقعی) ──
    case 'military-defer': {
      const from = sql`FROM students s JOIN users u ON u.id = s."userId"
        LEFT JOIN majors m ON m.id = s."majorId"
        LEFT JOIN military_service_records msr ON msr."studentId" = s.id`;
      const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name,
        m.name AS major, s."entryYear" AS y,
        COALESCE(s."militaryStatus", '—') AS mil, COALESCE(msr.status, '—') AS sakha`;
      const r = await paged(
        [
          { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
          { key: 'major', title: 'رشته' }, { key: 'y', title: 'ورودی' },
          { key: 'mil', title: 'وضعیت نظام‌وظیفه' }, { key: 'sakha', title: 'وضعیت سخا' },
        ],
        from, [sql`s.status = 'ACTIVE'`, sql`u.gender = 'MALE'`, ...studentWhere(f)],
        cols, sql`ORDER BY code`, f,
      );
      r.summary = `${r.total.toLocaleString('fa-IR')} مشمول فعال واجد معافیت تحصیلی`;
      return r;
    }

    default:
      return null;
  }
}
