import 'server-only';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms, course_offerings, courses, enrollments, legacy_grades, students,
} from '@/db/schema';
import { norm, num } from './normalize';
import { iterate, missingHeaders, pickTable, type Table } from './tabular';
import { resolverFor, upsertLegacyCode } from './codemap';
import { auditInsert, auditUpdate, type AuditCtx } from './audit';
import type { ImportReport } from './tuition';

// ═══ نمرات سیستم قدیمی ═══
// جریان کار: واردسازی در جدول staging ← مقایسه با نمرات سامانهٔ جدید ←
// اعمال آگاهانه (فقط ردیف‌هایی که کاربر تأیید می‌کند / وضعیت مشخصی دارند).
// هیچ نمره‌ای بی‌سروصدا بازنویسی نمی‌شود؛ اختلاف‌ها اول گزارش می‌شوند.

/** نمرهٔ حرفی/کیفی رایج سیستم‌های قدیمی → مقدار عددی و وضعیت */
const QUALITATIVE: Record<string, { value: number | null; status: string }> = {
  'قبول': { value: null, status: 'PASSED_NO_GRADE' },
  'پذیرفته': { value: null, status: 'PASSED_NO_GRADE' },
  'pass': { value: null, status: 'PASSED_NO_GRADE' },
  'مردود': { value: null, status: 'FAILED_NO_GRADE' },
  'رد': { value: null, status: 'FAILED_NO_GRADE' },
  'fail': { value: null, status: 'FAILED_NO_GRADE' },
  'معاف': { value: null, status: 'EXEMPT' },
  'معادلسازی': { value: null, status: 'EXEMPT' },
  'معادل سازی': { value: null, status: 'EXEMPT' },
  'تطبیق': { value: null, status: 'EXEMPT' },
  'حذف': { value: null, status: 'DROPPED' },
  'حذف پزشکی': { value: null, status: 'DROPPED' },
  'ناتمام': { value: null, status: 'PENDING' },
  'الف': { value: 18, status: 'FINALIZED' },
  'ب': { value: 15, status: 'FINALIZED' },
  'ج': { value: 12, status: 'FINALIZED' },
  'د': { value: 10, status: 'FINALIZED' },
  'a': { value: 18, status: 'FINALIZED' },
  'b': { value: 15, status: 'FINALIZED' },
  'c': { value: 12, status: 'FINALIZED' },
  'd': { value: 10, status: 'FINALIZED' },
};

export type ParsedGrade = { value: number | null; status: string; note?: string };

/** تفسیر مقدار خام نمره با کمک نگاشت کدهای کاربر (دامنهٔ GRADE_STATUS) */
export function parseGrade(raw: string, statusRaw: string, statusMap: Map<string, { code: string | null }>): ParsedGrade {
  const r = norm(raw);
  const s = norm(statusRaw);

  const mappedStatus = s ? statusMap.get(s)?.code ?? null : null;
  const n = num(r);
  if (n != null && r !== '') {
    if (n < 0 || n > 20) return { value: null, status: 'PENDING', note: `نمرهٔ خارج از بازهٔ ۰..۲۰: ${r}` };
    return { value: n, status: mappedStatus ?? 'FINALIZED' };
  }
  const q = QUALITATIVE[r.toLowerCase()];
  if (q) return { value: q.value, status: mappedStatus ?? q.status };
  if (mappedStatus) return { value: null, status: mappedStatus };
  if (!r) return { value: null, status: 'PENDING' };
  return { value: null, status: 'PENDING', note: `مقدار نمره «${raw}» شناخته نشد — در تطبیق کدها (وضعیت نمره) تعریفش کنید.` };
}

const emptyReport = (kind: string, fileName: string, sheet: string): ImportReport =>
  ({ kind, fileName, sheet, total: 0, inserted: 0, updated: 0, invalid: 0, errors: [], warnings: [], sample: [] });

