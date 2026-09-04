#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════
 *  آزمون همزمانی (Concurrency) — بازبینی: «تأیید درخواست + وصول چک»
 *
 *  دقیقاً همان SQLای که اپ در تراکنش اجرا می‌کند، با دو اتصال موازی اجرا
 *  می‌شود و انتظار داریم فقط یکی برنده شود:
 *    • تأیید درخواست: UPDATE … WHERE status IN (SUBMITTED/IN_REVIEW/DRAFT)
 *      → دو موازی → دقیقاً یک rowCount=1 (دومی ۰ — بدون دوبار ++enrolledCount)
 *    • وصول چک: UPDATE … WHERE status='PENDING' (پس از FOR UPDATE)
 *      → دو موازی → دقیقاً یک rowCount=1
 *    • ثبت مشروط درس: UPDATE enrollments SET REGISTERED WHERE status<>REGISTERED
 *      → دو موازی → یک rowCount=1
 *
 *  در CI بعد از rls-test اجرا می‌شود (PostgreSQL واقعی).
 * ════════════════════════════════════════════════════════════════════════
 */
import pg from 'pg';

const URL = process.env.DATABASE_URL;
if (!URL) { console.error('❌ DATABASE_URL الزامی است.'); process.exit(2); }

let pass = 0, fail = 0;
const ok = (n, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${n}`); }
  else { fail++; console.log(`  ✗ ${n} ${extra}`); }
};

const owner = new pg.Client({ connectionString: URL });

/** دو کوئری موازی — خروجی: تعداد برندگان (rowCount===1) */
async function race(sqlText, params) {
  const c1 = new pg.Client({ connectionString: URL });
  const c2 = new pg.Client({ connectionString: URL });
  await c1.connect(); await c2.connect();
  const run = async (c) => { try { return (await c.query(sqlText, params)).rowCount; } catch (e) { return { err: e.code || e.message }; } };
  const [r1, r2] = await Promise.all([run(c1), run(c2)]);
  await c1.end().catch(() => {}); await c2.end().catch(() => {});
  return [r1, r2];
}

try {
  await owner.connect();
  const tag = Date.now().toString(36);
  const NC = `8${tag.slice(-9)}`;

  const [u] = (await owner.query(
    `INSERT INTO users ("nationalCode","firstName","lastName","passwordHash","isActive") VALUES ($1,'تست','همزمانی','x',1) RETURNING id`, [NC])).rows;
  const [deg] = (await owner.query(`SELECT id FROM degree_level_configs ORDER BY id LIMIT 1`)).rows;
  const [reg] = (await owner.query(`SELECT id FROM educational_regulations ORDER BY id LIMIT 1`)).rows;
  const [s] = (await owner.query(
    `INSERT INTO students ("userId","studentCode","degreeLevelId","regulationId","entryYear","status") VALUES ($1,$2,$3,$4,1404,'ACTIVE') RETURNING id`,
    [u.id, `Z${tag}`, deg.id, reg.id])).rows;
  const [term] = (await owner.query(`INSERT INTO academic_terms ("termCode","title","isCurrent") VALUES ($1,'ترم همزمانی',1) RETURNING id`, [`H${tag}`])).rows;
  const [course] = (await owner.query(`INSERT INTO courses (code,title,units) VALUES ($1,'درس همزمانی',3) RETURNING id`, [`K${tag}`])).rows;
  const [off] = (await owner.query(
    `INSERT INTO course_offerings ("termId","courseId","capacity","enrolledCount","isActive") VALUES ($1,$2,30,0,1) RETURNING id`, [term.id, course.id])).rows;
  const [proc] = (await owner.query(`INSERT INTO process_definitions (code,title) VALUES ($1,'همزمانی') RETURNING id`, [`Q${tag}`])).rows;

  // ۱) تأیید درخواست (انتقال شرطی)
  const [req] = (await owner.query(
    `INSERT INTO student_requests ("trackingCode","studentId","processId","status","relatedEnrollmentId") VALUES ($1,$2,$3,'SUBMITTED',$4) RETURNING id`,
    [`CT${tag}`, s.id, proc.id, null])).rows;
  const [enr] = (await owner.query(
    `INSERT INTO enrollments ("studentId","offeringId","status") VALUES ($1,$2,'WAITLISTED') RETURNING id`, [s.id, off.id])).rows;
  await owner.query(`UPDATE student_requests SET "relatedEnrollmentId" = $1 WHERE id = $2`, [enr.id, req.id]);

  console.log('\n— ۱) تأیید همزمان درخواست (انتقال شرطی APPROVED)');
  const [a1, a2] = await race(
    `UPDATE student_requests SET status = 'APPROVED', "updatedAt" = now() WHERE id = $1 AND status IN ('SUBMITTED','IN_REVIEW','DRAFT') RETURNING id`,
    [req.id]);
  const winners1 = [a1, a2].filter((x) => x === 1).length;
  ok('دقیقاً یک تأیید برنده شد', winners1 === 1, `(got ${JSON.stringify([a1, a2])})`);

  // ۲) تأیید دوبار → شمارندهٔ ثبت‌نام فقط یک بار ++
  const [x1, x2] = await race(
    `UPDATE enrollments SET status = 'REGISTERED' WHERE id = $1 AND status <> 'REGISTERED' AND status <> 'DROPPED' RETURNING id`,
    [enr.id]);
  const winners2 = [x1, x2].filter((x) => x === 1).length;
  ok('انتقال مشروط درس: یک برنده', winners2 === 1, `(got ${JSON.stringify([x1, x2])})`);
  if (winners2 === 1) {
    await owner.query(`UPDATE course_offerings SET "enrolledCount" = "enrolledCount" + 1 WHERE id = $1`, [off.id]);
  }
  const [cnt] = (await owner.query(`SELECT "enrolledCount" FROM course_offerings WHERE id = $1`, [off.id])).rows;
  ok('enrolledCount = 1 (نه ۲)', Number(cnt.enrolledCount) === 1, `(got ${cnt.enrolledCount})`);

  // ۳) وصول همزمان چک (انتقال فقط از PENDING)
  const [chq] = (await owner.query(
    `INSERT INTO payment_cheques ("studentId","termId","chequeNo","amount","status","dueDate") VALUES ($1,$2,$3,100000,'PENDING',now() + interval '30 days') RETURNING id`,
    [s.id, term.id, `CK${tag}`])).rows;
  const [b1, b2] = await race(
    `UPDATE payment_cheques SET status = 'CLEARED', "clearedAt" = now() WHERE id = $1 AND status = 'PENDING' RETURNING id`,
    [chq.id]);
  const winners3 = [b1, b2].filter((x) => x === 1).length;
  ok('وصول همزمان چک: فقط یک تراکنش دفتر', winners3 === 1, `(got ${JSON.stringify([b1, b2])})`);

  // ۴) تأیید همزمان تخفیف (فقط از PENDING) — ابتدا نوع تخفیف (FK الزامی + seed نمی‌کند)
  const [discType] = (await owner.query(
    `INSERT INTO tuition_discount_types (code,title,kind,"defaultPercent","defaultAmount") VALUES ($1,'همزمانی','PERCENT',10,0) RETURNING id`,
    [`DT${tag}`])).rows;
  const [disc] = (await owner.query(
    `INSERT INTO student_discounts ("studentId","discountTypeId","kind","percent","amount","status") VALUES ($1,$2,'PERCENT',10,'0','PENDING') RETURNING id`,
    [s.id, discType.id])).rows;
  const [c1r, c2r] = await race(
    `UPDATE student_discounts SET status = 'APPROVED' WHERE id = $1 AND status = 'PENDING' RETURNING id`,
    [disc.id]);
  const winners4 = [c1r, c2r].filter((x) => x === 1).length;
  ok('تأیید همزمان تخفیف: فقط یک برنده', winners4 === 1, `(got ${JSON.stringify([c1r, c2r])})`);

  console.log(`\n⚙️ نتیجهٔ آزمون همزمانی: ${pass} موفق، ${fail} ناموفق`);
  process.exit(fail === 0 ? 0 : 1);
} catch (err) {
  console.error('❌ خطای آزمون همزمانی:', err.message);
  process.exit(1);
} finally {
  await owner.end().catch(() => {});
}
