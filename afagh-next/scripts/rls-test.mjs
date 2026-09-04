#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════
 *  آزمون یکپارچهٔ RLS — «اثبات» محافظ سطری در دیتابیس واقعی (P0)
 *
 *  سناریوهای بازبینی مهندسی (Cross-User Test):
 *    کاربر A → set app.user_id = A → SELECT دادهٔ کاربر B → باید ۰ ردیف
 *    کاربر A → UPDATE ردیف B          → باید ۰ ردیف (سیاست USING)
 *    کاربر A → INSERT ثبت‌نام برای B  → باید DENIED (WITH CHECK)
 *    کاربر A → DELETE سبد خرید B      → باید ۰ ردیف
 *    کاربر A → UPDATE نمرهٔ خودش      → باید DENIED (گرنت ستونی)
 *    بدون set_config                   → باید ۰ ردیف در همهٔ جداول
 *    deny-all (system_settings)        → باید ۰ ردیف
 *
 *  اجرا در CI (بعد از drizzle-kit push + patches + seed-base + hardening):
 *    DATABASE_URL=… DATABASE_URL_APP=… node scripts/rls-test.mjs
 * ════════════════════════════════════════════════════════════════════════
 */
import pg from 'pg';

const OWNER_URL = process.env.DATABASE_URL;
const APP_URL = process.env.DATABASE_URL_APP;
if (!OWNER_URL || !APP_URL) {
  console.error('❌ DATABASE_URL و DATABASE_URL_APP هر دو الزامی‌اند.');
  process.exit(2);
}

const owner = new pg.Client({ connectionString: OWNER_URL });
const app = new pg.Client({ connectionString: APP_URL });

let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};
const expectErrCode = async (name, fn, code) => {
  try {
    await fn();
    fail++; console.log(`  ✗ ${name} → خطایی نیامد (انتظار ${code})`);
  } catch (e) {
    if (e.code === code) { pass++; console.log(`  ✓ ${name} → ${code}`); }
    else { fail++; console.log(`  ✗ ${name} → ${e.code} (انتظار ${code})`); }
  } finally {
    await q(app, 'ROLLBACK').catch(() => {});
  }
};

const q = (client, text, params = []) => client.query(text, params);

