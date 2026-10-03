'use server';

import { and, asc, eq, inArray, isNull, ne, or, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { academic_terms, courses, degree_level_configs, departments, exam_calendar_configs, faculties, majors, universities } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { normJalali } from '@/lib/exam-scheduler';
import { getCurrentUniversity } from '@/lib/university-scope';
import { faIncludes, normalizeFa } from '@/lib/persian-search';
import { CODE_TABLES, type CodeRow, type CodeStat, type CodeTable, type FormOptions } from './tables';

/**
 * مرکز کدها — یک جای واحد برای تعریف و بازبینی «کد» همهٔ جدول‌های مرجع.
 *
 * چرا لازم است: کد سند اصالت است (کد رشته می‌گوید کدام رشته، کدام مقطع، کدام
 * گروه و کدام دانشکده). تا امروز کدها پراکنده بودند: کد دانشکده هیچ رابطی
 * نداشت، کد گروه فقط از فایل انتقال پر می‌شد و هیچ‌کجا نمی‌شد دید کدام
 * رکوردها بی‌کد یا دارای کد تکراری‌اند.
 */

/**
 * ردیف خام داخلی — scope کلید یکتایی است (مثلاً دانشگاه).
 * چرا: کد ترم و کد درس فقط «درون یک دانشگاه» یکتاست (uq_terms_uni_code و
 * uq_courses_uni_code)، نه سراسری. شمارش سراسری ۲۷۰/۵۲۵ هشدار اشتباه می‌داد
 * در حالی که تکراری واقعی صفر بود. scope=null یعنی سراسری (رشته، مقطع).
 */
type RawRow = {
  id: number;
  code: string | null;
  title: string;
  context: string | null;
  scope: string | null;
  /** فقط برای ترم — تاریخ شروع/پایان (خوانده‌شده با to_char برای پایداری منطقهٔ زمانی) */
  startDate?: string | null;
  endDate?: string | null;
  /** کد استاندارد/کد وزارت — برای اتصال به ثمین */
  standardCode?: string | null;
  ministryCode?: string | null;
};

const dupSet = (rows: RawRow[]) => {
  const seen = new Map<string, number>();
  for (const r of rows) {
    if (!r.code) continue;
    const key = `${r.scope ?? ''}::${r.code}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k));
};

const scopeKey = (r: RawRow) => `${r.scope ?? ''}::${r.code}`;

export async function listCodes(table: CodeTable, q = ''): Promise<CodeRow[]> {
  await requireRole(['ADMIN', 'VICE_EDU', 'EDU_EXPERT']);
  const t = normalizeFa(q).slice(0, 60);
  // دانشگاه فعال از سوییچ سربرگ — همهٔ جدول‌های مرجع (جز مقطع که سراسری است)
  // فقط رکوردهای همین دانشگاه را نشان می‌دهند تا سوییچ واقعاً کار کند.
  const activeUniId = (await getCurrentUniversity())?.id ?? null;
  let raw: RawRow[] = [];

  if (table === 'faculty') {
    raw = (await db
      .select({ id: faculties.id, code: faculties.facultyCode, title: faculties.name,
        standardCode: faculties.standardCode, ministryCode: faculties.ministryCode,
        uni: universities.title, uid: faculties.universityId })
      .from(faculties)
      .leftJoin(universities, eq(universities.id, faculties.universityId))
      .where(activeUniId == null ? undefined : or(eq(faculties.universityId, activeUniId), isNull(faculties.universityId)))
      .orderBy(asc(faculties.name)))
      .map(r => ({ id: r.id, code: r.code, title: r.title, context: r.uni ?? null,
        standardCode: r.standardCode ?? null, ministryCode: r.ministryCode ?? null,
        scope: r.uid != null ? `u${r.uid}` : null }));
  }

  if (table === 'department') {
    raw = (await db
      .select({
        id: departments.id, code: departments.departmentCode, title: departments.name,
        standardCode: departments.standardCode, ministryCode: departments.ministryCode,
        facName: faculties.name, facCode: faculties.facultyCode, facId: departments.facultyId,
        uni: universities.title, uid: faculties.universityId,
      })
      .from(departments)
      .leftJoin(faculties, eq(faculties.id, departments.facultyId))
      .leftJoin(universities, eq(universities.id, faculties.universityId))
      .where(activeUniId == null ? undefined : or(eq(faculties.universityId, activeUniId), isNull(faculties.universityId)))
      .orderBy(asc(faculties.name), asc(departments.name)))
      .map(r => ({ id: r.id, code: r.code, title: r.title,
        context: [r.uni ?? null, r.facName ? `${r.facName}${r.facCode ? ` [${r.facCode}]` : ''}` : null].filter(Boolean).join(' · ') || null,
        standardCode: r.standardCode ?? null, ministryCode: r.ministryCode ?? null,
        // گروه ذیل دانشکده است — تکراری واقعی یعنی کد تکراری در یک دانشکده
        scope: r.facId != null ? `f${r.facId}` : null }));
  }

  if (table === 'major') {
    raw = (await db
      .select({
        id: majors.id, code: majors.majorCode, title: majors.name,
        standardCode: majors.standardCode, ministryCode: majors.ministryCode,
        deg: degree_level_configs.title, dept: departments.name, deptCode: departments.departmentCode,
      })
      .from(majors)
      .leftJoin(degree_level_configs, eq(degree_level_configs.id, majors.degreeLevelId))
      .leftJoin(departments, eq(departments.id, majors.departmentId))
      .where(activeUniId == null ? undefined : or(eq(majors.universityId, activeUniId), isNull(majors.universityId)))
      .orderBy(asc(majors.name)))
      .map(r => ({
        id: r.id, code: r.code, title: r.title,
        context: [r.deg, r.dept ? `${r.dept}${r.deptCode ? ` [${r.deptCode}]` : ''}` : null].filter(Boolean).join(' · ') || null,
        standardCode: r.standardCode ?? null, ministryCode: r.ministryCode ?? null,
        // کد رشته سراسری یکتاست (majorCode unique) — تکراری واقعی است
        scope: null,
      }));
  }

  if (table === 'degree') {
    raw = (await db
      .select({
        id: degree_level_configs.id, code: degree_level_configs.code, title: degree_level_configs.title,
        standardCode: degree_level_configs.standardCode, ministryCode: degree_level_configs.ministryCode,
        termCount: degree_level_configs.termCount, isGraduate: degree_level_configs.isGraduate,
      })
      .from(degree_level_configs)
      // مقطع‌ها عملاً دانشگاه‌محور استفاده می‌شن (هر دانشگاه زیرمجموعهٔ خودش را دارد)
      // ولی مالکیت‌شان به‌هم‌ریخته است (SAMAها همه به نام آفاق‌اند ولی ۴ دانشگاه
      // استفاده‌شان می‌کنند). پس فیلتر = مال خود دانشگاه یا مشترک یا مورداستفادهٔ رشته‌هایش.
      .where(activeUniId == null ? undefined : or(
        eq(degree_level_configs.universityId, activeUniId),
        isNull(degree_level_configs.universityId),
        inArray(degree_level_configs.id, db.select({ id: majors.degreeLevelId }).from(majors).where(eq(majors.universityId, activeUniId))),
      ))
      .orderBy(asc(degree_level_configs.title))).map(r => ({
        ...r,
        context: [
          r.termCount != null ? `${r.termCount} ترمه` : 'ترم: استنتاجی',
          r.isGraduate === 1 ? 'تکمیلی' : null,
        ].filter(Boolean).join(' · ') || null,
        // کد مقطع سراسری یکتاست — تکراری واقعی است
        scope: null,
      }));
  }

  if (table === 'course') {
    raw = (await db
      .select({
        id: courses.id, code: courses.code, title: courses.title,
        standardCode: courses.standardCode, ministryCode: courses.ministryCode,
        dept: departments.name, deg: degree_level_configs.title,
        uni: universities.title, uid: courses.universityId,
      })
      .from(courses)
      .leftJoin(departments, eq(departments.id, courses.departmentId))
      .leftJoin(degree_level_configs, eq(degree_level_configs.id, courses.degreeLevelId))
      .leftJoin(universities, eq(universities.id, courses.universityId))
      .where(activeUniId == null ? undefined : or(eq(courses.universityId, activeUniId), isNull(courses.universityId)))
      .orderBy(asc(courses.code)))
      .map(r => ({ id: r.id, code: r.code, title: r.title,
        context: [r.uni ?? null, r.deg, r.dept].filter(Boolean).join(' · ') || null,
        standardCode: r.standardCode ?? null, ministryCode: r.ministryCode ?? null,
        // کد درس فقط درون یک دانشگاه یکتاست (uq_courses_uni_code)
        scope: r.uid != null ? `u${r.uid}` : null }));
  }

  if (table === 'term') {
    raw = (await db
      .select({ id: academic_terms.id, code: academic_terms.termCode, title: academic_terms.title,
        standardCode: academic_terms.standardCode, ministryCode: academic_terms.ministryCode,
        uni: universities.title, uid: academic_terms.universityId,
        start: sql<string | null>`to_char(${academic_terms.startDate}, 'YYYY-MM-DD"T"HH24:MI')`,
        end: sql<string | null>`to_char(${academic_terms.endDate}, 'YYYY-MM-DD"T"HH24:MI')` })
      .from(academic_terms)
      .leftJoin(universities, eq(universities.id, academic_terms.universityId))
      .where(activeUniId == null ? undefined : or(eq(academic_terms.universityId, activeUniId), isNull(academic_terms.universityId)))
      .orderBy(asc(academic_terms.termCode)))
      .map(r => ({ id: r.id, code: r.code, title: r.title,
        context: r.uni ?? null,
        standardCode: r.standardCode ?? null, ministryCode: r.ministryCode ?? null,
        // کد ترم فقط درون یک دانشگاه یکتاست (uq_terms_uni_code)
        scope: r.uid != null ? `u${r.uid}` : null,
        startDate: r.start, endDate: r.end }));
  }

  const dups = dupSet(raw);
  const rows: CodeRow[] = raw.map(r => ({
    id: r.id, code: r.code, title: r.title, context: r.context,
    duplicate: !!r.code && dups.has(scopeKey(r)),
    startDate: r.startDate ?? null,
    endDate: r.endDate ?? null,
    standardCode: r.standardCode ?? null,
    ministryCode: r.ministryCode ?? null,
  }));
  if (!t) return rows;
  return rows.filter(r => faIncludes(r.title, t) || (r.code ?? '').includes(t) || faIncludes(r.context, t));
}

/** خلاصهٔ سلامت کدها برای همهٔ جدول‌ها — کارت‌های بالای صفحه */
export async function codeStats(): Promise<CodeStat[]> {
  await requireRole(['ADMIN', 'VICE_EDU', 'EDU_EXPERT']);
  const out: CodeStat[] = [];
  for (const t of CODE_TABLES) {
    const rows = await listCodes(t.id);
    out.push({
      ...t,
      total: rows.length,
      missing: rows.filter(r => !r.code).length,
      duplicate: rows.filter(r => r.duplicate).length,
    });
  }
  return out;
}

/** ویرایش کد یک رکورد — با بررسی یکتایی در همان جدول */
export async function setCodeAction(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['ADMIN', 'VICE_EDU']);
  const table = String(fd.get('table') ?? '') as CodeTable;
  const id = Number(fd.get('id') || 0);
  const code = String(fd.get('code') ?? '').trim();
  if (!id) return { ok: false, error: 'رکورد نامعتبر است.' };

  // کدهای ملی/وزارتی (ثمین) — فقط وقتی فرم همین فیلدها را فرستاده باشد تغییر می‌کنند؛
  // فرم‌های قدیمی‌تر (ذخیرهٔ کد از ردیف جدول) اصلاً نمی‌فرستند و ستون‌ها دست‌نخورده می‌مانند.
  const extra: { standardCode?: string | null; ministryCode?: string | null } = {};
  if (fd.has('standardCode')) extra.standardCode = latinDigits(str(fd, 'standardCode')) || null;
  if (fd.has('ministryCode')) extra.ministryCode = latinDigits(str(fd, 'ministryCode')) || null;

  const clash = async (found: { id: number; title: string }[]) =>
    found.length ? { ok: false as const, error: `کد «${code}» قبلاً برای «${found[0].title}» ثبت شده — کد باید یکتا باشد.` } : null;

  if (table === 'faculty') {
    if (code) {
      const c = await clash(await db.select({ id: faculties.id, title: faculties.name }).from(faculties)
        .where(and(eq(faculties.facultyCode, code), ne(faculties.id, id))).limit(1));
      if (c) return c;
    }
    await db.update(faculties).set({ facultyCode: code || null, ...extra }).where(eq(faculties.id, id));
  } else if (table === 'department') {
    if (code) {
      const c = await clash(await db.select({ id: departments.id, title: departments.name }).from(departments)
        .where(and(eq(departments.departmentCode, code), ne(departments.id, id))).limit(1));
      if (c) return c;
    }
    await db.update(departments).set({ departmentCode: code || null, ...extra }).where(eq(departments.id, id));
  } else if (table === 'major') {
    if (code) {
      const c = await clash(await db.select({ id: majors.id, title: majors.name }).from(majors)
        .where(and(eq(majors.majorCode, code), ne(majors.id, id))).limit(1));
      if (c) return c;
    }
    await db.update(majors).set({ majorCode: code || null, ...extra }).where(eq(majors.id, id));
  } else if (table === 'degree') {
    // کد مقطع NOT NULL است — خالی‌کردنش مجاز نیست
    if (!code) return { ok: false, error: 'کد مقطع نمی‌تواند خالی باشد.' };
    const c = await clash(await db.select({ id: degree_level_configs.id, title: degree_level_configs.title }).from(degree_level_configs)
      .where(and(eq(degree_level_configs.code, code), ne(degree_level_configs.id, id))).limit(1));
    if (c) return c;
    await db.update(degree_level_configs).set({ code, ...extra }).where(eq(degree_level_configs.id, id));
  } else if (table === 'course') {
    if (!code) return { ok: false, error: 'کد درس نمی‌تواند خالی باشد.' };
    const c = await clash(await db.select({ id: courses.id, title: courses.title }).from(courses)
      .where(and(eq(courses.code, code), ne(courses.id, id))).limit(1));
    if (c) return c;
    await db.update(courses).set({ code, ...extra }).where(eq(courses.id, id));
  } else if (table === 'term') {
    // کد ترم از این صفحه ویرایش‌پذیر نیست — فقط کدهای ثمینی قابل ثبت‌اند
    if (!Object.keys(extra).length) return { ok: false, error: 'کد این جدول از این صفحه قابل ویرایش نیست.' };
    await db.update(academic_terms).set({ ...extra }).where(eq(academic_terms.id, id));
  } else {
    return { ok: false, error: 'کد این جدول از این صفحه قابل ویرایش نیست.' };
  }

  revalidatePath('/admin/codes');
  revalidatePath('/admin/departments');
  return { ok: true };
}

/** شمار رکوردهای بی‌کد در هر جدول — برای هشدار پیش از انتقال داده */
export async function missingCodeSummary(): Promise<{ table: string; missing: number }[]> {
  // گارد صریح: حتی با صدا کردن codeStatsِ گارددار، خودِ اکشن هم باید گارد داشته باشد
  // (ممیزی استاتیک CI اکشن‌های 'use server' را تک‌تک می‌سنجد؛ لایهٔ دوم دفاع).
  await requireRole(['ADMIN', 'VICE_EDU', 'EDU_EXPERT']);
  const stats = await codeStats();
  return stats.filter(s => s.missing > 0).map(s => ({ table: s.title, missing: s.missing }));
}

export async function exportCodesCsv(table: CodeTable): Promise<string> {
  await requireRole(['ADMIN', 'VICE_EDU', 'EDU_EXPERT']);
  const rows = await listCodes(table);
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = 'کد,عنوان,زمینه,کد استاندارد,کد وزارت\n';
  return head + rows.map(r => [esc(r.code ?? ''), esc(r.title), esc(r.context ?? ''),
    esc(r.standardCode ?? ''), esc(r.ministryCode ?? '')].join(',')).join('\n');
}

/** شمار کل رکوردهای هر جدول بدون بارگذاری کامل — برای صفحه‌های بزرگ مثل دروس */
export async function countRows(table: CodeTable): Promise<number> {
  await requireRole(['ADMIN', 'VICE_EDU', 'EDU_EXPERT']);
  const map = { faculty: faculties, department: departments, major: majors, degree: degree_level_configs, course: courses, term: academic_terms } as const;
  const [r] = await db.select({ c: sql<number>`count(*)::int` }).from(map[table]);
  return r?.c ?? 0;
}


// ────────────────────────── ساخت و حذف رکورد مرجع ──────────────────────────
//
// چرا اینجا: مقطع تحصیلی، دانشکده و رشته تا امروز هیچ رابط ساختی نداشتند و فقط
// از دادهٔ پایه (seed) یا فایل انتقال ساخته می‌شدند. یعنی اگر دانشگاه مقطع تازه‌ای
// اضافه می‌کرد، هیچ راهی جز دست‌کاری مستقیم دیتابیس نبود. گروه آموزشی صفحهٔ خودش
// را دارد و درس در کارتابل مدیر گروه ساخته می‌شود، پس اینجا تکرار نمی‌شوند.

/** گزینه‌های والد برای فرم ساخت رشته */
export async function codeFormOptions(): Promise<FormOptions> {
  await requireRole(['ADMIN', 'VICE_EDU', 'EDU_EXPERT']);
  const [degs, deps, facs] = await Promise.all([
    db.select({ id: degree_level_configs.id, title: degree_level_configs.title, code: degree_level_configs.code })
      .from(degree_level_configs).orderBy(asc(degree_level_configs.title)),
    db.select({ id: departments.id, name: departments.name, code: departments.departmentCode, fac: faculties.name })
      .from(departments).leftJoin(faculties, eq(faculties.id, departments.facultyId))
      .orderBy(asc(faculties.name), asc(departments.name)),
    db.select({ id: faculties.id, name: faculties.name, code: faculties.facultyCode })
      .from(faculties).orderBy(asc(faculties.name)),
  ]);
  return {
    degree: degs.map(d => ({ value: String(d.id), label: `${d.title} [${d.code}]` })),
    department: deps.map(d => ({
      value: String(d.id),
      label: `${d.name}${d.code ? ` [${d.code}]` : ''}${d.fac ? ` ? ${d.fac}` : ''}`,
    })),
    faculty: facs.map(f => ({
      value: String(f.id),
      label: `${f.name}${f.code ? ` [${f.code}]` : ''}`,
    })),
  };
}

const num = (fd: FormData, k: string): number | null => {
  const v = String(fd.get(k) ?? '').trim();
  if (!v) return null;
  const n = Number(v.replace(/[۰-۹]/g, c => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))));
  return Number.isFinite(n) ? n : null;
};
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

/** کاربر ممکن است کد را با ارقام فارسی بنویسد؛ کد باید لاتین ذخیره شود
 *  وگرنه با کدِ همان ردیف در فایل اکسل مبدأ تطبیق نمی‌خورد. */
const latinDigits = (v: string) =>
  v.replace(/[۰-۹]/g, c => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
   .replace(/[٠-٩]/g, c => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));

/** کد استاندارد/کد وزارت (ثمین) — خالی یا غایب → null (ستون‌ها nullable) */
const optCode = (fd: FormData, k: string): string | null => latinDigits(str(fd, k)) || null;

/** افزودن رکورد مرجع تازه — مقطع، دانشکده یا رشته */
export async function createCodeRowAction(fd: FormData): Promise<{ ok: boolean; error?: string; id?: number }> {
  await requireRole(['ADMIN', 'VICE_EDU']);
  const table = str(fd, 'table') as CodeTable;
  const code = latinDigits(str(fd, 'code'));

  try {
    if (table === 'degree') {
      const title = str(fd, 'title');
      if (!title) return { ok: false, error: 'عنوان مقطع را وارد کنید.' };
      if (!code) return { ok: false, error: 'کد مقطع الزامی است — در فایل‌های دانشجو و درس با همین کد تطبیق داده می‌شود.' };

      const dupCode = await db.select({ t: degree_level_configs.title }).from(degree_level_configs)
        .where(eq(degree_level_configs.code, code)).limit(1);
      if (dupCode.length) return { ok: false, error: `کد «${code}» قبلاً برای مقطع «${dupCode[0].t}» ثبت شده.` };

      const dupTitle = await db.select({ c: degree_level_configs.code }).from(degree_level_configs)
        .where(eq(degree_level_configs.title, title)).limit(1);
      if (dupTitle.length) return { ok: false, error: `مقطعی با عنوان «${title}» از قبل هست (کد ${dupTitle[0].c}).` };

      const pass = num(fd, 'defaultPassingGrade') ?? 10;
      const cond = num(fd, 'conditionalGpaThreshold') ?? 12;
      const maxU = num(fd, 'maxUnitsPerTerm') ?? 20;
      if (pass < 0 || pass > 20) return { ok: false, error: 'نمرهٔ قبولی باید بین ۰ تا ۲۰ باشد.' };
      if (cond < 0 || cond > 20) return { ok: false, error: 'معدل مشروطی باید بین ۰ تا ۲۰ باشد.' };
      if (maxU < 1 || maxU > 60) return { ok: false, error: 'سقف واحد ترم باید بین ۱ تا ۶۰ باشد.' };
      const termCount = num(fd, 'termCount');
      if (termCount == null || !Number.isInteger(termCount) || termCount < 1 || termCount > 12) {
        return { ok: false, error: 'تعداد ترم تحصیل باید عدد صحیح بین ۱ تا ۱۲ باشد.' };
      }
      const gradRaw = str(fd, 'isGraduate');
      if (gradRaw !== '0' && gradRaw !== '1') return { ok: false, error: 'وضعیت تحصیلات تکمیلی نامعتبر است.' };

      const [row] = await db.insert(degree_level_configs).values({
        title, code,
        standardCode: optCode(fd, 'standardCode'),
        ministryCode: optCode(fd, 'ministryCode'),
        defaultPassingGrade: pass.toFixed(2),
        conditionalGpaThreshold: cond.toFixed(2),
        maxUnitsPerTerm: maxU,
        termCount,
        isGraduate: Number(gradRaw),
      }).returning({ id: degree_level_configs.id });
      revalidatePath('/admin/codes');
      return { ok: true, id: row.id };
    }

    if (table === 'faculty') {
      const name = str(fd, 'name');
      if (!name) return { ok: false, error: 'نام دانشکده را وارد کنید.' };
      const dupName = await db.select({ id: faculties.id }).from(faculties).where(eq(faculties.name, name)).limit(1);
      if (dupName.length) return { ok: false, error: `دانشکدهٔ «${name}» از قبل ثبت شده.` };
      if (code) {
        const d = await db.select({ n: faculties.name }).from(faculties).where(eq(faculties.facultyCode, code)).limit(1);
        if (d.length) return { ok: false, error: `کد «${code}» قبلاً برای «${d[0].n}» ثبت شده.` };
      }
      const [row] = await db.insert(faculties).values({
        name, facultyCode: code || null,
        standardCode: optCode(fd, 'standardCode'),
        ministryCode: optCode(fd, 'ministryCode'),
      }).returning({ id: faculties.id });
      revalidatePath('/admin/codes');
      revalidatePath('/admin/departments');
      return { ok: true, id: row.id };
    }

    if (table === 'major') {
      const name = str(fd, 'name');
      const degreeLevelId = num(fd, 'degreeLevelId');
      if (!name) return { ok: false, error: 'نام رشته را وارد کنید.' };
      if (!degreeLevelId) return { ok: false, error: 'مقطع رشته را انتخاب کنید — رشته بدون مقطع معنا ندارد.' };
      if (code) {
        const d = await db.select({ n: majors.name }).from(majors).where(eq(majors.majorCode, code)).limit(1);
        if (d.length) return { ok: false, error: `کد «${code}» قبلاً برای رشتهٔ «${d[0].n}» ثبت شده.` };
      }
      const departmentId = num(fd, 'departmentId');
      // دانشکده را از روی گروه استنتاج می‌کنیم تا زنجیرهٔ رشته→گروه→دانشکده نشکند
      let facultyId: number | null = null;
      if (departmentId) {
        const [dep] = await db.select({ f: departments.facultyId }).from(departments)
          .where(eq(departments.id, departmentId)).limit(1);
        facultyId = dep?.f ?? null;
      }
      const minUnits = num(fd, 'minUnits');
      const [row] = await db.insert(majors).values({
        name, degreeLevelId, departmentId, facultyId,
        majorCode: code || null,
        standardCode: optCode(fd, 'standardCode'),
        ministryCode: optCode(fd, 'ministryCode'),
        minUnits: minUnits && minUnits > 0 && minUnits <= 400 ? minUnits : null,
      }).returning({ id: majors.id });
      revalidatePath('/admin/codes');
      return { ok: true, id: row.id };
    }

    if (table === 'term') {
      const title = str(fd, 'title');
      const termType = str(fd, 'termType') || 'NORMAL';
      if (!code) return { ok: false, error: 'کد ترم الزامی است — مثلاً 4031.' };
      if (!/^[0-9A-Za-z_-]{2,10}$/.test(code)) {
        return { ok: false, error: 'کد ترم باید ۲ تا ۱۰ نویسهٔ لاتین/رقم باشد — مثلاً 4031.' };
      }
      if (!title) return { ok: false, error: 'عنوان ترم را وارد کنید.' };
      if (!['NORMAL', 'SUMMER', 'EQUIVALENCE'].includes(termType)) {
        return { ok: false, error: 'نوع ترم نامعتبر است.' };
      }
      const dup = await db.select({ t: academic_terms.title }).from(academic_terms)
        .where(eq(academic_terms.termCode, code)).limit(1);
      if (dup.length) return { ok: false, error: `کد ترم «${code}» قبلاً برای «${dup[0].t}» ثبت شده.` };

      // ترم تازه هرگز ترم جاری نیست و انتخاب واحدش باز نیست؛ این‌ها را
      // مسئول آموزش آگاهانه در تنظیمات ترم فعال می‌کند، نه هنگام ساخت کد.
      const [row] = await db.insert(academic_terms).values({
        termCode: code, title, termType,
        standardCode: optCode(fd, 'standardCode'),
        ministryCode: optCode(fd, 'ministryCode'),
        isSummer: termType === 'SUMMER' ? 1 : 0,
        isCurrent: 0, isEnrollmentOpen: 0,
      }).returning({ id: academic_terms.id });
      revalidatePath('/admin/codes');
      return { ok: true, id: row.id };
    }

    return { ok: false, error: 'ساخت رکورد برای این جدول از این صفحه ممکن نیست.' };
  } catch (e) {
    // اگر دو کاربر هم‌زمان کد یکسانی ثبت کنند، بررسی‌های بالا از هم رد می‌شوند
    // و داور نهایی خود دیتابیس است — پیامش را فارسی می‌کنیم.
    if ((e as { code?: string })?.code === '23505') {
      return { ok: false, error: `کد «${code}» هم‌اکنون توسط رکورد دیگری گرفته شد — کد دیگری بگذارید.` };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `ثبت نشد: ${msg}` };
  }
}

/** سطرهای قابل ویرایش با فرم عمومی (گروه آموزشی، رشته، درس، دانشکده) */
export type EditableCodeRow = Record<string, string> | null;

/** خواندن یک سطر برای فرم ویرایش عمومی */
export async function getCodeRowAction(table: CodeTable, id: number): Promise<EditableCodeRow> {
  await requireRole(['ADMIN', 'VICE_EDU', 'EDU_EXPERT']);
  if (!id) return null;
  const uni = await getCurrentUniversity();
  const uniId = uni?.id;
  const str_ = (v: unknown) => (v == null ? '' : String(v));

  if (table === 'faculty') {
    const [r] = await db.select({
      name: faculties.name, code: faculties.facultyCode,
      standardCode: faculties.standardCode, ministryCode: faculties.ministryCode,
    }).from(faculties).where(and(eq(faculties.id, id), eq(faculties.universityId, uniId))).limit(1);
    return r ? Object.fromEntries(Object.entries(r).map(([k, v]) => [k, str_(v)])) : null;
  }
  if (table === 'department') {
    const [r] = await db.select({
      name: departments.name, code: departments.departmentCode,
      facultyId: departments.facultyId, standardCode: departments.standardCode,
    }).from(departments).where(and(eq(departments.id, id), eq(departments.universityId, uniId))).limit(1);
    return r ? Object.fromEntries(Object.entries(r).map(([k, v]) => [k, str_(v)])) : null;
  }
  if (table === 'major') {
    const [r] = await db.select({
      name: majors.name, code: majors.majorCode, degreeLevelId: majors.degreeLevelId,
      departmentId: majors.departmentId, minUnits: majors.minUnits,
      standardCode: majors.standardCode,
    }).from(majors).where(and(eq(majors.id, id), eq(majors.universityId, uniId))).limit(1);
    return r ? Object.fromEntries(Object.entries(r).map(([k, v]) => [k, str_(v)])) : null;
  }
  if (table === 'course') {
    const [r] = await db.select({
      title: courses.title, code: courses.code, standardCode: courses.standardCode,
    }).from(courses).where(and(eq(courses.id, id), eq(courses.universityId, uniId))).limit(1);
    return r ? Object.fromEntries(Object.entries(r).map(([k, v]) => [k, str_(v)])) : null;
  }
  return null;
}

/**
 * ویرایش عمومی سطرهای کد (گروه/رشته/درس/دانشکده).
 * فقط فیلدهای همین فرم نوشته می‌شوند و هر نوشتن به دانشگاهِ جاری محدود است.
 */
export async function updateCodeRowAction(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['ADMIN', 'VICE_EDU']);
  const table = str(fd, 'table') as CodeTable;
  const id = Number(fd.get('id') || 0);
  if (!id) return { ok: false, error: 'شناسهٔ سطر نامعتبر است.' };
  const uni = await getCurrentUniversity();
  const uniId = uni?.id;
  if (uniId == null) return { ok: false, error: 'دانشگاه جاری مشخص نیست.' };

  try {
    if (table === 'faculty') {
      const name = str(fd, 'name');
      if (!name) return { ok: false, error: 'نام دانشکده را وارد کنید.' };
      const dup = await db.select({ id: faculties.id }).from(faculties)
        .where(and(eq(faculties.name, name), eq(faculties.universityId, uniId))).limit(1);
      if (dup.length && dup[0].id !== id) return { ok: false, error: `دانشکدهٔ «${name}» از قبل ثبت شده.` };
      const [r] = await db.update(faculties).set({
        name,
        standardCode: optCode(fd, 'standardCode'),
      }).where(and(eq(faculties.id, id), eq(faculties.universityId, uniId))).returning({ id: faculties.id });
      if (!r) return { ok: false, error: 'سطر یافت نشد (یا متعلق به دانشگاه دیگری است).' };
      revalidatePath('/admin/codes');
      revalidatePath('/admin/departments');
      return { ok: true };
    }

    if (table === 'department') {
      const name = str(fd, 'name');
      if (!name) return { ok: false, error: 'نام گروه آموزشی را وارد کنید.' };
      const facultyId = num(fd, 'facultyId');
      if (!facultyId) return { ok: false, error: 'دانشکدهٔ گروه را انتخاب کنید.' };
      const [r] = await db.update(departments).set({
        name,
        facultyId,
        standardCode: optCode(fd, 'standardCode'),
      }).where(and(eq(departments.id, id), eq(departments.universityId, uniId))).returning({ id: departments.id });
      if (!r) return { ok: false, error: 'سطر یافت نشد (یا متعلق به دانشگاه دیگری است).' };
      revalidatePath('/admin/codes');
      revalidatePath('/admin/departments');
      return { ok: true };
    }

    if (table === 'major') {
      const name = str(fd, 'name');
      const degreeLevelId = num(fd, 'degreeLevelId');
      if (!name) return { ok: false, error: 'نام رشته را وارد کنید.' };
      if (!degreeLevelId) return { ok: false, error: 'مقطع رشته را انتخاب کنید.' };
      const departmentId = num(fd, 'departmentId') ?? null;
      let facultyId: number | null = null;
      if (departmentId) {
        const [dep] = await db.select({ f: departments.facultyId }).from(departments)
          .where(eq(departments.id, departmentId)).limit(1);
        facultyId = dep?.f ?? null;
      }
      const minUnits = num(fd, 'minUnits');
      const [r] = await db.update(majors).set({
        name, degreeLevelId, departmentId, facultyId,
        standardCode: optCode(fd, 'standardCode'),
        minUnits: minUnits && minUnits > 0 && minUnits <= 400 ? minUnits : null,
      }).where(and(eq(majors.id, id), eq(majors.universityId, uniId))).returning({ id: majors.id });
      if (!r) return { ok: false, error: 'سطر یافت نشد (یا متعلق به دانشگاه دیگری است).' };
      revalidatePath('/admin/codes');
      return { ok: true };
    }

    if (table === 'course') {
      const title = str(fd, 'title');
      if (!title) return { ok: false, error: 'عنوان درس را وارد کنید.' };
      const [r] = await db.update(courses).set({
        title,
        standardCode: optCode(fd, 'standardCode'),
      }).where(and(eq(courses.id, id), eq(courses.universityId, uniId))).returning({ id: courses.id });
      if (!r) return { ok: false, error: 'سطر یافت نشد (یا متعلق به دانشگاه دیگری است).' };
      revalidatePath('/admin/codes');
      return { ok: true };
    }

    return { ok: false, error: 'ویرایش این جدول از این صفحه ممکن نیست.' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `ثبت نشد: ${msg}` };
  }
}

export type DegreeDetail = {
  id: number; title: string; code: string;
  standardCode: string | null; ministryCode: string | null;
  defaultPassingGrade: string; conditionalGpaThreshold: string;
  maxUnitsPerTerm: number | null; termCount: number | null; isGraduate: number | null;
} | null;

/** خواندن یک مقطع برای فرم ویرایش — همان فیلدهای فرم ساخت */
export async function getDegreeRowAction(id: number): Promise<DegreeDetail> {
  await requireRole(['ADMIN', 'VICE_EDU', 'EDU_EXPERT']);
  if (!id) return null;
  const [r] = await db.select({
    id: degree_level_configs.id, title: degree_level_configs.title, code: degree_level_configs.code,
    standardCode: degree_level_configs.standardCode, ministryCode: degree_level_configs.ministryCode,
    defaultPassingGrade: degree_level_configs.defaultPassingGrade,
    conditionalGpaThreshold: degree_level_configs.conditionalGpaThreshold,
    maxUnitsPerTerm: degree_level_configs.maxUnitsPerTerm,
    termCount: degree_level_configs.termCount, isGraduate: degree_level_configs.isGraduate,
  }).from(degree_level_configs).where(eq(degree_level_configs.id, id)).limit(1);
  return r ?? null;
}

/** ویرایش مقطع — همهٔ فیلدهای فرم ساخت؛ کد با همان قاعدهٔ یکتاییِ ویرایش کد */
export async function updateDegreeRowAction(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['ADMIN', 'VICE_EDU']);
  const id = Number(fd.get('id') || 0);
  if (!id) return { ok: false, error: 'رکورد نامعتبر است.' };
  const [exists] = await db.select({ id: degree_level_configs.id }).from(degree_level_configs).where(eq(degree_level_configs.id, id)).limit(1);
  if (!exists) return { ok: false, error: 'مقطع یافت نشد.' };

  const title = str(fd, 'title');
  const code = latinDigits(str(fd, 'code'));
  if (!title) return { ok: false, error: 'عنوان مقطع را وارد کنید.' };
  if (!code) return { ok: false, error: 'کد مقطع نمی‌تواند خالی باشد.' };
  const clashCode = await db.select({ t: degree_level_configs.title }).from(degree_level_configs)
    .where(and(eq(degree_level_configs.code, code), ne(degree_level_configs.id, id))).limit(1);
  if (clashCode.length) return { ok: false, error: `کد «${code}» قبلاً برای «${clashCode[0].t}» ثبت شده.` };
  const clashTitle = await db.select({ c: degree_level_configs.code }).from(degree_level_configs)
    .where(and(eq(degree_level_configs.title, title), ne(degree_level_configs.id, id))).limit(1);
  if (clashTitle.length) return { ok: false, error: `مقطع «${title}» از قبل هست (کد ${clashTitle[0].c}).` };

  const pass = num(fd, 'defaultPassingGrade') ?? 10;
  const cond = num(fd, 'conditionalGpaThreshold') ?? 12;
  const maxU = num(fd, 'maxUnitsPerTerm') ?? 20;
  if (pass < 0 || pass > 20) return { ok: false, error: 'نمرهٔ قبولی باید بین ۰ تا ۲۰ باشد.' };
  if (cond < 0 || cond > 20) return { ok: false, error: 'معدل مشروطی باید بین ۰ تا ۲۰ باشد.' };
  if (maxU < 1 || maxU > 60) return { ok: false, error: 'سقف واحد ترم باید بین ۱ تا ۶۰ باشد.' };
  const termCount = num(fd, 'termCount');
  if (termCount == null || !Number.isInteger(termCount) || termCount < 1 || termCount > 12) {
    return { ok: false, error: 'تعداد ترم تحصیل باید عدد صحیح بین ۱ تا ۱۲ باشد.' };
  }
  const gradRaw = str(fd, 'isGraduate');
  if (gradRaw !== '0' && gradRaw !== '1') return { ok: false, error: 'وضعیت تحصیلات تکمیلی نامعتبر است.' };

  await db.update(degree_level_configs).set({
    title, code,
    standardCode: optCode(fd, 'standardCode'),
    ministryCode: optCode(fd, 'ministryCode'),
    defaultPassingGrade: pass.toFixed(2),
    conditionalGpaThreshold: cond.toFixed(2),
    maxUnitsPerTerm: maxU,
    termCount,
    isGraduate: Number(gradRaw),
  }).where(eq(degree_level_configs.id, id));
  revalidatePath('/admin/codes');
  return { ok: true };
}

// ────────────────────────── ویرایش ترم (زمان‌بندی تحصیلی) ──────────────────────────

/** قالب یکسان خواندن timestampها برای ورودی datetime-local (بدون وابستگی به منطقهٔ زمانی سرور) */
const DT_FMT = 'YYYY-MM-DD"T"HH24:MI';
const dtRead = (c: SQLWrapper) =>
  sql<string | null>`to_char(${c}, ${DT_FMT})`;

/**
 * خواندن یک ترم برای فرم ویرایش — همهٔ زمان‌بندی‌ها: شروع/پایان ترم، انتخاب
 * واحد، حذف و اضافه، مهلت نمره و اعتراض، پنجرهٔ کل امتحانات ( Jalali ).
 */
export async function getTermRowAction(id: number): Promise<Record<string, string> | null> {
  await requireRole(['ADMIN', 'VICE_EDU', 'EDU_EXPERT']);
  if (!id) return null;
  const [r] = await db.select({
    title: academic_terms.title,
    termType: academic_terms.termType,
    standardCode: academic_terms.standardCode,
    ministryCode: academic_terms.ministryCode,
    academicYear: academic_terms.academicYear,
    startDate: dtRead(academic_terms.startDate),
    endDate: dtRead(academic_terms.endDate),
    enrollmentStartDate: dtRead(academic_terms.enrollmentStartDate),
    enrollmentEndDate: dtRead(academic_terms.enrollmentEndDate),
    addDropStartDate: dtRead(academic_terms.addDropStartDate),
    addDropEndDate: dtRead(academic_terms.addDropEndDate),
    gradeEntryDeadline: dtRead(academic_terms.gradeEntryDeadline),
    appealWindowDays: academic_terms.appealWindowDays,
    professorAppealSlaDays: academic_terms.professorAppealSlaDays,
    isCurrent: academic_terms.isCurrent,
    isEnrollmentOpen: academic_terms.isEnrollmentOpen,
  }).from(academic_terms).where(eq(academic_terms.id, id)).limit(1);
  if (!r) return null;
  const [z] = await db.select({
    globalStart: exam_calendar_configs.globalStart,
    globalEnd: exam_calendar_configs.globalEnd,
  }).from(exam_calendar_configs).where(eq(exam_calendar_configs.termId, id)).limit(1);

  return {
    title: r.title,
    termType: r.termType,
    standardCode: r.standardCode ?? '',
    ministryCode: r.ministryCode ?? '',
    academicYear: r.academicYear != null ? String(r.academicYear) : '',
    startDate: r.startDate ?? '',
    endDate: r.endDate ?? '',
    enrollmentStartDate: r.enrollmentStartDate ?? '',
    enrollmentEndDate: r.enrollmentEndDate ?? '',
    addDropStartDate: r.addDropStartDate ?? '',
    addDropEndDate: r.addDropEndDate ?? '',
    gradeEntryDeadline: r.gradeEntryDeadline ?? '',
    appealWindowDays: r.appealWindowDays != null ? String(r.appealWindowDays) : '3',
    professorAppealSlaDays: r.professorAppealSlaDays != null ? String(r.professorAppealSlaDays) : '5',
    isCurrent: r.isCurrent === 1 ? '1' : '0',
    isEnrollmentOpen: r.isEnrollmentOpen === 1 ? '1' : '0',
    examStartDate: z?.globalStart ?? '',
    examEndDate: z?.globalEnd ?? '',
  };
}

/** تبدیل مقدار datetime-local به timestamp دیتابیس (رشتهٔ خام — بدون Date و منطقهٔ زمانی) */
const dtWrite = (v: string | null): SQL | null =>
  v == null ? null : sql`${v}::timestamp`;

export async function updateTermRowAction(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireRole(['ADMIN', 'VICE_EDU', 'EDU_EXPERT']);
  const id = Number(fd.get('id') || 0);
  if (!id) return { ok: false, error: 'رکورد نامعتبر است.' };
  const [term] = await db.select({
    id: academic_terms.id, universityId: academic_terms.universityId,
  }).from(academic_terms).where(eq(academic_terms.id, id)).limit(1);
  if (!term) return { ok: false, error: 'ترم یافت نشد.' };

  const title = str(fd, 'title');
  if (!title) return { ok: false, error: 'عنوان ترم را وارد کنید.' };
  const termType = str(fd, 'termType');
  if (!['NORMAL', 'SUMMER', 'EQUIVALENCE', 'SPECIAL'].includes(termType)) {
    return { ok: false, error: 'نوع ترم نامعتبر است.' };
  }
  const year = num(fd, 'academicYear');
  if (year != null && (!Number.isInteger(year) || year < 1300 || year > 1500)) {
    return { ok: false, error: 'سال تحصیلی باید عدد صحیح بین ۱۳۰۰ تا ۱۵۰۰ باشد (مثلاً 1403).' };
  }

  // زمان‌بندی‌های datetime-local: خالی = null
  const DT_FIELDS = ['startDate', 'endDate', 'enrollmentStartDate', 'enrollmentEndDate',
    'addDropStartDate', 'addDropEndDate', 'gradeEntryDeadline'] as const;
  const vals: Record<string, string | null> = {};
  for (const f of DT_FIELDS) {
    const v = str(fd, f);
    if (!v) { vals[f] = null; continue; }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) {
      return { ok: false, error: `مقدار «${f}» نامعتبر است.` };
    }
    vals[f] = v;
  }
  if (vals.startDate && vals.endDate && vals.endDate < vals.startDate) {
    return { ok: false, error: 'پایان ترم قبل از شروع آن است.' };
  }
  if (vals.enrollmentStartDate && vals.enrollmentEndDate && vals.enrollmentEndDate < vals.enrollmentStartDate) {
    return { ok: false, error: 'پایان انتخاب واحد قبل از شروع آن است.' };
  }
  if (vals.addDropStartDate && vals.addDropEndDate && vals.addDropEndDate < vals.addDropStartDate) {
    return { ok: false, error: 'پایان حذف و اضافه قبل از شروع آن است.' };
  }

  const appeal = num(fd, 'appealWindowDays');
  if (appeal == null || appeal < 0 || appeal > 365) {
    return { ok: false, error: 'مهلت اعتراض دانشجو باید بین ۰ تا ۳۶۵ روز باشد.' };
  }
  const sla = num(fd, 'professorAppealSlaDays');
  if (sla == null || sla < 0 || sla > 365) {
    return { ok: false, error: 'مهلت پاسخ استاد باید بین ۰ تا ۳۶۵ روز باشد.' };
  }
  const isCur = str(fd, 'isCurrent') === '1' ? 1 : 0;
  const isEnr = str(fd, 'isEnrollmentOpen') === '1' ? 1 : 0;

  // پنجرهٔ امتحانات — تاریخ شمسی 'YYYY/M/D' در exam_calendar_configs (به شمسی ذخیره می‌شود)
  const exS = str(fd, 'examStartDate');
  const exE = str(fd, 'examEndDate');
  if ((exS && !exE) || (!exS && exE)) {
    return { ok: false, error: 'هر دو تاریخ شروع و پایان امتحانات را وارد کنید (یا هر دو را خالی بگذارید).' };
  }
  let zoning: { a: string; b: string } | null = null;
  if (exS && exE) {
    if (!/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(exS) || !/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(exE)) {
      return { ok: false, error: 'تاریخ امتحانات باید شمسی باشد — مانند 1404/01/15.' };
    }
    const a = normJalali(exS);
    const b = normJalali(exE);
    if (b < a) return { ok: false, error: 'پایان امتحانات قبل از شروع آن است.' };
    zoning = { a, b };
  }

  await db.update(academic_terms).set({
    title, termType,
    standardCode: optCode(fd, 'standardCode'),
    ministryCode: optCode(fd, 'ministryCode'),
    academicYear: year ?? null,
    startDate: dtWrite(vals.startDate),
    endDate: dtWrite(vals.endDate),
    enrollmentStartDate: dtWrite(vals.enrollmentStartDate),
    enrollmentEndDate: dtWrite(vals.enrollmentEndDate),
    addDropStartDate: dtWrite(vals.addDropStartDate),
    addDropEndDate: dtWrite(vals.addDropEndDate),
    gradeEntryDeadline: dtWrite(vals.gradeEntryDeadline),
    appealWindowDays: appeal,
    professorAppealSlaDays: sla,
    isCurrent: isCur,
    isEnrollmentOpen: isEnr,
  }).where(eq(academic_terms.id, id));

  // «ترم جاری» و «باز بودن انتخاب واحد» در هر دانشگاه فقط یکی است — بقیه خاموش می‌شوند
  const uniScope = term.universityId != null
    ? eq(academic_terms.universityId, term.universityId)
    : isNull(academic_terms.universityId);
  if (isCur) {
    await db.update(academic_terms).set({ isCurrent: 0 })
      .where(and(eq(academic_terms.isCurrent, 1), uniScope, ne(academic_terms.id, id)));
  }
  if (isEnr) {
    await db.update(academic_terms).set({ isEnrollmentOpen: 0 })
      .where(and(eq(academic_terms.isEnrollmentOpen, 1), uniScope, ne(academic_terms.id, id)));
  }

  // پنجرهٔ امتحانات: upsert در exam_calendar_configs — بازه‌های عمومی/تخصصی
  // قبلی داخل بازهٔ جدید clamp می‌شوند (تغییر جزئیات در ماژول امتحانات).
  if (zoning) {
    const [z] = await db.select().from(exam_calendar_configs)
      .where(eq(exam_calendar_configs.termId, id)).limit(1);
    const clamp = (v: string | null | undefined): string => {
      if (!v) return zoning!.a;
      return v < zoning!.a ? zoning!.a : v > zoning!.b ? zoning!.b : v;
    };
    if (z) {
      await db.update(exam_calendar_configs).set({
        globalStart: zoning.a, globalEnd: zoning.b,
        generalStart: clamp(z.generalStart), generalEnd: clamp(z.generalEnd),
        specializedStart: clamp(z.specializedStart), specializedEnd: clamp(z.specializedEnd),
        updatedByUserId: actor.id, updatedAt: new Date(),
      }).where(eq(exam_calendar_configs.id, z.id));
    } else {
      await db.insert(exam_calendar_configs).values({
        termId: id,
        globalStart: zoning.a, globalEnd: zoning.b,
        generalStart: zoning.a, generalEnd: zoning.b,
        specializedStart: zoning.a, specializedEnd: zoning.b,
        universityId: term.universityId,
        updatedByUserId: actor.id,
      });
    }
  }

  revalidatePath('/admin/codes');
  revalidatePath('/admin/exams');
  return { ok: true };
}

/**
 * حذف رکورد مرجع — فقط وقتی هیچ‌جا استفاده نشده باشد.
 *
 * به‌جای شمردن دستیِ ۱۰+ جدولِ ارجاع‌دهنده، اجازه می‌دهیم خود دیتابیس قضاوت کند
 * و خطای کلید خارجی (SQLSTATE 23503) را به پیام فارسی ترجمه می‌کنیم. این‌طور
 * هیچ جدول تازه‌ای از قلم نمی‌افتد.
 */
export async function deleteCodeRowAction(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['ADMIN', 'VICE_EDU']);
  const table = str(fd, 'table') as CodeTable;
  const id = Number(fd.get('id') || 0);
  if (!id) return { ok: false, error: 'رکورد نامعتبر است.' };

  // ترم را هم می‌شود حذف کرد: چون کدش ویرایش‌پذیر نیست، اگر اشتباه ثبت شود
  // تنها راه اصلاح، حذف رکوردِ بی‌استفاده است. محافظ کلید خارجی جلوی حذف
  // ترمی که انتخاب واحد یا نمره دارد را می‌گیرد.
  const target = { degree: degree_level_configs, faculty: faculties, major: majors, term: academic_terms } as const;
  if (!(table in target)) return { ok: false, error: 'حذف این جدول از این صفحه ممکن نیست.' };

  try {
    await db.delete(target[table as keyof typeof target])
      .where(eq(target[table as keyof typeof target].id, id));
    revalidatePath('/admin/codes');
    revalidatePath('/admin/departments');
    return { ok: true };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === '23503') {
      return { ok: false, error: 'این رکورد جای دیگری استفاده شده (رشته، دانشجو، درس، انتخاب واحد یا …) و حذف نمی‌شود. اول وابستگی‌ها را جابه‌جا کنید.' };
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
