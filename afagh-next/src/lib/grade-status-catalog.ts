import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { course_offerings, courses, enrollments, grade_status_codes, legacy_code_maps } from '@/db/schema';
import { getRegulationConfig } from '@/lib/regulations-engine';
import { GRADE_STATUS_CODES, isGradePassed, outcomeGradeStatusCodeId } from './grade-status-codes';
import type { OutcomeCodeConfig } from './grade-status-codes';

export { isGradePassed, outcomeGradeStatusCodeId };
export type { OutcomeCodeConfig };

/**
 * ═══════════════════════════════════════════════════════════════════
 *  جدول مرجع کدهای وضعیت نمره (grade_status_codes) — Master Data
 * ═══════════════════════════════════════════════════════════════════
 *  کد عددی سیستم قدیمی، وضعیت داخلی سامانهٔ جدید و عنوان نمایشی سه چیز
 *  جدا هستند؛ کارنامه «کد» چاپ می‌کند و راهنمای کدها پایین سند می‌آید.
 *
 *  این ماژول:
 *   ۱) جدول مرجع را با کدهای واقعی قدیمی پر می‌کند (idempotent) — همان
 *      مجموعه‌هایی که ETL سما می‌شناسد، پس کدی ساخته نمی‌شود.
 *   ۲) اگر فایل مرجع «وضع نمره» سیستم قدیمی وارد شده باشد، عنوان *دقیق*
 *      همان فایل را در میز تطبیق (legacy_code_maps/GRADE_STATUS) پیدا کرده
 *      و روی جدول مرجع می‌نشاند — عنوان پیش‌فرضِ خودمان هرگز جای عنوان
 *      واقعی را نمی‌گیرد (ردیف‌های seed شده با note.seeded علامت دارند).
 *   ۳) میز تطبیق کدها را هم پر می‌کند تا میز «تطبیق کدها» خالی نماند.
 */

/** کدهای حذف: در میز تطبیق IGNORED می‌نشینند تا وارد محاسبهٔ نمره نشوند */
const DROPPED_STATUS = 'DROPPED';
/** منبع پیش‌فرض میز تطبیق: همان sourceCode ای که ETL سما می‌نویسد */
const DEFAULT_SOURCE = 'AFAGH';
const SEED_NOTE = JSON.stringify({ seeded: 'afagh-next/grade-status-codes' });

/** یک‌بار در هر فرایند کافی است */
let ensured = false;

export type EnsureGradeStatusResult = {
  masterInserted: number;
  mapInserted: number;
  titlesAdopted: number;
  alreadyEnsured: boolean;
};

/** ساخت/همگام‌سازی جدول مرجع کدهای وضعیت نمره — بی‌خطر و idempotent */
export async function ensureGradeStatusCodes(sourceCode?: string | null): Promise<EnsureGradeStatusResult> {
  if (ensured) return { masterInserted: 0, mapInserted: 0, titlesAdopted: 0, alreadyEnsured: true };
  ensured = true; // حتی در خطا دوباره تلاش نمی‌کنیم: کارنامه نباید بخاطر جدول مرجع بمیرد
  const out: EnsureGradeStatusResult = { masterInserted: 0, mapInserted: 0, titlesAdopted: 0, alreadyEnsured: false };
  try {
    // ۱) جدول مرجع
    const master = await db
      .insert(grade_status_codes)
      .values(GRADE_STATUS_CODES.map((c, i) => ({
        code: c.code,
        title: c.title,
        legacyCode: c.origin === 'LEGACY' ? c.code : null,
        internalStatus: c.status,
        description: c.origin === 'LEGACY'
          ? 'کد وضعیت نمره در سیستم قدیمی (فایل مرجع «وضع نمره»)'
          : 'وضعیت داخلی سامانهٔ جدید (در سیستم قدیمی کد عددی ندارد)',
        legacyFlags: c.flags ? JSON.stringify(c.flags) : null,
        origin: c.origin,
        sortOrder: c.origin === 'LEGACY' ? Number(c.code) : 9000 + i,
      })))
      .onConflictDoNothing()
      .returning({ id: grade_status_codes.id });
    out.masterInserted = master.length;

    // ۲) میز تطبیق کدها (برای میز کار «تطبیق کدها» و موتور واردسازی نمرات)
    let source = (sourceCode || '').trim();
    if (!source) {
      const existing = await db
        .select({ sourceCode: legacy_code_maps.sourceCode })
        .from(legacy_code_maps)
        .where(eq(legacy_code_maps.domain, 'GRADE_STATUS'))
        .limit(1);
      source = existing[0]?.sourceCode || DEFAULT_SOURCE;
    }
    const mapped = await db
      .insert(legacy_code_maps)
      .values(GRADE_STATUS_CODES.map(c => ({
        sourceCode: source,
        domain: 'GRADE_STATUS',
        legacyCode: c.code,
        legacyTitle: c.title,
        targetCode: c.status,
        status: c.status === DROPPED_STATUS ? 'IGNORED' : 'CONFIRMED',
        note: SEED_NOTE,
      })))
      .onConflictDoNothing()
      .returning({ id: legacy_code_maps.id });
    out.mapInserted = mapped.length;

    // ۳) عنوان واقعی فایل مرجع قدیمی (اگر وارد شده) روی جدول مرجع می‌نشیند
    const adopted = await db.execute(sql`
      UPDATE grade_status_codes g
         SET title = m."legacyTitle", "updatedAt" = now()
        FROM legacy_code_maps m
       WHERE m.domain = 'GRADE_STATUS'
         AND m."legacyCode" = g.code
         AND m."legacyTitle" IS NOT NULL
         AND m.note IS DISTINCT FROM ${SEED_NOTE}
         AND m."legacyTitle" <> g.title
    `);
    out.titlesAdopted = Number((adopted as unknown as { rowCount?: number })?.rowCount ?? 0);
    return out;
  } catch {
    return out;
  }
}

