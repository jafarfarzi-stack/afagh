'use server';

import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { academic_terms, courses, degree_level_configs, departments, faculties, majors } from '@/db/schema';
import { requireRole } from '@/lib/auth';
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
  const t = normalizeFa(q).slice(0, 60);
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


// ────────────────────────── ساخت و حذف رکورد مرجع ──────────────────────────
//
// چرا اینجا: مقطع تحصیلی، دانشکده و رشته تا امروز هیچ رابط ساختی نداشتند و فقط
// از دادهٔ پایه (seed) یا فایل انتقال ساخته می‌شدند. یعنی اگر دانشگاه مقطع تازه‌ای
// اضافه می‌کرد، هیچ راهی جز دست‌کاری مستقیم دیتابیس نبود. گروه آموزشی صفحهٔ خودش
// را دارد و درس در کارتابل مدیر گروه ساخته می‌شود، پس اینجا تکرار نمی‌شوند.

/** گزینه‌های والد برای فرم ساخت رشته */
export async function codeFormOptions(): Promise<FormOptions> {
  await requireRole(['ADMIN', 'VICE_EDU', 'EDU_EXPERT']);
  const [degs, deps] = await Promise.all([
    db.select({ id: degree_level_configs.id, title: degree_level_configs.title, code: degree_level_configs.code })
      .from(degree_level_configs).orderBy(asc(degree_level_configs.title)),
    db.select({ id: departments.id, name: departments.name, code: departments.departmentCode, fac: faculties.name })
      .from(departments).leftJoin(faculties, eq(faculties.id, departments.facultyId))
      .orderBy(asc(faculties.name), asc(departments.name)),
  ]);
  return {
    degree: degs.map(d => ({ value: String(d.id), label: `${d.title} [${d.code}]` })),
    department: deps.map(d => ({
      value: String(d.id),
      label: `${d.name}${d.code ? ` [${d.code}]` : ''}${d.fac ? ` — ${d.fac}` : ''}`,
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

      const [row] = await db.insert(degree_level_configs).values({
        title, code,
        defaultPassingGrade: pass.toFixed(2),
        conditionalGpaThreshold: cond.toFixed(2),
        maxUnitsPerTerm: maxU,
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
      const [row] = await db.insert(faculties).values({ name, facultyCode: code || null }).returning({ id: faculties.id });
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
