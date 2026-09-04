#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════
 *  Seed تست سنگین امتحانات — ۱۰۰۰ دانشجو هم‌زمان، ۱۰ سالن، ۲۰ مراقب،
 *  ۳۰ درس با ۱۵ استاد
 *
 *  سناریو: یک جلسهٔ امتحان هم‌زمان (۸:۳۰–۱۰:۳۰)؛ ۱۰۰۰ دانشجو در ۱۰ سالن
 *  (۱۰۰ نفره، هر دانشجو دقیقاً یک صندلی)؛ ۳۰ درس که هر کدام ~۳۴ دانشجو در
 *  هر ۱۰ سالن پراکنده دارند (هر درس در همهٔ سالن‌ها برگه دارد → totalHallsCount=10)
 *  و هر استاد ۲ درس.
 *
 *  جداول: courses/course_offerings/enrollments/exam_sessions/exam_halls/
 *  seat_allocations/invigilators/exam_invigilators/exam_course_packets/
 *  course_exam_sessions/exam_remuneration_rates
 *  (ردیف‌های عملیاتی — حضور و غیاب، صورتجلسه، تحویل مخزن، تحویل استاد،
 *   نمرات، اعتراض — در تست ساخته می‌شوند تا زنجیره از صفر طی شود.)
 *
 *  اجرا:   DATABASE_URL=… node scripts/exam-load-seed.mjs [--reset]
 *  ترم جدا: EXAM-1405 (isCurrent=0 — به دادهٔ حقوق ترم LOAD-1405 دست نمی‌زند)
 * ════════════════════════════════════════════════════════════════════════
 */
import pg from 'pg';

const URL = process.env.DATABASE_URL;
if (!URL) { console.error('❌ DATABASE_URL الزامی است.'); process.exit(2); }

const STUDENTS = 1000;
const HALLS = 10;
const HALL_CAP = 100;
const PROCTORS = 20;          // ۲ مراقب در هر سالن
const COURSES = 30;
const PROFESSORS = 15;        // هر استاد ۲ درس
const COURSE_COUNT = 30;      // هر درس ~۳۴ دانشجو
const ABSENT_RATE = 0.07;     // ~۷٪ غایب (برای آزمون مسیر DISCREPANCY)
const RUBRIC = { midterm: 8, finalExam: 12 }; // بارم: ۸ + ۱۲ = ۲۰

const c = new pg.Client({ connectionString: URL });
await c.connect();
const t0 = Date.now();

const has = (await c.query(`SELECT value FROM system_settings WHERE key='EXAM_TEST_SEEDED'`)).rows[0]?.value;
if (has === '1' && !process.argv.includes('--reset')) {
  console.log('ℹ  دادهٔ امتحان از قبل ساخته شده است (EXAM_TEST_SEEDED=1). برای ساخت دوباره: --reset');
  process.exit(0);
}