export type GradeStatusCodeRow = {
  id: number;
  code: string;
  title: string;
  internalStatus: string;
  origin: string;
};

export type GradeStatusCodeMaps = {
  rows: GradeStatusCodeRow[];
  byId: Map<number, GradeStatusCodeRow>;
  byCode: Map<string, GradeStatusCodeRow>;
  /** وضعیت داخلی → کد مرجع (برای ردیف‌هایی که کد قدیمی ندارند) */
  canonicalByStatus: Map<string, string>;
  /** عنوان هر کد (برای راهنمای پایین کارنامه) */
  titleOf: (code: string) => string | null;
};

/**
 * جدول مرجع را یک‌جا می‌خواند (چند ده ردیف) تا کارنامه/گزارش‌ها برای هر
 * ردیف کوئری نزنند. اگر جدول هنوز ساخته نشده بود، خالی برمی‌گردد و
 * مرجع کدِ داخل کد (grade-status-codes.ts) جواب می‌دهد.
 */
export async function gradeStatusCodeMaps(): Promise<GradeStatusCodeMaps> {
  const empty: GradeStatusCodeMaps = {
    rows: [], byId: new Map(), byCode: new Map(), canonicalByStatus: new Map(), titleOf: () => null,
  };
  try {
    const rows = await db
      .select({
        id: grade_status_codes.id,
        code: grade_status_codes.code,
        title: grade_status_codes.title,
        internalStatus: grade_status_codes.internalStatus,
        origin: grade_status_codes.origin,
      })
      .from(grade_status_codes)
      .where(eq(grade_status_codes.isActive, 1))
      .orderBy(grade_status_codes.sortOrder, grade_status_codes.code);
    const byId = new Map<number, GradeStatusCodeRow>();
    const byCode = new Map<string, GradeStatusCodeRow>();
    const canonicalByStatus = new Map<string, string>();
    for (const r of rows) {
      const row = { id: r.id, code: r.code, title: r.title, internalStatus: r.internalStatus, origin: r.origin };
      byId.set(row.id, row);
      if (!byCode.has(row.code)) byCode.set(row.code, row);
      if (!canonicalByStatus.has(row.internalStatus)) canonicalByStatus.set(row.internalStatus, row.code);
    }
    return { rows, byId, byCode, canonicalByStatus, titleOf: code => byCode.get(String(code ?? '').trim())?.title ?? null };
  } catch {
    return empty;
  }
}

