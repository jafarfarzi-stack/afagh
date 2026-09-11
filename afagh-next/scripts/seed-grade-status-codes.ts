/**
 * ══════════════════════════════════════════════════════════════════
 *  جدول مرجع کدهای وضعیت نمره (grade_status_codes) — Master Data
 *
 *  ۱) کدهای واقعی وضعیت نمرهٔ سیستم قدیمی را در جدول مرجع می‌سازد
 *     (همان مجموعه‌هایی که ETL سما می‌شناسد — کدی ساخته نمی‌شود).
 *  ۲) میز تطبیق کدها (legacy_code_maps/GRADE_STATUS) را پر می‌کند.
 *  ۳) عنوان *دقیق* فایل مرجع قدیمی را — اگر وارد شده باشد — روی جدول
 *     مرجع می‌نشاند.
 *  ۴) رکوردهای نمره را به کد وضعیت وصل می‌کند (پشتیبان‌گیری تاریخی):
 *     اول از markStat خامِ legacy_grades، بعد از وضعیت داخلی.
 *
 *  اجرا:
 *    DATABASE_URL=postgres://afagh:afagh@localhost:5432/afagh_db \
 *      npx tsx scripts/seed-grade-status-codes.ts            [--no-backfill] [--dry]
 *  داکر:
 *    docker compose run --rm migrator npx tsx scripts/seed-grade-status-codes.ts
 * ══════════════════════════════════════════════════════════════════
 */
import pg from 'pg';
import { GRADE_STATUS_CODES } from '../src/lib/grade-status-codes';

const SOURCE = (process.argv.find(a => a.startsWith('--source='))?.split('=')[1] || process.env.AFAGH_SOURCE || 'AFAGH').toUpperCase();
const DRY = process.argv.includes('--dry');
const NO_BACKFILL = process.argv.includes('--no-backfill');
const SEED_NOTE = JSON.stringify({ seeded: 'afagh-next/grade-status-codes' });

async function main() {
  const url = process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db';
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  try {
    if (DRY) {
      console.log(`[dry] ${GRADE_STATUS_CODES.length} کد وضعیت نمره برای جدول مرجع و منبع ${SOURCE} آمادهٔ درج است.`);
      return;
    }

    // ۱) جدول مرجع (Master Data) — ۸ ستون، ۸ مقدار به ازای هر ردیف
    const masterValues: unknown[] = [];
    const masterPh = GRADE_STATUS_CODES.map((c, i) => {
      const o = i * 8;
      masterValues.push(
        c.code,
        c.title,
        c.origin === 'LEGACY' ? c.code : null,
        c.status,
        c.origin === 'LEGACY' ? 'کد وضعیت نمره در سیستم قدیمی (فایل مرجع «وضع نمره»)' : 'وضعیت داخلی سامانهٔ جدید (در سیستم قدیمی کد عددی ندارد)',
        c.flags ? JSON.stringify(c.flags) : null,
        c.origin,
        c.origin === 'LEGACY' ? Number(c.code) : 9000 + i,
      );
      return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8})`;
    }).join(',');
    const master = await pool.query(
      `INSERT INTO grade_status_codes (code, title, "legacyCode", "internalStatus", description, "legacyFlags", origin, "sortOrder")
       VALUES ${masterPh}
       ON CONFLICT (code) DO NOTHING`,
      masterValues,
    );

    // ۲) میز تطبیق کدها (میز کار «تطبیق کدها» + موتور واردسازی نمرات)
    const mapValues: unknown[] = [];
    const mapPh = GRADE_STATUS_CODES.map((c, i) => {
      const o = i * 5;
      mapValues.push(c.code, c.title, c.status, c.status === 'DROPPED' ? 'IGNORED' : 'CONFIRMED', SEED_NOTE);
      return `($1,'GRADE_STATUS',$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6})`;
    }).join(',');
    const mapped = await pool.query(
      `INSERT INTO legacy_code_maps ("sourceCode", domain, "legacyCode", "legacyTitle", "targetCode", status, note)
       VALUES ${mapPh}
       ON CONFLICT ("sourceCode", domain, "legacyCode") DO NOTHING`,
      [SOURCE, ...mapValues],
    );

    // ۳) عنوان دقیق فایل مرجع قدیمی (اگر وارد شده) → جدول مرجع
    const adopted = await pool.query(
      `UPDATE grade_status_codes g
          SET title = m."legacyTitle", "updatedAt" = now()
         FROM legacy_code_maps m
        WHERE m.domain = 'GRADE_STATUS' AND m."legacyCode" = g.code
          AND m."legacyTitle" IS NOT NULL AND m.note IS DISTINCT FROM $1
          AND m."legacyTitle" <> g.title`,
      [SEED_NOTE],
    );

    const [{ n }] = (await pool.query(`SELECT count(*)::int n FROM grade_status_codes`)).rows;
    console.log(`✅ grade_status_codes: +${master.rowCount} ردیف (مجموع ${n}) | میز تطبیق: +${mapped.rowCount} | عنوان از فایل مرجع: ${adopted.rowCount}`);

    if (NO_BACKFILL) { console.log('↷ پشتیبان‌گیری enrollments انجام نشد (--no-backfill)'); return; }

    // ۴) اتصال رکوردهای نمره به کد وضعیت
    //    الف) کد خام قدیمی (markStat) از legacy_grades — بدون cast جیسون تا
    //       ردیفِ بدformatted هرگز خطا ندهد (استخراج با الگو)
    const legacyLink = await pool.query(`
      UPDATE enrollments e
         SET "gradeStatusCodeId" = g.id
        FROM students s, course_offerings co, academic_terms t, courses c,
             legacy_grades lg, grade_status_codes g
       WHERE e."gradeStatusCodeId" IS NULL
         AND s.id = e."studentId"
         AND co.id = e."offeringId"
         AND t.id = co."termId"
         AND c.id = co."courseId"
         AND lg."studentCode" = s."studentCode"
         AND lg."termCode" = t."termCode"
         AND lg."courseCode" = c.code
         AND g.code = substring(lg.raw from '"markStat"\\s*:\\s*"([^"]*)"')
    `);

    //    ب) باقی‌مانده (نمرات ثبت‌شده در سامانهٔ جدید) → کد مرجعِ وضعیت داخلی
    const internalLink = await pool.query(`
      WITH canon AS (
        SELECT DISTINCT ON ("internalStatus") id, "internalStatus"
          FROM grade_status_codes ORDER BY "internalStatus", "sortOrder", code
      )
      UPDATE enrollments e SET "gradeStatusCodeId" = c.id
        FROM canon c
       WHERE e."gradeStatusCodeId" IS NULL AND c."internalStatus" = e."gradeStatus"
    `);

    const [{ left }] = (await pool.query(
      `SELECT count(*)::int left FROM enrollments WHERE "gradeStatusCodeId" IS NULL`,
    )).rows;
    console.log(`🔗 enrollments: ${legacyLink.rowCount} با کد قدیمی + ${internalLink.rowCount} با کد مرجعِ وضعیت داخلی وصل شد؛ بی‌کد: ${left}`);
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
