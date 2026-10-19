#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════
 *  offering-duplicates.mjs — pre-flight مهاجرت 0103 (H1)
 *
 *  قاعدهٔ کسب‌وکار: در هر ترم، برای هر (درس + گروه) حداکثر یک ارائهٔ «فعال»
 *  مجاز است. مهاجرت 0103 این قاعده را با یک ایندکس یکتای جزئی
 *  (WHERE isActive = 1) روی دیتابیس قطعی می‌کند و اگر پیش از اجرا تکراریِ
 *  فعالی وجود داشته باشد، عمداً fail-fast می‌شود.
 *
 *  این ابزار همان پیش‌شرط را قابل‌حل می‌کند — بدون حذف هیچ ردیف یا ثبت‌نامی:
 *
 *    node scripts/offering-duplicates.mjs          # گزارش (exit 2 اگر تکراری باشد)
 *    node scripts/offering-duplicates.mjs --json   # گزارش ماشین‌خوان
 *    node scripts/offering-duplicates.mjs --fix    # ادغام ایمن + غیرفعال‌سازی ردیف‌های اضافی
 *
 *  الگوریتم --fix (به‌ازای هر گروه، در یک تراکنش):
 *    ۱. «نگه‌دارنده» = ردیفی با بیشترین ثبت‌نام واقعی (تساوی → کمترین id)
 *    ۲. ثبت‌نام‌های ردیف‌های دیگر به نگه‌دارنده منتقل می‌شوند؛ اگر دانشجو در هر
 *       دو ردیف ثبت‌نام داشت، ردیف تکراری حذف و بهترین وضعیت حفظ می‌شود
 *       (REGISTERED > PENDING_COUNCIL > WAITLISTED).
 *    ۳. ردیف‌های سبد هم به همین شکل منتقل/یکتا می‌شوند.
 *    ۴. جلسات هفتگی فقط وقتی منتقل می‌شوند که نگه‌دارنده هیچ جلسه‌ای نداشته باشد.
 *    ۵. enrolledCount نگه‌دارنده از روی ثبت‌نام‌های واقعی بازمحاسبه می‌شود.
 *    ۶. ردیف اضافی «غیرفعال» می‌شود (isActive=0) — نه حذف؛ تاریخچه، نمرات،
 *       حضور و غیاب و ارجاع‌ها دست‌نخورده می‌مانند.
 *
 *  اجرا:  DATABASE_URL=… node scripts/offering-duplicates.mjs [--fix] [--json]
 * ════════════════════════════════════════════════════════════════════════
 */
import pg from 'pg';

const URL = process.env.DATABASE_URL;
if (!URL) {
  console.error('❌ DATABASE_URL الزامی است.');
  process.exit(2);
}
const FIX = process.argv.includes('--fix');
const JSON_OUT = process.argv.includes('--json');
const c = new pg.Client({ connectionString: URL });
await c.connect();

const GROUPS_SQL = `
  SELECT "termId", "courseId", "groupNumber", count(*)::int AS n
  FROM "course_offerings"
  WHERE "isActive" = 1
  GROUP BY 1, 2, 3
  HAVING count(*) > 1
  ORDER BY 1, 2, 3`;

const ROWS_SQL = `
  SELECT o.id,
         o."enrolledCount" AS "enrolledCount",
         c.code AS "courseCode", c.title AS "courseTitle",
         t."termCode" AS "termCode",
         (SELECT count(*)::int FROM "enrollments" e WHERE e."offeringId" = o.id) AS "enrollments",
         (SELECT count(*)::int FROM "enrollments" e WHERE e."offeringId" = o.id
            AND e."status" IN ('REGISTERED','PENDING_COUNCIL')) AS "effective",
         (SELECT count(*)::int FROM "cart_items" ci WHERE ci."offeringId" = o.id) AS "cart",
         (SELECT count(*)::int FROM "schedules" s WHERE s."offeringId" = o.id) AS "schedules"
  FROM "course_offerings" o
  JOIN "courses" c ON c.id = o."courseId"
  JOIN "academic_terms" t ON t.id = o."termId"
  WHERE o."termId" = $1 AND o."courseId" = $2 AND o."groupNumber" = $3 AND o."isActive" = 1
  ORDER BY "effective" DESC, o.id ASC`;

const load = async () => {
  const { rows: groups } = await c.query(GROUPS_SQL);
  const out = [];
  for (const g of groups) {
    const { rows } = await c.query(ROWS_SQL, [g.termId, g.courseId, g.groupNumber]);
    out.push({ ...g, rows });
  }
  return out;
};