try {
  await owner.connect();
  await app.connect();

  const tag = Date.now().toString(36);
  const NC_A = `9${tag.slice(-8)}1`; // کد ملی مصنوعی یکتا
  const NC_B = `9${tag.slice(-8)}2`;

  // ═══ فیکسچر (نقش مالک — همان جریان migrator) ═══
  const [uA] = (await q(owner, `INSERT INTO users ("nationalCode","firstName","lastName","passwordHash","isActive")
    VALUES ($1,'تست','الف','x',1) RETURNING id`, [NC_A])).rows;
  const [uB] = (await q(owner, `INSERT INTO users ("nationalCode","firstName","lastName","passwordHash","isActive")
    VALUES ($1,'تست','ب','x',1) RETURNING id`, [NC_B])).rows;

  const [deg] = (await q(owner, `SELECT id FROM degree_level_configs ORDER BY id LIMIT 1`)).rows;
  const [reg] = (await q(owner, `SELECT id FROM educational_regulations ORDER BY id LIMIT 1`)).rows;
  if (!deg || !reg) throw new Error('seed-base اجرا نشده؟ (degree/regulation خالی)');

  const [sA] = (await q(owner, `INSERT INTO students ("userId","studentCode","degreeLevelId","regulationId","entryYear","status")
    VALUES ($1,$2,$3,$4,1404,'ACTIVE') RETURNING id`, [uA.id, `T${tag}A`, deg.id, reg.id])).rows;
  const [sB] = (await q(owner, `INSERT INTO students ("userId","studentCode","degreeLevelId","regulationId","entryYear","status")
    VALUES ($1,$2,$3,$4,1404,'ACTIVE') RETURNING id`, [uB.id, `T${tag}B`, deg.id, reg.id])).rows;

  const [term] = (await q(owner, `INSERT INTO academic_terms ("termCode","title","isCurrent")
    VALUES ($1,'ترم تست RLS',1) RETURNING id`, [`R${tag}`])).rows;
  const [course] = (await q(owner, `INSERT INTO courses (code,title,units) VALUES ($1,'درس تست RLS',3) RETURNING id`, [`C${tag}`])).rows;
  const [off] = (await q(owner, `INSERT INTO course_offerings ("termId","courseId","capacity","enrolledCount","isActive")
    VALUES ($1,$2,30,0,1) RETURNING id`, [term.id, course.id])).rows;

  const [enrB] = (await q(owner, `INSERT INTO enrollments ("studentId","offeringId","status")
    VALUES ($1,$2,'REGISTERED') RETURNING id`, [sB.id, off.id])).rows;
  const [enrA] = (await q(owner, `INSERT INTO enrollments ("studentId","offeringId","status")
    VALUES ($1,$2,'REGISTERED') RETURNING id`, [sA.id, off.id])).rows;
  await q(owner, `INSERT INTO cart_items ("studentId","offeringId") VALUES ($1,$2)`, [sB.id, off.id]);
  await q(owner, `INSERT INTO notifications ("userId","eventCode") VALUES ($1,'RLS_TEST')`, [uB.id]);

  const [proc] = (await q(owner, `INSERT INTO process_definitions (code,title) VALUES ($1,'تست RLS') RETURNING id`, [`P${tag}`])).rows;
  await q(owner, `INSERT INTO student_requests ("trackingCode","studentId","processId","status")
    VALUES ($1,$2,$3,'SUBMITTED')`, [`REQ${tag}`, sB.id, proc.id]);

  await q(owner, `INSERT INTO student_ledger ("studentId","transactionType",amount) VALUES ($1,'CHARGE',1000)`, [sB.id]);
  await q(owner, `INSERT INTO financial_clearances ("studentId","termId","isCleared") VALUES ($1,$2,0)`, [sB.id, term.id]);
  const [dcat] = (await q(owner, `INSERT INTO document_categories (title) VALUES ('تست RLS') RETURNING id`)).rows;
  await q(owner, `INSERT INTO "student_documents" ("personUserId","categoryId","fileName","fileUrl") VALUES ($1,$2,'t.pdf','t.pdf')`, [uB.id, dcat.id]);

  // set_config فقط داخل SELECT معتبر است و با پارامتر نمی‌توان چند دستور فرستاد
  // (node-pg چند دستور با پارامتر را نمی‌پذیرد)؛ پس تراکنش به سه پرس‌وجوی مجزا باز می‌شود.
  const uid = (id) => `SELECT set_config('app.user_id','${id}',true)`;
  const beginAs = async (id) => { await q(app, 'BEGIN'); await q(app, uid(id)); };

  // ═══ ۱) خواندن: A نباید هیچ دادهٔ B را ببیند ═══
  console.log('\n— ۱) جداسازی خواندن (A در برابر دادهٔ B)');
  await beginAs(uA.id);
  let r = await q(app, `SELECT "userId" FROM students WHERE "userId" = $1`, [uB.id]);
  check('students: دادهٔ B از دید A = ۰ ردیف', r.rowCount === 0);
  r = await q(app, `SELECT "userId" FROM students WHERE "userId" = $1`, [uA.id]);
  check('students: دادهٔ خود A = ۱ ردیف', r.rowCount === 1);
  r = await q(app, `SELECT "id" FROM users WHERE "id" = $1`, [uB.id]);
  check('users: دادهٔ B = ۰ ردیف', r.rowCount === 0);
  r = await q(app, `SELECT id FROM enrollments WHERE "id" = $1`, [enrB.id]);
  check('enrollments: ثبت‌نام B = ۰ ردیف', r.rowCount === 0);
  r = await q(app, `SELECT id FROM enrollments WHERE "id" = $1`, [enrA.id]);
  check('enrollments: ثبت‌نام خود A = ۱ ردیف', r.rowCount === 1);
  r = await q(app, `SELECT id FROM cart_items`, []);
  check('cart_items: سبد B از دید A = ۰ ردیف', r.rowCount === 0);
  r = await q(app, `SELECT id FROM notifications`, []);
  check('notifications: اعلان B = ۰ ردیف', r.rowCount === 0);
  r = await q(app, `SELECT id FROM student_requests`, []);
  check('student_requests: درخواست B = ۰ ردیف', r.rowCount === 0);
  r = await q(app, `SELECT id FROM student_ledger`, []);
  check('student_ledger: تراکنش B = ۰ ردیف', r.rowCount === 0);
  r = await q(app, `SELECT id FROM financial_clearances`, []);
  check('financial_clearances: تسویهٔ B = ۰ ردیف', r.rowCount === 0);
  r = await q(app, `SELECT id FROM "student_documents"`, []);
  check('student_documents: مدرک B = ۰ ردیف', r.rowCount === 0);
  r = await q(app, `SELECT count(*)::int AS n FROM system_settings`, []);
  check('deny-all: system_settings (کلیدهای cron) = ۰ ردیف', r.rows[0].n === 0);
  r = await q(app, `SELECT count(*)::int AS n FROM audit_logs`, []);
  check('deny-all: audit_logs = ۰ ردیف', r.rows[0].n === 0);
  await q(app, 'COMMIT');

  // ═══ ۲) بدون set_config → همه‌چیز خالی ═══
  console.log('\n— ۲) نبود app.user_id = هیچ دسترسی‌ای');
  await q(app, 'BEGIN');
  r = await q(app, `SELECT count(*)::int AS n FROM students`, []);
  check('بدون تنظیم: students = ۰ ردیف', r.rows[0].n === 0);
  await q(app, 'COMMIT');

  // ═══ ۳) نوشتن: هیچ تغییری روی دادهٔ B ممکن نیست ═══
  console.log('\n— ۳) نوشتن: حملهٔ Cross-User مسدود است');
  await beginAs(uA.id);
  r = await q(app, `UPDATE enrollments SET status = 'DROPPED' WHERE "id" = $1`, [enrB.id]);
  check('UPDATE دانشجوی B → ۰ ردیف (سیاست USING)', r.rowCount === 0);
  r = await q(app, `DELETE FROM cart_items WHERE "studentId" = $1`, [sB.id]);
  check('DELETE سبد B → ۰ ردیف', r.rowCount === 0);
  await q(app, 'COMMIT');
  await expectErrCode('INSERT ثبت‌نام برای B → 42501 (WITH CHECK)',
    async () => { await beginAs(uA.id); await q(app, `INSERT INTO enrollments ("studentId","offeringId","status") VALUES ($1,$2,'REGISTERED')`, [sB.id, off.id]); },
    '42501');
  await expectErrCode('INSERT اعلان برای B → 42501',
    async () => { await beginAs(uA.id); await q(app, `INSERT INTO notifications ("userId","eventCode") VALUES ($1,'X')`, [uB.id]); },
    '42501');
  await expectErrCode('UPDATE نمرهٔ خود A → 42501 (گرنت ستونی: gradeValue خارج از مجوز)',
    async () => { await beginAs(uA.id); await q(app, `UPDATE enrollments SET "gradeValue" = 20 WHERE "id" = $1`, [enrA.id]); },
    '42501');
  await expectErrCode('UPDATE کارتابل/مبلغ توسط خود A → 42501 (ردیف B)',
    async () => { await beginAs(uA.id); await q(app, `UPDATE student_ledger SET amount = -999999 WHERE "studentId" = $1`, [sB.id]); },
    '42501');

  // ═══ ۴) مجازهای واقعی: اقدام دانشجو روی دادهٔ خودش ═══
  console.log('\n— ۴) مجوزهای ستونیِ دقیق (اقدام دانشجو روی خودش)');
  await beginAs(uA.id);
  await q(app, `UPDATE enrollments SET status = 'DROPPED' WHERE "id" = $1`, [enrA.id]);
  await q(app, 'COMMIT');
  r = await q(owner, `SELECT status FROM enrollments WHERE "id" = $1`, [enrA.id]);
  check('UPDATE status توسط خود A → مجاز و اعمال شد', r.rows[0].status === 'DROPPED');
  await q(owner, `UPDATE enrollments SET status = 'REGISTERED' WHERE "id" = $1`, [enrA.id]);
  await beginAs(uA.id);
  await q(app, `INSERT INTO notifications ("userId","eventCode") VALUES ($1,'OK')`, [uA.id]);
  await q(app, 'COMMIT');
  check('INSERT اعلان برای خود A → مجاز', true);

  console.log(`\n🔒 نتیجهٔ آزمون RLS: ${pass} موفق، ${fail} ناموفق`);
  process.exit(fail === 0 ? 0 : 1);
} catch (err) {
  console.error('❌ خطای آزمون:', err.message);
  process.exit(1);
} finally {
  await owner.end().catch(() => {});
  await app.end().catch(() => {});
}