/** واردسازی نمرات قدیمی در جدول staging + ثبت خودکار کدهای دیده‌شده در میز تطبیق */
export async function importGrades(sourceCode: string, tables: Table[], fileName: string, batchId?: number | null): Promise<ImportReport> {
  const table = pickTable(tables, [['شماره دانشجویی', 'student_code'], ['کد درس', 'course_code'], ['نمره', 'grade']]);
  if (!table) return { ...emptyReport('grades', fileName, '-'), errors: [{ row: 0, msg: 'فایل خالی است.' }] };
  const rep = emptyReport('grades', fileName, table.sheet);

  const miss = missingHeaders(table, [
    { title: 'شماره دانشجویی', aliases: ['شماره دانشجویی', 'شماره دانشجو', 'student_code'] },
    { title: 'کد درس', aliases: ['کد درس', 'course_code'] },
    { title: 'کد ترم', aliases: ['کد ترم', 'ترم', 'term_code'] },
  ]);
  if (miss.length) { rep.errors.push({ row: 1, msg: `ستون‌های الزامی یافت نشد: ${miss.join('، ')}` }); return rep; }

  const statusMap = await resolverFor(sourceCode, 'GRADE_STATUS');
  const rows = iterate(table);
  rep.total = rows.length;

  const seenCourses = new Map<string, string>();
  const seenTerms = new Map<string, string>();

  for (const r of rows) {
    const studentCode = r.get(['شماره دانشجویی', 'شماره دانشجو', 'student_code']);
    const courseCode = r.get(['کد درس', 'course_code']);
    const termCode = r.get(['کد ترم', 'ترم', 'term_code']);
    if (!studentCode || !courseCode || !termCode) {
      rep.invalid++; rep.errors.push({ row: r.line, msg: 'شماره دانشجویی، کد درس و کد ترم الزامی است.' }); continue;
    }

    const gradeRaw = r.get(['نمره', 'نمره نهایی', 'grade', 'final_grade']);
    const parsed = parseGrade(gradeRaw, r.get(['وضعیت نمره', 'وضعیت', 'grade_status']), statusMap);
    if (parsed.note) rep.warnings.push({ row: r.line, msg: parsed.note });

    const courseTitle = r.get(['نام درس', 'عنوان درس', 'course_title']);
    if (courseTitle) seenCourses.set(courseCode, courseTitle);
    else if (!seenCourses.has(courseCode)) seenCourses.set(courseCode, '');
    seenTerms.set(termCode, r.get(['عنوان ترم', 'term_title']) || '');

    const values = {
      sourceCode, studentCode, termCode, courseCode, batchId: batchId ?? null,
      studentName: r.get(['نام دانشجو', 'نام و نام خانوادگی', 'student_name']) || null,
      courseTitle: courseTitle || null,
      units: (() => { const u = num(r.get(['واحد', 'تعداد واحد', 'units'])); return u == null ? null : String(u); })(),
      gradeRaw: gradeRaw || null,
      gradeValue: parsed.value == null ? null : String(parsed.value),
      gradeStatus: parsed.status,
      professorName: r.get(['استاد', 'نام استاد', 'professor']) || null,
      compareStatus: 'PENDING',
      raw: JSON.stringify(r.raw),
    };

    const ins = await db.insert(legacy_grades).values(values).onConflictDoUpdate({
      target: [legacy_grades.sourceCode, legacy_grades.studentCode, legacy_grades.termCode, legacy_grades.courseCode],
      set: { ...values, compareStatus: 'PENDING', compareNote: null },
    }).returning({ id: legacy_grades.id, created: sql<boolean>`(xmax = 0)` });

    ins[0]?.created ? rep.inserted++ : rep.updated++;
    if (rep.sample.length < 5) rep.sample.push({ studentCode, courseCode, termCode, grade: values.gradeValue ?? parsed.status });
  }

  // کدهای دیده‌شده وارد میز تطبیق می‌شوند تا کاربر یک‌جا تعیین تکلیف کند
  for (const [code, title] of seenCourses) await upsertLegacyCode({ sourceCode, domain: 'COURSE', legacyCode: code, legacyTitle: title });
  for (const [code, title] of seenTerms) await upsertLegacyCode({ sourceCode, domain: 'TERM', legacyCode: code, legacyTitle: title });

  return rep;
}

