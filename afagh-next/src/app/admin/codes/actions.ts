'use server';

import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { academic_terms, courses, degree_level_configs, departments, faculties, majors } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { CODE_TABLES, type CodeRow, type CodeStat, type CodeTable } from './tables';

/**
 * مرکز کدها — یک جای واحد برای تعریف و بازبینی «کد» همهٔ جدول‌های مرجع.
 *
 * چرا لازم است: کد سند اصالت است (کد رشته می‌گوید کدام رشته، کدام مقطع، کدام
 * گروه و کدام دانشکده). تا امروز کدها پراکنده بودند: کد دانشکده هیچ رابطی
 * نداشت، کد گروه فقط از فایل انتقال پر می‌شد و هیچ‌کجا نمی‌شد دید کدام
 * رکوردها بی‌کد یا دارای کد تکراری‌اند.
 */

const dupSet = (rows: { code: string | null }[]) => {
  const seen = new Map<string, number>();
  for (const r of rows) {
    if (!r.code) continue;
    seen.set(r.code, (seen.get(r.code) ?? 0) + 1);
  }
  return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([c]) => c));
};

export async function listCodes(table: CodeTable, q = ''): Promise<CodeRow[]> {
  await requireRole(['ADMIN', 'VICE_EDU', 'EDU_EXPERT']);
  const t = q.trim();
  let raw: { id: number; code: string | null; title: string; context: string | null }[] = [];

  if (table === 'faculty') {
    raw = (await db
      .select({ id: faculties.id, code: faculties.facultyCode, title: faculties.name })
      .from(faculties)
      .orderBy(asc(faculties.name))).map(r => ({ ...r, context: null }));
  }

  if (table === 'department') {
    raw = (await db
      .select({
        id: departments.id, code: departments.departmentCode, title: departments.name,
        facName: faculties.name, facCode: faculties.facultyCode,
      })
      .from(departments)
      .leftJoin(faculties, eq(faculties.id, departments.facultyId))
      .orderBy(asc(faculties.name), asc(departments.name)))
      .map(r => ({ id: r.id, code: r.code, title: r.title, context: r.facName ? `${r.facName}${r.facCode ? ` [${r.facCode}]` : ''}` : null }));
  }

  if (table === 'major') {
    raw = (await db
      .select({
        id: majors.id, code: majors.majorCode, title: majors.name,
        deg: degree_level_configs.title, dept: departments.name, deptCode: departments.departmentCode,
      })
      .from(majors)
      .leftJoin(degree_level_configs, eq(degree_level_configs.id, majors.degreeLevelId))
      .leftJoin(departments, eq(departments.id, majors.departmentId))
      .orderBy(asc(majors.name)))
      .map(r => ({
        id: r.id, code: r.code, title: r.title,
        context: [r.deg, r.dept ? `${r.dept}${r.deptCode ? ` [${r.deptCode}]` : ''}` : null].filter(Boolean).join(' · ') || null,
      }));
  }

  if (table === 'degree') {
    raw = (await db
      .select({ id: degree_level_configs.id, code: degree_level_configs.code, title: degree_level_configs.title })
      .from(degree_level_configs)
      .orderBy(asc(degree_level_configs.title))).map(r => ({ ...r, context: null }));
  }

  if (table === 'course') {
    raw = (await db
      .select({
        id: courses.id, code: courses.code, title: courses.title,
        dept: departments.name, deg: degree_level_configs.title,
      })
      .from(courses)
      .leftJoin(departments, eq(departments.id, courses.departmentId))
      .leftJoin(degree_level_configs, eq(degree_level_configs.id, courses.degreeLevelId))
      .orderBy(asc(courses.code)))
      .map(r => ({ id: r.id, code: r.code, title: r.title, context: [r.deg, r.dept].filter(Boolean).join(' · ') || null }));
  }

  if (table === 'term') {
    raw = (await db
      .select({ id: academic_terms.id, code: academic_terms.termCode, title: academic_terms.title })
      .from(academic_terms)
      .orderBy(asc(academic_terms.termCode))).map(r => ({ ...r, context: null }));
  }

  const dups = dupSet(raw);
  const rows = raw.map(r => ({ ...r, duplicate: !!r.code && dups.has(r.code) }));
  if (!t) return rows;
  return rows.filter(r => r.title.includes(t) || (r.code ?? '').includes(t) || (r.context ?? '').includes(t));
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

  const clash = async (found: { id: number; title: string }[]) =>
    found.length ? { ok: false as const, error: `کد «${code}» قبلاً برای «${found[0].title}» ثبت شده — کد باید یکتا باشد.` } : null;

  if (table === 'faculty') {
    if (code) {
      const c = await clash(await db.select({ id: faculties.id, title: faculties.name }).from(faculties)
        .where(and(eq(faculties.facultyCode, code), ne(faculties.id, id))).limit(1));
      if (c) return c;
    }
    await db.update(faculties).set({ facultyCode: code || null }).where(eq(faculties.id, id));
  } else if (table === 'department') {
    if (code) {
      const c = await clash(await db.select({ id: departments.id, title: departments.name }).from(departments)
        .where(and(eq(departments.departmentCode, code), ne(departments.id, id))).limit(1));
      if (c) return c;
    }
    await db.update(departments).set({ departmentCode: code || null }).where(eq(departments.id, id));
  } else if (table === 'major') {
    if (code) {
      const c = await clash(await db.select({ id: majors.id, title: majors.name }).from(majors)
        .where(and(eq(majors.majorCode, code), ne(majors.id, id))).limit(1));
      if (c) return c;
    }
    await db.update(majors).set({ majorCode: code || null }).where(eq(majors.id, id));
  } else if (table === 'degree') {
    // کد مقطع NOT NULL است — خالی‌کردنش مجاز نیست
    if (!code) return { ok: false, error: 'کد مقطع نمی‌تواند خالی باشد.' };
    const c = await clash(await db.select({ id: degree_level_configs.id, title: degree_level_configs.title }).from(degree_level_configs)
      .where(and(eq(degree_level_configs.code, code), ne(degree_level_configs.id, id))).limit(1));
    if (c) return c;
    await db.update(degree_level_configs).set({ code }).where(eq(degree_level_configs.id, id));
  } else if (table === 'course') {
    if (!code) return { ok: false, error: 'کد درس نمی‌تواند خالی باشد.' };
    const c = await clash(await db.select({ id: courses.id, title: courses.title }).from(courses)
      .where(and(eq(courses.code, code), ne(courses.id, id))).limit(1));
    if (c) return c;
    await db.update(courses).set({ code }).where(eq(courses.id, id));
  } else {
    return { ok: false, error: 'کد این جدول از این صفحه قابل ویرایش نیست.' };
  }

  revalidatePath('/admin/codes');
  revalidatePath('/admin/departments');
  return { ok: true };
}

/** شمار رکوردهای بی‌کد در هر جدول — برای هشدار پیش از انتقال داده */
export async function missingCodeSummary(): Promise<{ table: string; missing: number }[]> {
  const stats = await codeStats();
  return stats.filter(s => s.missing > 0).map(s => ({ table: s.title, missing: s.missing }));
}

export async function exportCodesCsv(table: CodeTable): Promise<string> {
  const rows = await listCodes(table);
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = 'کد,عنوان,زمینه\n';
  return head + rows.map(r => [esc(r.code ?? ''), esc(r.title), esc(r.context ?? '')].join(',')).join('\n');
}

/** شمار کل رکوردهای هر جدول بدون بارگذاری کامل — برای صفحه‌های بزرگ مثل دروس */
export async function countRows(table: CodeTable): Promise<number> {
  const map = { faculty: faculties, department: departments, major: majors, degree: degree_level_configs, course: courses, term: academic_terms } as const;
  const [r] = await db.select({ c: sql<number>`count(*)::int` }).from(map[table]);
  return r?.c ?? 0;
}
