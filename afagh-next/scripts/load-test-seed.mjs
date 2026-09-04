#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════
 *  Seed تست سنگین بارگذاری — ۳۰۰۰ دانشجو + ۱۵۰۰ استاد
 *
 *  تمام جداولی که موتور حقوق (payroll-engine) و مسیر نمرات برای محاسبهٔ
 *  واقعی نیاز دارند، با دادهٔ مصنوعی ولی ازنظر شکلی واقعی پر می‌شود:
 *    users/user_roles/staff/students/courses/terms/course_offerings/
 *    offering_professors/enrollments/class_sessions/professor_term_contracts/
 *    electronic_documents/teaching_rates/teaching_coefficients/
 *    payroll_calculation_rules
 *
 *  اجرا:  DATABASE_URL=… node scripts/load-test-seed.mjs [--reset]
 *  (--reset: دادهٔ لوادتست قبلی + نشانگر حذف و از نو ساخته می‌شود)
 *
 *  idempotent: اگر نشانگر LOAD_TEST_SEEDED=1 باشد، بدون تغییر خارج می‌شود.
 * ════════════════════════════════════════════════════════════════════════
 */
import pg from 'pg';

const URL = process.env.DATABASE_URL;
if (!URL) { console.error('❌ DATABASE_URL الزامی است.'); process.exit(2); }

const STAFF = 1500;
const STUDENTS = 3000;
const COURSES = 300;
const OFFERINGS = STAFF * 2;              // هر استاد ۲ ارائهٔ درس
const LARGE_FROM = OFFERINGS - 300;       // ۳۰۰ کلاس پرجمعیت (>۴۰ نفر)
const ENROLL_PER_STUDENT = 5;             // طرح پایه: هر دانشجو ۵ درس
const LARGE_CLASS_SIZE = 60;
const SESSIONS_PER_OFFERING = 17;         // ۱۶ جلسهٔ اصلی + ۱ جبرانی در برخی
const RANKS = ['مربی', 'استادیار', 'دانشیار', 'استاد تمام'];
const DEGREES = ['کارشناسی ارشد', 'دکتری تخصصی (Ph.D.)'];

const c = new pg.Client({ connectionString: URL });
await c.connect();
const t0 = Date.now();

const has = (await c.query(`SELECT value FROM system_settings WHERE key='LOAD_TEST_SEEDED'`)).rows[0]?.value;
if (has === '1' && !process.argv.includes('--reset')) {
  console.log('ℹ  دادهٔ لوادتست از قبل ساخته شده است (LOAD_TEST_SEEDED=1). برای ساخت دوباره: --reset');
  process.exit(0);
}

if (process.argv.includes('--reset')) {
  // حذف دادهٔ لوادتست — شناسایی دقیق از طریق پیوند (staffCode/studentCode/کدهای 8LD/9LD)
  // تا کاربران دمو (مثل 31412001 و 9401123401) هرگز حذف نشوند.
  await c.query(`CREATE TEMP TABLE _load_uids AS
    SELECT id FROM users WHERE "nationalCode" LIKE '8LD%' OR "nationalCode" LIKE '9LD%'
       OR id IN (SELECT "userId" FROM staff WHERE "staffCode" LIKE 'F-LO%')
       OR id IN (SELECT "userId" FROM students WHERE "studentCode" LIKE 'LO%')`);
  await c.query(`DELETE FROM user_roles WHERE "userId" IN (SELECT id FROM _load_uids)`);
  await c.query(`DELETE FROM class_sessions WHERE "offeringId" IN (SELECT id FROM course_offerings WHERE "termId" IN (SELECT id FROM academic_terms WHERE "termCode"='LOAD-1405'))`);
  await c.query(`DELETE FROM enrollments WHERE "offeringId" IN (SELECT id FROM course_offerings WHERE "termId" IN (SELECT id FROM academic_terms WHERE "termCode"='LOAD-1405'))`);
  await c.query(`DELETE FROM offering_professors WHERE "offeringId" IN (SELECT id FROM course_offerings WHERE "termId" IN (SELECT id FROM academic_terms WHERE "termCode"='LOAD-1405'))`);
  await c.query(`DELETE FROM course_offerings WHERE "termId" IN (SELECT id FROM academic_terms WHERE "termCode"='LOAD-1405')`);
  await c.query(`DELETE FROM electronic_documents WHERE "termId" IN (SELECT id FROM academic_terms WHERE "termCode"='LOAD-1405')`);
  await c.query(`DELETE FROM payroll_statements WHERE "contractId" IN (SELECT id FROM professor_term_contracts WHERE "termId" IN (SELECT id FROM academic_terms WHERE "termCode"='LOAD-1405'))`);
  await c.query(`DELETE FROM professor_term_contracts WHERE "termId" IN (SELECT id FROM academic_terms WHERE "termCode"='LOAD-1405')`);
  await c.query(`DELETE FROM courses WHERE code LIKE 'LO-%'`);
  await c.query(`DELETE FROM staff WHERE "staffCode" LIKE 'F-LO%'`);
  await c.query(`DELETE FROM students WHERE "studentCode" LIKE 'LO%'`);
  await c.query(`DELETE FROM users WHERE id IN (SELECT id FROM _load_uids)`);
  await c.query(`DROP TABLE _load_uids`);
  await c.query(`DELETE FROM academic_terms WHERE "termCode"='LOAD-1405'`);
  await c.query(`DELETE FROM system_settings WHERE key='LOAD_TEST_SEEDED'`);
  console.log('🧹 دادهٔ قبلی پاک شد.');
}