/** عنوان‌های دقیق کدهای وضع نمره از میز تطبیق (کد → عنوان) */
export async function gradeStatusTitles(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const rows = await db
      .select({ code: legacy_code_maps.legacyCode, title: legacy_code_maps.legacyTitle })
      .from(legacy_code_maps)
      .where(and(eq(legacy_code_maps.domain, 'GRADE_STATUS'), sql`${legacy_code_maps.legacyTitle} IS NOT NULL`));
    for (const r of rows) {
      const code = String(r.code ?? '').trim();
      const title = String(r.title ?? '').trim();
      if (code && title && !map.has(code)) map.set(code, title);
    }
  } catch { /* میز تطبیق خالی/ناساخته — عنوان‌های مرجع استفاده می‌شوند */ }
  return map;
}

/**
 * کد وضع نمرهٔ ثبت‌نام‌های *بی‌کد* یک ارائه را از تعریف درس پر می‌کند.
 *
 * فراخوانی: هنگام قفل نهایی نمرات (و هرجا نمره قطعی می‌شود).
 *
 * قاعدهٔ مهم: رکوردی که از قبل کد دارد دست‌نخورده می‌ماند. کد قدیمیِ یک
 * رکورد مهاجرت‌شده (مثلاً ۶ «حذف اضطراری» یا ۲۰ «غیبت») سند تاریخی است و
 * نباید با کدِ محاسبه‌شده از نمره جایگزین شود — دانشجوی غایب با نمرهٔ بالا
 * «قبول» نمی‌شود.
 *
 * @returns تعداد رکوردهای به‌روزشده
 */
export async function applyGradeStatusCodesForOffering(offeringId: number): Promise<number> {
  await ensureGradeStatusCodes();

  const [off] = await db
    .select({
      courseId: course_offerings.courseId,
      gradingType: courses.gradingType,
      degreeLevelId: courses.degreeLevelId,
      passGradeStatusCodeId: courses.passGradeStatusCodeId,
      failGradeStatusCodeId: courses.failGradeStatusCodeId,
    })
    .from(course_offerings)
    .leftJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(eq(course_offerings.id, offeringId))
    .limit(1);
  if (!off) return 0;

  const cfg: OutcomeCodeConfig = {
    passGradeStatusCodeId: off.passGradeStatusCodeId ?? null,
    failGradeStatusCodeId: off.failGradeStatusCodeId ?? null,
  };
  // نگاشت کد → شناسهٔ ردیف مرجع (برای کد مرجع ۱/۲ وقتی درس کد تنظیم ندارد)
  const ids: Record<string, number | null> = {};
  for (const r of (await gradeStatusCodeMaps()).rows) ids[String(r.code ?? '').trim()] = r.id;
  // اگر درس هیچ کدی تنظیم نکرده و کد مرجع هم موجود نیست، کاری برای کردن نیست
  if (!cfg.passGradeStatusCodeId && !cfg.failGradeStatusCodeId && !ids['1'] && !ids['2']) return 0;

  const config = await getRegulationConfig(null, off.degreeLevelId ?? null);
  const passingGrade = config.grading_and_gpa.default_passing_grade || 10;

  // فقط رکوردهای بی‌کد — کدِ از قبل نشسته (مهاجرتی یا دستی) سند تاریخی است
  const rows = await db
    .select({ id: enrollments.id, gradeValue: enrollments.gradeValue })
    .from(enrollments)
    .where(and(
      eq(enrollments.offeringId, offeringId),
      sql`${enrollments.gradeStatusCodeId} IS NULL`,
    ));

  // دسته‌بندی بر پایهٔ کد مقصد تا به‌جای N به‌روزرسانی، یکی به ازای هر کد بزنیم
  const byCode = new Map<number, number[]>();
  for (const r of rows) {
    const passed = isGradePassed(r.gradeValue, off.gradingType ?? null, passingGrade);
    if (passed === null) continue;
    const codeId = outcomeGradeStatusCodeId(passed, cfg, ids);
    if (!codeId) continue;
    const list = byCode.get(codeId);
    if (list) list.push(r.id);
    else byCode.set(codeId, [r.id]);
  }

  let updated = 0;
  for (const [codeId, enrollmentIds] of byCode) {
    if (enrollmentIds.length === 0) continue;
    const res = await db
      .update(enrollments)
      .set({ gradeStatusCodeId: codeId })
      .where(and(inArray(enrollments.id, enrollmentIds), sql`${enrollments.gradeStatusCodeId} IS DISTINCT FROM ${codeId}`))
      .returning({ id: enrollments.id });
    updated += res.length;
  }
  return updated;
}