if (process.argv.includes('--reset')) {
  const term = (await c.query(`SELECT id FROM academic_terms WHERE "termCode"='EXAM-1405'`)).rows[0];
  if (term) {
    await c.query(`DELETE FROM grade_appeals WHERE "enrollmentId" IN (SELECT id FROM enrollments WHERE "offeringId" IN (SELECT id FROM course_offerings WHERE "termId"=$1))`, [term.id]);
    await c.query(`DELETE FROM exam_attendances WHERE "examId" IN (SELECT id FROM exam_sessions WHERE "termId"=$1)`, [term.id]);
    await c.query(`DELETE FROM exam_minutes WHERE "sessionId" IN (SELECT id FROM exam_sessions WHERE "termId"=$1)`, [term.id]);
    await c.query(`DELETE FROM exam_course_packets WHERE "examId" IN (SELECT id FROM exam_sessions WHERE "termId"=$1)`, [term.id]);
    await c.query(`DELETE FROM exam_invigilators WHERE "examId" IN (SELECT id FROM exam_sessions WHERE "termId"=$1)`, [term.id]);
    await c.query(`DELETE FROM seat_allocations WHERE "sessionId" IN (SELECT id FROM exam_sessions WHERE "termId"=$1)`, [term.id]);
    await c.query(`DELETE FROM invigilators WHERE "sessionId" IN (SELECT id FROM exam_sessions WHERE "termId"=$1)`, [term.id]);
    await c.query(`DELETE FROM instructor_deliveries WHERE "courseOfferingId" IN (SELECT id FROM course_offerings WHERE "termId"=$1)`, [term.id]);
    await c.query(`DELETE FROM course_exam_sessions WHERE "courseOfferingId" IN (SELECT id FROM course_offerings WHERE "termId"=$1)`, [term.id]);
    await c.query(`DELETE FROM enrollments WHERE "offeringId" IN (SELECT id FROM course_offerings WHERE "termId"=$1)`, [term.id]);
    await c.query(`DELETE FROM course_offerings WHERE "termId"=$1`, [term.id]);
    await c.query(`DELETE FROM exam_sessions WHERE "termId"=$1`, [term.id]);
    await c.query(`DELETE FROM courses WHERE code LIKE 'EX-%'`);
    await c.query(`DELETE FROM exam_halls WHERE name LIKE 'سالن-EX%'`);
    await c.query(`DELETE FROM academic_terms WHERE "termCode"='EXAM-1405'`);
  }
  await c.query(`DELETE FROM system_settings WHERE key='EXAM_TEST_SEEDED'`);
  console.log('🧹 دادهٔ امتحان قبلی پاک شد.');
}

// ── PRNG قطعی ──
let seed = 1405;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pad = (n, w) => String(n).padStart(w, '0');

// ── ۱) ترم جدا (جاری نمی‌شود — مزاحم موتور حقوق نیست) ──
await c.query(`INSERT INTO academic_terms ("termCode",title,"termType","isCurrent") VALUES ('EXAM-1405','نیمسال آزمون تست بار ۱۴۰۵','NORMAL',0)
  ON CONFLICT ("termCode") DO UPDATE SET title=EXCLUDED.title`);
const termId = (await c.query(`SELECT id FROM academic_terms WHERE "termCode"='EXAM-1405'`)).rows[0].id;
console.log('📅 ترم EXAM-1405 (id=' + termId + ')');

// ── ۲) دروس (۳۰ درس) ──
const courseIds = [];
for (let i = 0; i < COURSES; i++) {
  const r = await c.query(`INSERT INTO courses (code,title,units,"courseType","gradingType") VALUES ($1,$2,3,'نظری','NUMERIC')
    ON CONFLICT (code) DO UPDATE SET title=EXCLUDED.title RETURNING id`,
    ['EX-' + pad(1001 + i, 4), `درس آزمون ${i + 1}`]);
  courseIds.push(r.rows[0].id);
}
console.log('📚 دروس:', COURSES);

// ── ۳) ارائه‌ها: ۱۵ استاد × ۲ درس (استادان موجود F-LO0001..0015) ──
const profIds = [];
for (let i = 1; i <= PROFESSORS; i++) {
  profIds.push((await c.query(`SELECT id FROM staff WHERE "staffCode"='F-LO' || $1`, [pad(i, 4)])).rows[0]?.id);
}
if (profIds.some(x => !x)) throw new Error('استادان F-LO0001..0015 یافت نشدند (اول seed حقوق را اجرا کنید).');

const offeringIdByCourse = [];
for (let i = 0; i < COURSES; i++) {
  const r = await c.query(`INSERT INTO course_offerings ("termId","courseId","professorId","groupNumber",capacity,"enrolledCount","offeringType","isActive")
    VALUES ($1,$2,$3,1,40,0,'NORMAL',1) RETURNING id`,
    [termId, courseIds[i], profIds[i % PROFESSORS]]);
  offeringIdByCourse.push(r.rows[0].id);
}
console.log('🗂️  ارائه‌ها:', COURSES, '(۱۵ استاد × ۲ درس)');

// ── ۴) ثبت‌نام: دانشجوی i → درس i%30 (هر دانشجو ۱ آزمون) ──
const studentIds = [];
for (let i = 1; i <= STUDENTS; i++) {
  studentIds.push((await c.query(`SELECT id FROM students WHERE "studentCode"='LO' || $1`, [pad(i, 8)])).rows[0]?.id);
}
if (studentIds.some(x => !x)) throw new Error('دانشجویان LO00000001..00100000 یافت نشدند (اول seed حقوق را اجرا کنید).');