export type GradeCompare = {
  total: number; same: number; diff: number; missingInNew: number; noStudent: number; noTerm: number; noCourse: number;
  rows: {
    studentCode: string; termCode: string; courseCode: string; courseTitle: string | null;
    legacy: string; current: string; status: string; note: string;
  }[];
};

const GRADE_STATUS_FA: Record<string, string> = {
  FINALIZED: 'قطعی', TEMPORARY: 'موقت', PENDING: 'ثبت‌نشده', PASSED_NO_GRADE: 'قبول',
  FAILED_NO_GRADE: 'مردود', EXEMPT: 'معادل‌سازی', DROPPED: 'حذف‌شده',
};

const fmtGrade = (value: string | number | null, status: string) =>
  value != null && value !== '' ? Number(value).toFixed(2) : (GRADE_STATUS_FA[status] ?? status);

/**
 * مقایسهٔ نمرات قدیمی با سامانهٔ جدید.
 * ترم و درس از طریق میز تطبیق کدها ترجمه می‌شوند (و اگر تطبیق نبود، تطابق مستقیم کد).
 */
export async function compareGrades(sourceCode: string, termCode?: string): Promise<GradeCompare> {
  const where = termCode
    ? and(eq(legacy_grades.sourceCode, sourceCode), eq(legacy_grades.termCode, termCode))
    : eq(legacy_grades.sourceCode, sourceCode);
  const legacy = await db.select().from(legacy_grades).where(where).orderBy(asc(legacy_grades.studentCode), asc(legacy_grades.courseCode));
  if (!legacy.length) return { total: 0, same: 0, diff: 0, missingInNew: 0, noStudent: 0, noTerm: 0, noCourse: 0, rows: [] };

  const termMap = await resolverFor(sourceCode, 'TERM');
  const courseMap = await resolverFor(sourceCode, 'COURSE');

  const stuRows = await db.select({ id: students.id, code: students.studentCode }).from(students)
    .where(inArray(students.studentCode, [...new Set(legacy.map(l => l.studentCode))]));
  const stu = new Map(stuRows.map(s => [s.code, s.id]));
  const terms = new Map((await db.select({ id: academic_terms.id, code: academic_terms.termCode }).from(academic_terms)).map(t => [norm(t.code), t.id]));
  const crs = new Map((await db.select({ id: courses.id, code: courses.code }).from(courses)).map(c => [norm(c.code), c.id]));

  // نمرات فعلی سامانه برای همان دانشجویان
  const current = await db.select({
    studentId: enrollments.studentId, courseId: course_offerings.courseId, termId: course_offerings.termId,
    gradeValue: enrollments.gradeValue, gradeStatus: enrollments.gradeStatus,
  }).from(enrollments)
    .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
    .where(stuRows.length ? inArray(enrollments.studentId, stuRows.map(s => s.id)) : sql`false`);
  const curMap = new Map(current.map(c => [`${c.studentId}|${c.termId}|${c.courseId}`, c]));

  const out: GradeCompare = { total: legacy.length, same: 0, diff: 0, missingInNew: 0, noStudent: 0, noTerm: 0, noCourse: 0, rows: [] };
  const updates: { id: number; status: string; note: string }[] = [];

  for (const l of legacy) {
    const sid = stu.get(l.studentCode);
    const tid = termMap.get(norm(l.termCode))?.id ?? terms.get(norm(l.termCode)) ?? null;
    const cid = courseMap.get(norm(l.courseCode))?.id ?? crs.get(norm(l.courseCode)) ?? null;
    const legacyText = fmtGrade(l.gradeValue, l.gradeStatus);

    let status: string; let note = '';
    if (!sid) { status = 'NO_STUDENT'; note = 'دانشجو در سامانهٔ جدید نیست — اول فایل دانشجویان را مهاجرت کنید.'; out.noStudent++; }
    else if (!tid) { status = 'NO_TERM'; note = `ترم «${l.termCode}» تطبیق نخورده.`; out.noTerm++; }
    else if (!cid) { status = 'NO_COURSE'; note = `درس «${l.courseCode}» تطبیق نخورده.`; out.noCourse++; }
    else {
      const cur = curMap.get(`${sid}|${tid}|${cid}`);
      if (!cur) { status = 'MISSING_IN_NEW'; note = 'در سامانهٔ جدید ثبت‌نامی برای این درس/ترم نیست — با «اعمال» ساخته می‌شود.'; out.missingInNew++; }
      else {
        const a = l.gradeValue == null ? null : Number(l.gradeValue);
        const b = cur.gradeValue == null ? null : Number(cur.gradeValue);
        const same = (a == null && b == null && l.gradeStatus === cur.gradeStatus) || (a != null && b != null && Math.abs(a - b) < 0.005);
        if (same) { status = 'SAME'; out.same++; }
        else { status = 'DIFF'; note = `قدیمی ${legacyText} ↔ جدید ${fmtGrade(cur.gradeValue, cur.gradeStatus)}`; out.diff++; }
      }
    }

    updates.push({ id: l.id, status, note });
    if (out.rows.length < 500) {
      const cur = sid && tid && cid ? curMap.get(`${sid}|${tid}|${cid}`) : undefined;
      out.rows.push({
        studentCode: l.studentCode, termCode: l.termCode, courseCode: l.courseCode, courseTitle: l.courseTitle,
        legacy: legacyText, current: cur ? fmtGrade(cur.gradeValue, cur.gradeStatus) : '—', status, note,
      });
    }
  }

  for (const u of updates) {
    await db.update(legacy_grades).set({ compareStatus: u.status, compareNote: u.note || null }).where(eq(legacy_grades.id, u.id));
  }
  return out;
}

