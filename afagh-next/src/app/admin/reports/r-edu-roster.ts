import type { ReportFilters, ReportResult } from './report-helpers';
import { paged, studentWhere, STU_FROM, studentListReport } from './report-helpers';
import { sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';

export const CARDS = [
  { kind: 'offered-course-roster', icon: '👥', title: 'لیست دانشجویان درس ارائه‌شده', needsTerm: true, filters: ['term', 'q'] },
  { kind: 'top-students', icon: '🏆', title: 'نفرات برتر', filters: ['degree', 'major', 'entry', 'q'] },
  { kind: 'no-photo', icon: '📷', title: 'دانشجویان فاقد عکس', filters: ['degree', 'major', 'entry', 'q'] },
  { kind: 'graduates-info', icon: '🎓', title: 'اطلاعات دانش‌آموختگان', filters: ['degree', 'major', 'entry', 'q'] },
];

export async function run(kind: string, f: ReportFilters & Record<string, unknown>): Promise<ReportResult | null> {
  await requireRole(['ADMIN', 'EDU_EXPERT']);

  switch (kind) {
    // ── لیست دانشجویان یک درس ارائه‌شده (جست‌وجو با کد/نام درس در ترم) ──
    case 'offered-course-roster': {
      const term = (f.term || '').trim();
      const q = (f.q || '').trim();
      const columns = [
        { key: 'code', title: 'شماره دانشجویی' },
        { key: 'name', title: 'نام' },
        { key: 'major', title: 'رشته' },
        { key: 'groupNumber', title: 'شماره گروه' },
        { key: 'gradeValue', title: 'نمره' },
        { key: 'gradeStatus', title: 'وضعیت نمره' },
      ];
      if (!term) {
        return { columns, rows: [], total: 0, page: 1, per: 50, totalPages: 1, summary: 'نخست ترم را انتخاب کنید.' };
      }
      if (!q) {
        return { columns, rows: [], total: 0, page: 1, per: 50, totalPages: 1, summary: 'کد یا نام درس را وارد کنید تا ارائه‌های آن ترم پیدا شود.' };
      }
      const like = `%${q}%`;
      // ‏f.q مصرف جست‌وجوی درس است، نه دانشجو — پس از فیلتر دانشجو حذف می‌شود
      const rest: ReportFilters = { ...f, q: undefined };
      const from = sql`FROM enrollments e JOIN course_offerings o ON o.id = e."offeringId" JOIN courses c ON c.id = o."courseId" JOIN academic_terms t ON t.id = o."termId" JOIN students s ON s.id = e."studentId" JOIN users u ON u.id = s."userId" LEFT JOIN majors m ON m.id = s."majorId"`;
      const conds = [
        sql`t."termCode" = ${term}`,
        sql`(c.code ILIKE ${like} OR c.title ILIKE ${like})`,
        ...studentWhere(rest),
      ];
      const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name, m.name AS major, o."groupNumber" AS "groupNumber", e."gradeValue" AS "gradeValue", e."gradeStatus" AS "gradeStatus"`;
      const r = await paged(columns, from, conds, cols, sql`ORDER BY code`, f);
      r.summary = `${r.total.toLocaleString('fa-IR')} ثبت‌نام در درس «${q}» — ترم ${term}`;
      return r;
    }

    // ── نفرات برتر بر اساس معدل کل پرونده (متمایز از 'top' که روی نمرات نهایی حدنصاب‌دار است) ──
    case 'top-students': {
      const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name, m.name AS major, d.title AS degree, s."entryYear" AS y, s."totalAverage" AS avg`;
      const r = await paged(
        [
          { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
          { key: 'major', title: 'رشته' }, { key: 'degree', title: 'مقطع' },
          { key: 'y', title: 'ورودی' }, { key: 'avg', title: 'معدل کل' },
        ],
        STU_FROM,
        [...studentWhere(f), sql`s."totalAverage" IS NOT NULL`],
        cols,
        sql`ORDER BY s."totalAverage" DESC NULLS LAST`,
        f,
      );
      r.summary = `${r.total.toLocaleString('fa-IR')} دانشجو دارای معدل کل ثبت‌شده (مرتب‌سازی نزولی)`;
      return r;
    }

    // ── دانشجویان فاقد عکس پرسنلی ──
    case 'no-photo': {
      const r = await studentListReport(
        [
          { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
          { key: 'nc', title: 'کد ملی' }, { key: 'major', title: 'رشته' },
          { key: 'degree', title: 'مقطع' }, { key: 'y', title: 'ورودی' }, { key: 'st', title: 'وضعیت' },
        ],
        [sql`u."photoKey" IS NULL`],
        f,
      );
      r.summary = `${r.total.toLocaleString('fa-IR')} دانشجو فاقد عکس`;
      return r;
    }

    // ── اطلاعات دانش‌آموختگان (تاریخ فراغت / سال پایان تحصیل / معدل کل) ──
    case 'graduates-info': {
      const cols = sql`s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name, m.name AS major, d.title AS degree, s."graduateDate" AS "graduateDate", s."eduEndYear" AS "eduEndYear", s."totalAverage" AS avg`;
      const r = await paged(
        [
          { key: 'code', title: 'شماره دانشجویی' }, { key: 'name', title: 'نام' },
          { key: 'major', title: 'رشته' }, { key: 'degree', title: 'مقطع' },
          { key: 'graduateDate', title: 'تاریخ فراغت' }, { key: 'eduEndYear', title: 'سال پایان تحصیل' },
          { key: 'avg', title: 'معدل کل' },
        ],
        STU_FROM,
        [...studentWhere(f), sql`s.status = 'GRADUATED'`],
        cols,
        sql`ORDER BY s."graduateDate" DESC NULLS LAST, s."studentCode"`,
        f,
      );
      r.summary = `${r.total.toLocaleString('fa-IR')} دانش‌آموخته`;
      return r;
    }

    default:
      return null;
  }
}