// slot صندلی همزمان: دانشجوی i در سالن i/100 و صندلی i%100+1
const hallByStudent = new Array(STUDENTS).fill(0).map((_, i) => Math.floor(i / HALL_CAP));
const seatByStudent = new Array(STUDENTS).fill(0).map((_, i) => (i % HALL_CAP) + 1);
const courseOfStudent = new Array(STUDENTS).fill(0).map((_, i) => i % COURSES);

const enrollRows = [];
for (let i = 0; i < STUDENTS; i++) enrollRows.push([studentIds[i], offeringIdByCourse[courseOfStudent[i]], 'REGISTERED', 'PENDING']);
for (let b = 0; b < enrollRows.length; b += 2000) {
  const chunk = enrollRows.slice(b, b + 2000);
  const params = []; const vals = [];
  chunk.forEach(r => { params.push(...r); vals.push(`($${params.length - 3},$${params.length - 2},$${params.length - 1},$${params.length})`); });
  await c.query(`INSERT INTO enrollments ("studentId","offeringId",status,"gradeStatus") VALUES ${vals.join(',')} ON CONFLICT ("studentId","offeringId") DO NOTHING`, params);
}
const enrollmentIds = (await c.query(`SELECT id FROM enrollments WHERE "offeringId" IN (SELECT id FROM course_offerings WHERE "termId"=$1) ORDER BY id`, [termId])).rows.map(r => r.id);
if (enrollmentIds.length !== STUDENTS) throw new Error('تعداد ثبت‌نام‌ها با ۱۰۰۰ نمی‌خواند: ' + enrollmentIds.length);
console.log('📝 ثبت‌نام‌ها:', enrollmentIds.length);

// ── ۵) جلسهٔ امتحان هم‌زمان ──
const [sess] = (await c.query(`INSERT INTO exam_sessions ("termId","examDate","startTime","endTime") VALUES ($1,'1405/09/17','08:30','10:30') RETURNING id`,
  [termId])).rows;
console.log('🕐 جلسهٔ امتحان:', sess.id, '(هم‌زمان ۸:۳۰–۱۰:۳۰)');

// ── ۶) سالن‌ها ──
const hallIds = [];
for (let h = 1; h <= HALLS; h++) {
  const r = await c.query(`INSERT INTO exam_halls (name,"totalCapacity","rowsCount","colsCount","buildingName") VALUES ($1,100,10,10,'ساختمان مرکزی') RETURNING id`,
    [`سالن-EX${pad(h, 2)}`]);
  hallIds.push(r.rows[0].id);
}
console.log('🏛️  سالن‌ها:', HALLS, '× ۱۰۰ نفر');

// ── ۷) صندلی‌ها ──
const seatRows = [];
for (let i = 0; i < STUDENTS; i++) {
  seatRows.push([enrollmentIds[i], sess.id, hallIds[hallByStudent[i]], seatByStudent[i], 'EX-' + pad(1001 + courseOfStudent[i], 4)]);
}
for (let b = 0; b < seatRows.length; b += 2000) {
  const chunk = seatRows.slice(b, b + 2000);
  const params = []; const vals = [];
  chunk.forEach(r => { params.push(...r); vals.push(`($${params.length - 4},$${params.length - 3},$${params.length - 2},$${params.length - 1},$${params.length})`); });
  await c.query(`INSERT INTO seat_allocations ("enrollmentId","sessionId","hallId","seatNumber","blockKey") VALUES ${vals.join(',')}`, params);
}
console.log('💺 صندلی‌ها:', STUDENTS, '(هر دانشجو یک صندلی در سالن خودش)');

// ── ۸) نرخ حق‌الزحمهٔ مراقبتی ──
await c.query(`INSERT INTO exam_remuneration_rates (role,"roleTitle","ratePerHour","effectiveYear") VALUES
  ('HEAD_INVIGILATOR','مراقب سرپرست سالن',500000,1405),('INVIGILATOR','مراقب',400000,1405) ON CONFLICT DO NOTHING`);

