import type { ReportFilters, ReportResult } from './report-helpers';
import { faStatus, paged, PER, studentWhere, STU_FROM, studentListReport } from './report-helpers';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { requireRole } from '@/lib/auth';
import {
  calculateOfficialGPA,
  calculateOfficialGpaBreakdown,
  calculateOfficialGpaUpToTerm,
} from '@/lib/regulations-engine';

/** برچسب نیمسال ورود (ستون students.entryTerm) */
const ENTRY_TERM_FA: Record<number, string> = { 1: 'نیمسال اول', 2: 'نیمسال دوم', 3: 'تابستان' };

export const CARDS = [
  { kind: 'offered-course-roster', icon: '👥', title: 'لیست دانشجویان درس ارائه‌شده', needsTerm: true, filters: ['term', 'q'] },
  { kind: 'top-students', icon: '🏆', title: 'نفرات برتر (سه ملاک معدل + رتبه)', filters: ['degree', 'major', 'entry', 'entryTerm', 'q'] },
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

    // ── نفرات برتر — سه ملاک معدل (کل / یک نیمسال / تا پایان یک نیمسال) + رتبه ──
    // ملاک «معدل تا پایان ترم N» برای قواعد آیین‌نامه‌ای لازم است (مثلاً پذیرش
    // بدون کنکور استعداد درخشان: معدل تا پایان ترم ۶ کارشناسی). معدل‌ها از موتور
    // رسمی می‌آیند (نه ستون ذخیره‌شدهٔ totalAverage) تا با کارنامه یکی باشد.
    case 'top-students': {
      const modeRaw = String(f.gpaMode ?? 'OVERALL').toUpperCase();
      const mode: 'OVERALL' | 'TERM' | 'CUMULATIVE' =
        modeRaw === 'TERM' ? 'TERM' : modeRaw === 'CUMULATIVE' ? 'CUMULATIVE' : 'OVERALL';
      const gpaTerm = String(f.gpaTerm ?? '').trim();

      let termTitle = gpaTerm;
      if (gpaTerm) {
        try {
          const t = await db.execute<{ title: string | null }>(sql`SELECT title FROM academic_terms WHERE "termCode" = ${gpaTerm} LIMIT 1`);
          if (t.rows?.[0]?.title) termTitle = t.rows[0].title as string;
        } catch { /* عنوان اختیاری است */ }
      }
      const gpaLabel = mode === 'OVERALL'
        ? 'معدل کل'
        : mode === 'TERM'
          ? `معدل نیمسال ${termTitle}`
          : `معدل تا پایان ${termTitle}`;

      const columns = [
        { key: 'rank', title: 'رتبه' },
        { key: 'code', title: 'شماره دانشجویی' },
        { key: 'name', title: 'نام' },
        { key: 'major', title: 'رشته' },
        { key: 'degree', title: 'مقطع' },
        { key: 'y', title: 'سال ورود' },
        { key: 'et', title: 'نیمسال ورود' },
        { key: 'gpa', title: gpaLabel },
        { key: 'units', title: 'واحد محاسبه‌شده' },
        { key: 'passed', title: 'واحد گذرانده' },
        { key: 'st', title: 'وضعیت' },
      ];
      const empty = (summary: string): ReportResult => ({ columns, rows: [], total: 0, page: 1, per: PER, totalPages: 1, summary });

      if (mode !== 'OVERALL' && !gpaTerm) {
        return empty('برای این ملاک، ابتدا نیمسال را انتخاب کنید.');
      }

      // ۱) جمعیت واجد شرایط (سقف برای سرعت؛ با فیلتر رشته/مقطع/ورودی/نیمسال ورود
      //    جمعیت کوچک می‌شود و رتبه‌بندی دقیق‌تر است).
      const CAP = 600;
      const conds = studentWhere(f);
      const pop = await db.execute<{
        id: number; code: string; name: string; major: string | null;
        degree: string | null; y: number | null; et: number | null; st: string | null;
      }>(sql`
        SELECT s.id AS id, s."studentCode" AS code, u."firstName" || ' ' || u."lastName" AS name,
               m.name AS major, d.title AS degree, s."entryYear" AS y, s."entryTerm" AS et, s.status AS st
        ${STU_FROM}
        WHERE ${sql.join(conds, sql` AND `)}
        ORDER BY s."studentCode"
        LIMIT ${CAP}
      `);
      const population = pop.rows ?? [];

      // ۲) معدل هر دانشجو با موتور رسمی، بر پایهٔ ملاک انتخابی
      const scored: {
        code: string; name: string; major: string | null; degree: string | null;
        y: number | null; et: number | null; st: string | null;
        gpa: number | null; units: number; passed: number; rank: number | null;
      }[] = [];
      for (const r of population) {
        let gpa: number | null = null;
        let units = 0;
        let passed = 0;
        try {
          if (mode === 'OVERALL') {
            const g = await calculateOfficialGPA(r.id);
            units = g.totalUnits; passed = g.passedUnits;
            gpa = g.totalUnits > 0 ? g.gpa : null;
          } else if (mode === 'TERM') {
            const b = await calculateOfficialGpaBreakdown(r.id);
            const t = b.terms.find(x => String(x.termCode ?? '') === gpaTerm);
            if (t) { gpa = t.gpa; units = t.units; passed = t.passedUnits; }
          } else {
            const g = await calculateOfficialGpaUpToTerm(r.id, gpaTerm);
            units = g.totalUnits; passed = g.passedUnits;
            gpa = g.totalUnits > 0 ? g.gpa : null;
          }
        } catch { /* یک پروندهٔ مشکل‌دار کل گزارش را نمی‌شکند */ }
        scored.push({
          code: r.code, name: r.name, major: r.major, degree: r.degree,
          y: r.y, et: r.et, st: r.st, gpa, units, passed, rank: null,
        });
      }

      // ۳) مرتب‌سازی نزولی + رتبه با احتساب تساوی
      scored.sort((a, b) => (b.gpa ?? -1) - (a.gpa ?? -1) || String(a.code).localeCompare(String(b.code), 'en'));
      let lastGpa: number | null = null;
      let lastRank = 0;
      scored.forEach((s, i) => {
        if (s.gpa === null) return;
        if (lastGpa === null || s.gpa !== lastGpa) { lastRank = i + 1; lastGpa = s.gpa; }
        s.rank = lastRank;
      });
      const withGpa = scored.filter(s => s.gpa !== null);

      const page = Math.max(1, Number(f.page) || 1);
      const start = (page - 1) * PER;
      const rows = withGpa.slice(start, start + PER).map(s => ({
        rank: s.rank,
        code: s.code,
        name: s.name,
        major: s.major ?? '—',
        degree: s.degree ?? '—',
        y: s.y ?? '—',
        et: ENTRY_TERM_FA[Number(s.et ?? 0)] ?? '—',
        gpa: s.gpa,
        units: s.units,
        passed: s.passed,
        st: faStatus(s.st),
      }));

      const capped = population.length >= CAP;
      return {
        columns,
        rows,
        total: withGpa.length,
        page,
        per: PER,
        totalPages: Math.max(1, Math.ceil(withGpa.length / PER)),
        summary: `${withGpa.length.toLocaleString('fa-IR')} دانشجو دارای ${gpaLabel} — مرتب‌شده نزولی با رتبه`
          + (capped ? ` · توجه: جمعیت واجد شرایط از سقف ${CAP.toLocaleString('fa-IR')} نفر بیشتر بود؛ برای رتبه‌بندی دقیق‌تر رشته/مقطع/سال و نیمسال ورود را فیلتر کنید.` : ''),
      };
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