// ── PRNG قطعی برای تکرارپذیری ──
let seed = 1405;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const pad = (n, w) => String(n).padStart(w, '0');

// ── ۱) نقش‌ها ──
const roleIds = {};
for (const code of ['STUDENT', 'PROFESSOR']) {
  await c.query(`INSERT INTO roles (code,title,"isSystem") VALUES ($1,$2,1) ON CONFLICT (code) DO NOTHING`, [code, code === 'STUDENT' ? 'دانشجو' : 'هیئت علمی']);
  roleIds[code] = (await c.query(`SELECT id FROM roles WHERE code=$1`, [code])).rows[0].id;
}

// ── ۲) ترم لوادتست ──
await c.query(`INSERT INTO academic_terms ("termCode",title,"termType","isCurrent") VALUES ('LOAD-1405','نیمسال تست بار ۱۴۰۵','NORMAL',0)
  ON CONFLICT ("termCode") DO UPDATE SET "isCurrent"=0`);
const termId = (await c.query(`SELECT id FROM academic_terms WHERE "termCode"='LOAD-1405'`)).rows[0].id;
// ترم دموی قبلی را از «جاری» خارج کن تا موتور روی ترم لوادتست متمرکز شود
await c.query(`UPDATE academic_terms SET "isCurrent"=0 WHERE id<>$1`, [termId]);
await c.query(`UPDATE academic_terms SET "isCurrent"=1 WHERE id=$1`, [termId]);
console.log('📅 ترم LOAD-1405 (id=' + termId + ')');