// ── ۹) مراقبان: ۲۰ نفر (۲ در هر سالن) — پرسنل F-LO0201..0220 ──
const proctorStaffIds = [];
for (let i = 201; i < 201 + PROCTORS; i++) {
  proctorStaffIds.push((await c.query(`SELECT id FROM staff WHERE "staffCode"='F-LO' || $1`, [pad(i, 4)])).rows[0]?.id);
}
if (proctorStaffIds.some(x => !x)) throw new Error('مراقبان F-LO0201..0220 یافت نشدند (اول seed حقوق را اجرا کنید).');
for (let h = 0; h < HALLS; h++) {
  for (let k = 0; k < 2; k++) {
    const role = k === 0 ? 'HEAD_INVIGILATOR' : 'INVIGILATOR';
    const rate = k === 0 ? 500000 : 400000;
    await c.query(`INSERT INTO invigilators ("staffId","sessionId","hallId",role,"attendanceStatus","hoursWorked","calculatedPayment","paymentStatus") VALUES ($1,$2,$3,$4,'PENDING','2.0',$5,'UNPAID')`,
      [proctorStaffIds[h * 2 + k], sess.id, hallIds[h], role, rate * 2]);
    await c.query(`INSERT INTO exam_invigilators ("examId","staffId",role,"isBilledToPayroll") VALUES ($1,$2,$3,0)`,
      [sess.id, proctorStaffIds[h * 2 + k], role]);
  }
}
const vaultManagerId = (await c.query(`SELECT id FROM staff WHERE "staffCode"='F-LO0501'`)).rows[0]?.id;
if (!vaultManagerId) throw new Error('متصدی مخزن F-LO0501 یافت نشد.');
console.log('👮 مراقبان:', PROCTORS, '(۲ در هر سالن) · متصدی مخزن: F-LO0501');

// ── ۱۰) بسته‌های اوراق هر درس (expected توسط موتور مرحلهٔ ۱ پر می‌شود) ──
for (let i = 0; i < COURSES; i++) {
  const headProctor = proctorStaffIds[(i % HALLS) * 2]; // مراقب سرپرست سالنِ درس
  await c.query(`INSERT INTO exam_course_packets ("examId","courseId","invigilatorStaffId","expectedSheetCount","handoverStatus") VALUES ($1,$2,$3,0,'NOT_STARTED')`,
    [sess.id, courseIds[i], headProctor]);
}
// ── ۱۱) تجمیع تحویل سالن‌ها: هر درس در هر ۱۰ سالن برگه دارد ──
for (let i = 0; i < COURSES; i++) {
  await c.query(`INSERT INTO course_exam_sessions ("courseOfferingId","totalHallsCount","receivedHallsCount","totalExpectedSheets","totalDeliveredSheets","isFullyCollected") VALUES ($1,10,0,0,0,0)`,
    [offeringIdByCourse[i]]);
}
console.log('📦 بسته‌ها:', COURSES, '· سطرهای تجمیع:', COURSES);

// ── نگاشت برای runner ──
await c.query(`INSERT INTO system_settings (key,value) VALUES ('EXAM_TEST_SEEDED','1') ON CONFLICT (key) DO UPDATE SET value='1'`);
await c.query(`INSERT INTO system_settings (key,value) VALUES ('EXAM_TEST_RUBRIC', $1) ON CONFLICT (key) DO UPDATE SET value=$1`, [JSON.stringify(RUBRIC)]);

console.log(`\n═══════════════════════════════════════════`);
console.log(`✅ SEED امتحانات در ${((Date.now() - t0) / 1000).toFixed(1)} ثانیه`);
console.log(`   دانشجو: ${STUDENTS} · سالن: ${HALLS} · مراقب: ${PROCTORS} · درس: ${COURSES} · استاد: ${PROFESSORS}`);
console.log(`   جلسهٔ هم‌زمان: id=${sess.id} · هر درس در ${HALLS} سالن · بارم: ${JSON.stringify(RUBRIC)}`);
console.log(`═══════════════════════════════════════════`);
await c.end();