const pad = (v, n) => String(v).padStart(n);
const report = (groups) => {
  for (const g of groups) {
    const head = g.rows[0];
    console.log(`\n⛔ ترم ${head.termCode} · درس ${head.courseCode} «${head.courseTitle}» · گروه ${g.groupNumber} — ${g.n} ردیف فعال`);
    console.log('   id      ثبت‌نام  مؤثر  سبد  جلسه  نقش');
    for (const [i, r] of g.rows.entries()) {
      console.log(
        '   ' + pad(r.id, 7) + pad(r.enrollments, 8) + pad(r.effective, 6) + pad(r.cart, 5) + pad(r.schedules, 6) +
        '  ' + (i === 0 ? 'نگه‌دارنده (پیشنهاد)' : 'ادغام → غیرفعال'),
      );
    }
  }
};

let groups = await load();
if (groups.length === 0) {
  console.log('✅ هیچ گروه تکراریِ فعالی وجود ندارد — مهاجرت 0103 بی‌خطر است.');
  await c.end();
  process.exit(0);
}

if (JSON_OUT) {
  console.log(JSON.stringify(groups, null, 2));
} else {
  console.log(`⚠ ${groups.length} گروه تکراریِ فعال یافت شد (قاعده: حداکثر یک ارائهٔ فعال برای هر ترم+درس+گروه).`);
  report(groups);
  if (!FIX) {
    console.log('\nاجرای گزارش‌محور تمام شد. برای ادغام ایمن: node scripts/offering-duplicates.mjs --fix');
    await c.end();
    process.exit(2);
  }
}

// ── ادغام ایمن (--fix) ──
let merged = 0, deactivated = 0;
for (const g of groups) {
  const [keeper, ...losers] = g.rows;
  await c.query('BEGIN');
  try {
    for (const loser of losers) {
      // ۱) سبد: ردیف‌های تکراری یکتاسازی، سپس انتقال
      await c.query(
        `DELETE FROM "cart_items" d USING "cart_items" k
          WHERE d."offeringId" = $1 AND k."offeringId" = $2 AND k."studentId" = d."studentId"`,
        [loser.id, keeper.id],
      );
      await c.query(`UPDATE "cart_items" SET "offeringId" = $2 WHERE "offeringId" = $1`, [loser.id, keeper.id]);

      // ۲) ثبت‌نام: اول ارتقای وضعیت نگه‌دارنده اگر ردیف بازنده REGISTERED است
      await c.query(
        `UPDATE "enrollments" k SET "status" = 'REGISTERED'
           FROM "enrollments" d
          WHERE k."offeringId" = $2 AND d."offeringId" = $1
            AND k."studentId" = d."studentId"
            AND d."status" = 'REGISTERED' AND k."status" <> 'REGISTERED'`,
        [loser.id, keeper.id],
      );
      await c.query(
        `DELETE FROM "enrollments" d USING "enrollments" k
          WHERE d."offeringId" = $1 AND k."offeringId" = $2 AND k."studentId" = d."studentId"`,
        [loser.id, keeper.id],
      );
      await c.query(`UPDATE "enrollments" SET "offeringId" = $2 WHERE "offeringId" = $1`, [loser.id, keeper.id]);

      // ۳) جلسات هفتگی: فقط اگر نگه‌دارنده هیچ جلسه‌ای ندارد
      const { rows: ks } = await c.query('SELECT count(*)::int AS n FROM "schedules" WHERE "offeringId" = $1', [keeper.id]);
      if (ks[0].n === 0) {
        await c.query(`UPDATE "schedules" SET "offeringId" = $2 WHERE "offeringId" = $1`, [loser.id, keeper.id]);
      }

      // ۴) غیرفعال‌سازی ردیف اضافی (نه حذف)
      await c.query('UPDATE "course_offerings" SET "isActive" = 0 WHERE id = $1', [loser.id]);
      deactivated++;
    }
    // ۵) بازمحاسبهٔ ظرفیت مصرف‌شدهٔ نگه‌دارنده
    await c.query(
      `UPDATE "course_offerings" o
          SET "enrolledCount" = (
            SELECT count(*)::int FROM "enrollments" e
             WHERE e."offeringId" = o.id AND e."status" IN ('REGISTERED','PENDING_COUNCIL'))
        WHERE o.id = $1`,
      [keeper.id],
    );
    await c.query('COMMIT');
    merged++;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error(`❌ ادغام گروه (term=${g.termId}, course=${g.courseId}, group=${g.groupNumber}) شکست خورد: ${e.message}`);
    await c.end();
    process.exit(1);
  }
}

groups = await load();
console.log(`\n✅ ${merged} گروه ادغام شد · ${deactivated} ردیف اضافی غیرفعال شد (هیچ ردیفی حذف نشد).`);
if (groups.length > 0) {
  console.error('❌ هنوز گروه تکراریِ فعال باقی است — بررسی دستی لازم است:');
  report(groups);
  await c.end();
  process.exit(1);
}
console.log('✅ هیچ گروه تکراریِ فعالی باقی نماند — مهاجرت 0103 آمادهٔ اجراست.');
await c.end();
process.exit(0);