// ── ۳) نرخ‌ها و ضرایب (پیکربندی حقوق) ──
const rateVals = [];
for (const r of RANKS) for (const d of DEGREES) {
  const base = r === 'استاد تمام' ? 8000000 : r === 'دانشیار' ? 6500000 : r === 'استادیار' ? 5000000 : 4000000;
  rateVals.push([r, d, d.includes('دکتری') ? base : Math.floor(base * 0.85), 1404]);
}
for (const v of rateVals)
  await c.query(`INSERT INTO teaching_rates ("academicRank",degree,"baseRatePerUnit","effectiveYear") VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, v);

await c.query(`INSERT INTO teaching_coefficients ("ruleName",multiplier) VALUES ('ضریب درس عملی',1.20),('ضریب مقطع ارشد',1.00),('ضریب کلاس جمعی (>۴۰ نفر)',1.15) ON CONFLICT DO NOTHING`);

await c.query(`INSERT INTO payroll_calculation_rules ("offeringType","professorRole","multiplierUnit","multiplierPerStudent","flatFee",title,"isActive") VALUES
  ('NORMAL','MAIN_LECTURER',1.00,NULL,NULL,'درس نظری (فرمول استاندارد واحد)',1),
  ('PRACTICAL','MAIN_LECTURER',1.20,NULL,NULL,'درس عملی/آزمایشگاهی',1),
  ('THESIS','SUPERVISOR',NULL,NULL,5000000,'راهنمایی پایان‌نامه (مبلغ ثابت)',1)
  ON CONFLICT DO NOTHING`);
console.log('⚙️  پیکربندی نرخ/ضریب/قواعد');

// ── ۴) دروس ──
const courseIds = [];
for (let i = 0; i < COURSES; i++) {
  const code = 'LO-' + pad(1001 + i, 4);
  const r = await c.query(`INSERT INTO courses (code,title,units,"courseType","gradingType") VALUES ($1,$2,$3,$4,'NUMERIC')
    ON CONFLICT (code) DO UPDATE SET title=EXCLUDED.title RETURNING id`,
    [code, `درس آزمایشی ${i + 1}`, (i % 5 === 0 ? 2 : 3), i % 4 === 0 ? 'عملی' : 'نظری']);
  courseIds.push(r.rows[0].id);
}
console.log('📚 دروس:', COURSES);

// ── ۵) کاربران (استاد + دانشجو) ──
const usersBatch = [];
const passHash = '!load-test';
for (let i = 0; i < STAFF; i++) {
  const nc = '8LD' + pad(i + 1, 7);
  const rank = RANKS[i % 4];
  usersBatch.push([nc, `استاد${pad(i + 1, 4)}`, 'لوادتست', passHash, 1]);
}
for (let i = 0; i < STUDENTS; i++) {
  const nc = '9LD' + pad(i + 1, 7);
  usersBatch.push([nc, `دانشجو${pad(i + 1, 4)}`, 'لوادتست', passHash, 1]);
}
const userIds = { staff: [], students: [] };
for (let b = 0; b < usersBatch.length; b += 500) {
  const chunk = usersBatch.slice(b, b + 500);
  for (const v of chunk) {
    await c.query(`INSERT INTO users ("nationalCode","firstName","lastName","passwordHash","isActive") VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT ("nationalCode") DO NOTHING`, v);
  }
}
for (let i = 0; i < STAFF; i++) {
  const nc = '8LD' + pad(i + 1, 7);
  userIds.staff.push((await c.query(`SELECT id FROM users WHERE "nationalCode"=$1`, [nc])).rows[0].id);
  await c.query(`INSERT INTO user_roles ("userId","roleId") VALUES ($1,$2) ON CONFLICT DO NOTHING`, [userIds.staff[i], roleIds.PROFESSOR]);
}
for (let i = 0; i < STUDENTS; i++) {
  const nc = '9LD' + pad(i + 1, 7);
  userIds.students.push((await c.query(`SELECT id FROM users WHERE "nationalCode"=$1`, [nc])).rows[0].id);
  await c.query(`INSERT INTO user_roles ("userId","roleId") VALUES ($1,$2) ON CONFLICT DO NOTHING`, [userIds.students[i], roleIds.STUDENT]);
}
console.log('👤 کاربران:', usersBatch.length, '(استاد:', STAFF, '، دانشجو:', STUDENTS, ')');

// ── ۶) استادان ──
const staffIds = [];
for (let i = 0; i < STAFF; i++) {
  const rank = RANKS[i % 4];
  const degree = DEGREES[i % 2];
  const r = await c.query(`INSERT INTO staff ("userId","staffCode","staffType","academicRank",degree,"isActive") VALUES ($1,$2,$3,$4,$5,1)
    ON CONFLICT ("staffCode") DO NOTHING RETURNING id`,
    [userIds.staff[i], 'F-LO' + pad(i + 1, 4), (rank === 'دانشیار' || rank === 'استاد تمام') ? 'هیئت علمی' : 'مدعو', rank, degree]);
  staffIds.push(r.rows[0]?.id ?? (await c.query(`SELECT id FROM staff WHERE "staffCode"=$1`, ['F-LO' + pad(i + 1, 4)])).rows[0].id);
}
console.log('🎓 استادان:', staffIds.length);

// ── ۷) دانشجویان ──
const [deg] = (await c.query(`SELECT id FROM degree_level_configs LIMIT 1`)).rows;
const [reg] = (await c.query(`SELECT id FROM educational_regulations LIMIT 1`)).rows;
const studentIds = [];
for (let i = 0; i < STUDENTS; i++) {
  const r = await c.query(`INSERT INTO students ("userId","studentCode","degreeLevelId","regulationId","entryYear","status") VALUES ($1,$2,$3,$4,1403,'ACTIVE')
    ON CONFLICT ("studentCode") DO NOTHING RETURNING id`,
    [userIds.students[i], 'LO' + pad(i + 1, 8), deg.id, reg.id]);
  studentIds.push(r.rows[0]?.id ?? (await c.query(`SELECT id FROM students WHERE "studentCode"=$1`, ['LO' + pad(i + 1, 8)])).rows[0].id);
}
console.log('🧑‍🎓 دانشجویان:', studentIds.length);

// ── ۸) ارائه‌های درس (هر استاد ۲ کلاس) ──
const offeringIds = [];
const offeringProfessor = []; // [offeringId, professorId]
for (let i = 0; i < OFFERINGS; i++) {
  const prof = staffIds[i % STAFF]; // توزیع چرخشی: هر استاد ≈ ۲ کلاس
  const r = await c.query(`INSERT INTO course_offerings ("termId","courseId","professorId","groupNumber",capacity,"enrolledCount","offeringType","isActive")
    VALUES ($1,$2,$3,1,40,0,$4,1) RETURNING id`,
    [termId, courseIds[(i * 7) % COURSES], prof, i % 4 === 1 ? 'PRACTICAL' : 'NORMAL']);
  offeringIds.push(r.rows[0].id);
  offeringProfessor.push([r.rows[0].id, prof]);
}
// کلاس‌های هم‌یار (co-taught): ۳۰۰ ارائهٔ اضافه → استاد «همکار» با سهم ۵۰٪ (موتور به همکار ارجاع می‌دهد)
for (let i = 0; i < 300; i++) {
  const main = staffIds[(i * 13) % STAFF];
  const co = staffIds[(i * 13 + 7) % STAFF];
  const r = await c.query(`INSERT INTO course_offerings ("termId","courseId","professorId","groupNumber",capacity,"enrolledCount","offeringType","isActive")
    VALUES ($1,$2,$3,2,40,0,'NORMAL',1) RETURNING id`,
    [termId, courseIds[(i * 11 + 5) % COURSES], main]);
  const oid = r.rows[0].id;
  offeringIds.push(oid);
  offeringProfessor.push([oid, main]);
  await c.query(`INSERT INTO offering_professors ("offeringId","staffId",role,"sharePercentage") VALUES ($1,$2,'CO_LECTURER',50.00)`, [oid, co]);
}
console.log('🗂️  ارائه‌های درس:', offeringIds.length);

// ── ۹) ثبت‌نام‌ها ──
// طرح: هر دانشجو ۵ کلاس (حلقهٔ پیوسته) + ۳۰۰ کلاس پرجمعیت با ۶۰ دانشجو
const enrollPlan = []; // [studentId, offeringId]
for (let s = 0; s < STUDENTS; s++) {
  for (let k = 0; k < ENROLL_PER_STUDENT; k++) {
    enrollPlan.push([studentIds[s], offeringIds[(s * 5 + k) % LARGE_FROM]]);
  }
}
for (let l = 0; l < 300; l++) {
  for (let k = 0; k < LARGE_CLASS_SIZE; k++) {
    enrollPlan.push([studentIds[(l * LARGE_CLASS_SIZE + k) % STUDENTS], offeringIds[LARGE_FROM + l]]);
  }
}
console.log('📝 ردیف‌های ثبت‌نام (خام):', enrollPlan.length, '— درج…');
// gradeStatus: استاد i%3==0 → همهٔ کلاس‌هایش FINALIZED (گلوگاه باز)؛ بقیه مخلوط
const staffGateOpen = new Set();
for (let i = 0; i < STAFF; i++) if (i % 3 === 0) staffGateOpen.add(staffIds[i]);
const offeringGateOpen = new Set(offeringProfessor.filter(([, p]) => staffGateOpen.has(p)).map(([o]) => o));
let inserted = 0;
for (let b = 0; b < enrollPlan.length; b += 5000) {
  const chunk = enrollPlan.slice(b, b + 5000);
  const vals = [];
  const params = [];
  chunk.forEach((e, k) => {
    const gateOpen = offeringGateOpen.has(e[1]);
    params.push(e[0], e[1], 'REGISTERED', gateOpen ? 'FINALIZED' : (k % 5 < 3 ? 'TEMPORARY' : 'DRAFT'));
    vals.push(`($${params.length - 3},$${params.length - 2},$${params.length - 1},$${params.length})`);
  });
  const r = await c.query(`INSERT INTO enrollments ("studentId","offeringId",status,"gradeStatus") VALUES ${vals.join(',')} ON CONFLICT ("studentId","offeringId") DO UPDATE SET "gradeStatus"=EXCLUDED."gradeStatus"`, params);
  inserted += r.rowCount;
}
// به‌روزرسانی enrolledCount واقعی
await c.query(`UPDATE course_offerings o SET "enrolledCount" = x.n FROM (SELECT "offeringId", count(*)::int n FROM enrollments GROUP BY "offeringId") x WHERE o.id = x."offeringId"`);
console.log('✅ ثبت‌نام‌ها:', inserted);

// ── ۱۰) جلسات کلاس‌ها — ۱۷ جلسه در هر کلاس ──
const sessionVals = [];
for (const oid of offeringIds) {
  for (let n = 1; n <= 16; n++) {
    const absent = (n === 4 || n === 9) && rnd() < 0.3;
    sessionVals.push([oid, `1405/07/${pad(n, 2)}`, '08:30', '10:00', absent ? 'ABSENT' : 'HELD', 0, n]);
  }
  if (rnd() < 0.3) sessionVals.push([oid, '1405/08/01', '08:30', '10:00', 'HELD', 1, 17]); // جلسهٔ جبرانی
}
for (let b = 0; b < sessionVals.length; b += 2000) {
  const chunk = sessionVals.slice(b, b + 2000);
  const params = [];
  const vals = [];
  chunk.forEach(s => {
    params.push(...s);
    vals.push(`($${params.length - 6},$${params.length - 5},$${params.length - 4},$${params.length - 3},$${params.length - 2},$${params.length - 1},$${params.length})`);
  });
  await c.query(`INSERT INTO class_sessions ("offeringId","sessionDate","startTime","endTime",status,"isMakeUpSession","sessionNo") VALUES ${vals.join(',')}`, params);
}
console.log('🗓️  جلسات:', sessionVals.length);

// ── ۱۱) قراردادهای ترمی ──
const contractIds = [];
for (let i = 0; i < STAFF; i++) {
  const rankRes = await c.query(`SELECT "academicRank" FROM staff WHERE id=$1`, [staffIds[i]]);
  const fullTime = rankRes.rows[0].academicRank === 'دانشیار' || rankRes.rows[0].academicRank === 'استاد تمام';
  const r = await c.query(`INSERT INTO professor_term_contracts ("staffId","termId","contractType","baseDutyUnits","taxRate") VALUES ($1,$2,$3,$4,0.10) RETURNING id`,
    [staffIds[i], termId, fullTime ? 'FULL_TIME_FACULTY' : 'ADJUNCT', fullTime ? 10 : 0]);
  contractIds.push(r.rows[0].id);
}
console.log('📄 قراردادها:', contractIds.length);

// ── ۱۲) اسناد الکترونیک (گلوگاه ۲) ──
let docs = 0;
for (let i = 0; i < STAFF; i++) {
  const gateOpen = staffGateOpen.has(staffIds[i]);
  const docs_ = [
    [contractIds[i], staffIds[i], termId, 'CONTRACT', 'قرارداد حق‌التدریس', '{}', 'H-' + (i + 1), gateOpen ? 'SIGNED' : 'SIGNED'],
    [contractIds[i], staffIds[i], termId, 'DECREE', 'ابلاغیه تدریس', '{}', 'H-' + (i + 1) + 'b', gateOpen ? 'SIGNED' : 'PENDING'],
  ];
  for (const d of docs_) {
    await c.query(`INSERT INTO electronic_documents ("contractId","staffId","termId","docType",title,"documentSnapshot","documentHash","signatureStatus") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, d);
    docs++;
  }
}
console.log('📜 اسناد:', docs);

// ── ۱۳) نشانگر ──
await c.query(`INSERT INTO system_settings (key,value) VALUES ('LOAD_TEST_SEEDED','1') ON CONFLICT (key) DO UPDATE SET value='1'`);

console.log(`\n═══════════════════════════════════════════`);
console.log(`✅ SEED کامل شد در ${((Date.now() - t0) / 1000).toFixed(1)} ثانیه`);
console.log(`   استاد: ${STAFF} · دانشجو: ${STUDENTS} · کلاس: ${OFFERINGS} (+300 هم‌یار)`);
console.log(`   ثبت‌نام: ${inserted} · جلسات: ${sessionVals.length} · اسناد: ${docs}`);
console.log(`═══════════════════════════════════════════`);
await c.end();