export type ApplyResult = { created: number; updated: number; skipped: number; errors: string[] };

/**
 * اعمال نمرات قدیمی روی سامانه.
 * • statuses: کدام وضعیت‌های مقایسه اعمال شوند (پیش‌فرض فقط «نبود در سامانهٔ جدید»)
 * • overwrite: نمرهٔ موجود بازنویسی شود یا نه (پیش‌فرض: نه)
 * ثبت‌نام و «ارائهٔ مهاجرتی» در صورت نبود ساخته می‌شود تا کارنامه کامل باشد.
 */
export async function applyGrades(
  sourceCode: string,
  opts: { termCode?: string; statuses?: string[]; overwrite?: boolean; batchId?: number | null; userId?: number | null } = {},
): Promise<ApplyResult> {
  // هرچه اینجا نوشته شود در «دفتر واگرد» سند می‌خورد تا کل عملیات برگشت‌پذیر بماند.
  // شناسهٔ دسته از خود سطر staging برداشته می‌شود تا «واگرد این دسته» دقیقاً همان
  // چیزی را برگرداند که از همان فایل آمده است.
  const baseCtx = { opGroup: 'apply-grades', sourceCode, userId: opts.userId ?? null };
  const ctxOf = (rowBatchId: number | null): AuditCtx => ({ ...baseCtx, batchId: opts.batchId ?? rowBatchId ?? null });
  const statuses = opts.statuses?.length ? opts.statuses : ['MISSING_IN_NEW'];
  const conds = [eq(legacy_grades.sourceCode, sourceCode), inArray(legacy_grades.compareStatus, statuses)];
  if (opts.termCode) conds.push(eq(legacy_grades.termCode, opts.termCode));
  const rows = await db.select().from(legacy_grades).where(and(...conds));

  const termMap = await resolverFor(sourceCode, 'TERM');
  const courseMap = await resolverFor(sourceCode, 'COURSE');
  const terms = new Map((await db.select({ id: academic_terms.id, code: academic_terms.termCode }).from(academic_terms)).map(t => [norm(t.code), t.id]));
  const crs = new Map((await db.select({ id: courses.id, code: courses.code }).from(courses)).map(c => [norm(c.code), c.id]));
  const stu = new Map((await db.select({ id: students.id, code: students.studentCode }).from(students)).map(s => [s.code, s.id]));

  const res: ApplyResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (const l of rows) {
    const ctx = ctxOf(l.batchId ?? null);
    const sid = stu.get(l.studentCode);
    const tid = termMap.get(norm(l.termCode))?.id ?? terms.get(norm(l.termCode)) ?? null;
    let cid = courseMap.get(norm(l.courseCode))?.id ?? crs.get(norm(l.courseCode)) ?? null;
    if (!sid || !tid) { res.skipped++; continue; }

    if (!cid) {
      // درس قدیمیِ بدون معادل: placeholder می‌سازیم تا کارنامه ناقص نماند
      const [nc] = await db.insert(courses).values({
        code: l.courseCode, title: l.courseTitle || `درس مهاجرتی ${l.courseCode}`, units: String(l.units ?? 0),
      }).onConflictDoNothing().returning({ id: courses.id });
      if (nc?.id) await auditInsert(ctx, 'courses', nc.id, { code: l.courseCode });
      cid = nc?.id ?? (await db.select({ id: courses.id }).from(courses).where(eq(courses.code, l.courseCode)).limit(1))[0]?.id ?? null;
      if (cid) crs.set(norm(l.courseCode), cid);
    }
    if (!cid) { res.skipped++; res.errors.push(`درس ${l.courseCode} ساخته نشد.`); continue; }

    let [off] = await db.select({ id: course_offerings.id }).from(course_offerings)
      .where(and(eq(course_offerings.termId, tid), eq(course_offerings.courseId, cid))).limit(1);
    if (!off) {
      [off] = await db.insert(course_offerings).values({
        termId: tid, courseId: cid, capacity: 999, groupNumber: 1, enrolledCount: 0, isActive: 0,
      }).returning({ id: course_offerings.id });
      if (off?.id) await auditInsert(ctx, 'course_offerings', off.id, { termId: tid, courseId: cid });
    }

    const gradeValue = l.gradeValue == null ? null : String(l.gradeValue);
    const existing = await db.select({
      id: enrollments.id, gradeValue: enrollments.gradeValue,
      gradeStatus: enrollments.gradeStatus, hasEvaluated: enrollments.hasEvaluated,
    }).from(enrollments).where(and(eq(enrollments.studentId, sid), eq(enrollments.offeringId, off.id))).limit(1);

    if (existing.length) {
      if (!opts.overwrite) { res.skipped++; continue; }
      const after = { gradeValue, gradeStatus: l.gradeStatus, hasEvaluated: gradeValue != null ? 1 : 0 };
      await db.update(enrollments).set(after).where(eq(enrollments.id, existing[0].id));
      await auditUpdate(ctx, 'enrollments', existing[0].id, {
        gradeValue: existing[0].gradeValue, gradeStatus: existing[0].gradeStatus, hasEvaluated: existing[0].hasEvaluated,
      }, after);
      res.updated++;
    } else {
      const [ne] = await db.insert(enrollments).values({
        studentId: sid, offeringId: off.id, status: 'REGISTERED',
        gradeValue, gradeStatus: l.gradeStatus, hasEvaluated: gradeValue != null ? 1 : 0,
      }).onConflictDoNothing().returning({ id: enrollments.id });
      if (ne?.id) await auditInsert(ctx, 'enrollments', ne.id, { gradeValue, gradeStatus: l.gradeStatus });
      res.created++;
    }
    await db.update(legacy_grades).set({ appliedAt: new Date(), compareStatus: 'SAME', compareNote: 'اعمال شد.' }).where(eq(legacy_grades.id, l.id));
  }
  return res;
}

export async function gradeStats(sourceCode: string) {
  const rows = await db.select({ status: legacy_grades.compareStatus, n: sql<number>`count(*)::int` })
    .from(legacy_grades).where(eq(legacy_grades.sourceCode, sourceCode)).groupBy(legacy_grades.compareStatus);
  return rows.map(r => ({ status: r.status ?? 'PENDING', count: Number(r.n) }));
}
