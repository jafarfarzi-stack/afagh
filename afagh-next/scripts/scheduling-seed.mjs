#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════
 * Seed تست یکپارچهٔ موتور برنامه‌ریزی درسی
 *
 * ۲ دانشکده، ۵ گروه آموزشی، ۳ رشته، ~۱۰۰ دانشجوی فعال، خوشهٔ هم‌ارز
 * (ریاضی عمومی ۱ + ریاضیات پایه)، درس خدماتی معارف و تربیت بدنی
 * (کارتابل دوگانه)، ساعات حضور اساتید، کلاس‌های فیزیکی با facultyId.
 *
 * اجرا:   DATABASE_URL=… node scripts/scheduling-seed.mjs [--reset]
 * ════════════════════════════════════════════════════════════════════════
 */
import pg from 'pg';

const URL = process.env.DATABASE_URL;
if (!URL) { console.error('❌ DATABASE_URL الزامی است.'); process.exit(2); }

const c = new pg.Client({ connectionString: URL });
await c.connect();

const TERM = 'SCT-1405';
const LEGACY = 'SCT-1404';

async function q(text, params) { return (await c.query(text, params)).rows; }

if (process.argv.includes('--reset') || (await q(`SELECT id FROM academic_terms WHERE "termCode"=$1`, [TERM])).length === 0) {
  // پاکسازی فقط دیتای این سناریو (ترتیب سخت‌گیرانهٔ FK)
  const termSel = `SELECT id FROM academic_terms WHERE "termCode" LIKE 'SCT-%'`;
  const offerSel = `SELECT id FROM course_offerings WHERE "termId" IN (${termSel})`;
  const staffSel = `SELECT id FROM staff WHERE "staffCode" LIKE 'SCT-%'`;
  await c.query(`DELETE FROM term_scheduling_states WHERE "termId" IN (${termSel})`);
  await c.query(`DELETE FROM scheduling_allocations WHERE "termId" IN (${termSel})`);
  await c.query(`DELETE FROM scheduling_room_grants WHERE "termId" IN (${termSel})`);
  await c.query(`DELETE FROM schedules WHERE "offeringId" IN (${offerSel})`);
  await c.query(`DELETE FROM offering_professors WHERE "offeringId" IN (${offerSel})`);
  await c.query(`DELETE FROM enrollments WHERE "offeringId" IN (${offerSel})`);
  await c.query(`DELETE FROM course_offerings WHERE "termId" IN (${termSel})`);
  await c.query(`DELETE FROM syllabus_courses WHERE "courseId" IN (SELECT id FROM courses WHERE code LIKE 'SCT-%')`);
  await c.query(`DELETE FROM syllabuses WHERE "majorId" IN (SELECT id FROM majors WHERE "majorCode" IN ('SCT-PSY','SCT-ACC','SCT-CS'))`);
  await c.query(`DELETE FROM professor_availabilities WHERE "staffId" IN (${staffSel})`);
  await c.query(`DELETE FROM staff WHERE "staffCode" LIKE 'SCT-%'`);
  await c.query(`DELETE FROM students WHERE "studentCode" LIKE 'SCT-%'`);
  await c.query(`DELETE FROM users WHERE "nationalCode" LIKE 'SCT%'`);
  await c.query(`DELETE FROM courses WHERE code LIKE 'SCT-%'`);
  await c.query(`DELETE FROM equivalence_clusters WHERE "clusterTitle" LIKE 'SCT-%'`);
  await c.query(`DELETE FROM majors WHERE "majorCode" IN ('SCT-PSY','SCT-ACC','SCT-CS')`);
  await c.query(`DELETE FROM departments WHERE "departmentCode" IN ('SCT-MAAREF','SCT-PAYEH','SCT-PSY','SCT-ACC','SCT-CS','SCT-SPORT')`);
  await c.query(`DELETE FROM classrooms WHERE name LIKE 'SCT-%'`);
  await c.query(`DELETE FROM faculties WHERE "facultyCode" IN ('SCT-HUM','SCT-ENG')`);
  await c.query(`DELETE FROM academic_terms WHERE "termCode" LIKE 'SCT-%'`);
  await c.query(`DELETE FROM educational_regulations WHERE title='آیین‌نامه تست برنامه‌ریزی'`);
  await c.query(`DELETE FROM degree_level_configs WHERE code='SCT-BSC'`);
}

const t0 = Date.now();
const uid = (i) => `SCTU${String(i).padStart(6, '0')}`; // nationalCode یکتا
async function user(nc, fn, ln, g) {
  const [u] = await q(`INSERT INTO users ("nationalCode","firstName","lastName","gender","passwordHash") VALUES ($1,$2,$3,$4,'x') RETURNING id`, [nc, fn, ln, g]);
  return u.id;
}

// ── مقطع و آیین‌نامه (پیش‌نیاز majors/students) ──
const [degree] = await q(`INSERT INTO degree_level_configs (title,code) VALUES ('کارشناسی','SCT-BSC') RETURNING id`);
const [regulation] = await q(`INSERT INTO educational_regulations (title,"degreeLevelId","effectiveFromYear","rulesConfig") VALUES ('آیین‌نامه تست برنامه‌ریزی',$1,1400,'{}') RETURNING id`, [degree.id]);

// ── ترم‌ها ──
const [term] = await q(`INSERT INTO academic_terms ("termCode",title,"termType") VALUES ($1,$2,'NORMAL') RETURNING id`, [TERM, 'ترم تست برنامه‌ریزی ۱۴۰۵']);
const [legacy] = await q(`INSERT INTO academic_terms ("termCode",title,"termType") VALUES ($1,$2,'NORMAL') RETURNING id`, [LEGACY, 'ترم گذشته (برای نمرات پاس‌شده)']);

// ── دانشکده‌ها ──
const [fHum] = await q(`INSERT INTO faculties (name,"facultyCode") VALUES ('دانشکده علوم انسانی','SCT-HUM') RETURNING id`);
const [fEng] = await q(`INSERT INTO faculties (name,"facultyCode") VALUES ('دانشکده فنی مهندسی','SCT-ENG') RETURNING id`);

// ── گروه‌های آموزشی ──
const deptCodes = ['SCT-MAAREF', 'SCT-PAYEH', 'SCT-PSY', 'SCT-ACC', 'SCT-CS', 'SCT-SPORT'];
const deptNames = ['گروه معارف', 'گروه علوم پایه', 'گروه روانشناسی', 'گروه حسابداری', 'گروه کامپیوتر', 'گروه تربیت بدنی'];
const deptIds = {};
for (let i = 0; i < deptCodes.length; i++) {
  const fac = i < 2 ? (i === 0 ? fHum.id : fEng.id) : (deptCodes[i] === 'SCT-CS' ? fEng.id : fHum.id);
  const [d] = await q(`INSERT INTO departments (name,"facultyId","departmentCode") VALUES ($1,$2,$3) RETURNING id`, [deptNames[i], fac, deptCodes[i]]);
  deptIds[deptCodes[i]] = d.id;
}

// ── رشته‌ها ──
const majorDefs = [
  ['SCT-PSY', 'روانشناسی', 'SCT-PSY'], ['SCT-ACC', 'حسابداری', 'SCT-ACC'], ['SCT-CS', 'کامپیوتر', 'SCT-CS'],
];
const majorIds = {};
for (const [code, name, dept] of majorDefs) {
  const [m] = await q(`INSERT INTO majors (name,"majorCode","departmentId","facultyId","degreeLevelId") VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [name, code, deptIds[dept], deptIds[dept] === deptIds['SCT-CS'] ? fEng.id : fHum.id, degree.id]);
  majorIds[code] = m.id;
}

// ── دروس ──
const [cluster] = await q(`INSERT INTO equivalence_clusters ("clusterTitle","isGeneralService") VALUES ('SCT-خوشه ریاضی ۱',0) RETURNING id`);
const [math1] = await q(`INSERT INTO courses (code,title,units,"courseType","departmentId","offeringScope","clusterId") VALUES ('SCT-MATH1','ریاضی عمومی ۱',3,'عمومی',$1,'GENERAL_SERVICE',$2) RETURNING id`, [deptIds['SCT-PAYEH'], cluster.id]);
const [math2] = await q(`INSERT INTO courses (code,title,units,"courseType","departmentId","offeringScope","clusterId") VALUES ('SCT-MATHB','ریاضیات پایه',3,'عمومی',$1,'DEPARTMENTAL',$2) RETURNING id`, [deptIds['SCT-PAYEH'], cluster.id]);
const [andishe] = await q(`INSERT INTO courses (code,title,units,"courseType","departmentId","offeringScope") VALUES ('SCT-AND','اندیشه اسلامی ۱',2,'عمومی',$1,'GENERAL_SERVICE') RETURNING id`, [deptIds['SCT-MAAREF']]);
const [varzesh] = await q(`INSERT INTO courses (code,title,units,"courseType","departmentId","offeringScope","locationType") VALUES ('SCT-PE','تربیت بدنی ۱',1,'عمومی',$1,'GENERAL_SERVICE','OUT_CAMPUS') RETURNING id`, [deptIds['SCT-SPORT']]);
const [psyc] = await q(`INSERT INTO courses (code,title,units,"courseType","departmentId") VALUES ('SCT-PSYC','مبانی روانشناسی',2,'تخصصی',$1) RETURNING id`, [deptIds['SCT-PSY']]);
const [acc] = await q(`INSERT INTO courses (code,title,units,"courseType","departmentId") VALUES ('SCT-ACCC','اصول حسابداری',3,'تخصصی',$1) RETURNING id`, [deptIds['SCT-ACC']]);

// ── اساتید (ساعات حضور + قلمرو گروه) ──
async function staffMember(nc, code, dept, gender, servicePool) {
  const uidV = await user(nc, 'استاد', code, gender);
  const [s] = await q(`INSERT INTO staff ("userId","staffCode","departmentId","title","isActive","canManageServicePool") VALUES ($1,$2,$3,$4,1,$5) RETURNING id`,
    [uidV, code, dept, gender === 'MALE' ? 'آقای' : 'سرکار خانم', servicePool ? 1 : 0]);
  return s.id;
}
const profs = {
  and1: await staffMember(uid(1), 'SCT-PF01', deptIds['SCT-MAAREF'], 'MALE', 1),
  and2: await staffMember(uid(2), 'SCT-PF02', deptIds['SCT-MAAREF'], 'FEMALE', 1),
  math: await staffMember(uid(3), 'SCT-PF03', deptIds['SCT-PAYEH'], 'MALE', 1),
  psyProf: await staffMember(uid(4), 'SCT-PF04', deptIds['SCT-PSY'], 'FEMALE', 0),
  accProf: await staffMember(uid(5), 'SCT-PF05', deptIds['SCT-ACC'], 'MALE', 0),
  sportProf: await staffMember(uid(6), 'SCT-PF06', deptIds['SCT-SPORT'], 'MALE', 1),
  sportProf2: await staffMember(uid(7), 'SCT-PF07', deptIds['SCT-SPORT'], 'FEMALE', 1),
};
// ساعات حضور: عمومی (termId NULL) + یک بازهٔ ترجیحی اختصاصی ترم
for (const [pid, days] of [[profs.and1, [1, 2, 3]], [profs.and2, [2, 3]], [profs.math, [1, 2, 4]], [profs.psyProf, [2, 3]], [profs.accProf, [1, 3]], [profs.sportProf, [3]], [profs.sportProf2, [3]]]) {
  for (const d of days) {
    await c.query(`INSERT INTO professor_availabilities ("staffId","dayOfWeek","startTime","endTime") VALUES ($1,$2,'08:00','17:00')`, [pid, d]);
  }
}
// بازهٔ ترجیحی این ترم برای استاد معارف ۱: صبح‌های یکشنبه/دوشنبه
await c.query(`INSERT INTO professor_availabilities ("staffId","termId","dayOfWeek","startTime","endTime") VALUES ($1,$2,1,'08:00','12:00')`, [profs.and1, term.id]);
await c.query(`INSERT INTO professor_availabilities ("staffId","termId","dayOfWeek","startTime","endTime") VALUES ($1,$2,2,'08:00','12:00')`, [profs.and1, term.id]);

// ── دانشجویان (توزیع: ۴۰ روانشناسی، ۲۵ حسابداری، ۱۵ کامپیوتر) ──
const studentDefs = [
  ['SCT-STU-PSY', majorIds['SCT-PSY'], 40], ['SCT-STU-ACC', majorIds['SCT-ACC'], 25], ['SCT-STU-CS', majorIds['SCT-CS'], 15],
];
const byMajor = {}; // majorCode → [studentIds]
let nc = 100;
for (const [code, majorId, n] of studentDefs) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const u = await user(`SCT${String(nc).padStart(7, '0')}`, 'دانشجو', `${code}-${i}`, i % 2 ? 'FEMALE' : 'MALE');
    const [st] = await q(`INSERT INTO students ("userId","studentCode","majorId","degreeLevelId","regulationId","entryYear","status") VALUES ($1,$2,$3,$4,$5,1404,'ACTIVE') RETURNING id`,
      [u, `SCT-${String(nc).padStart(7, '0')}`, majorId, degree.id, regulation.id]);
    ids.push(st.id);
    nc++;
  }
  byMajor[code] = ids;
}
// ۱۰ دانشجوی روانشناسی خارج از بازهٔ چارت (entryYear 1395) — نباید در پیش‌بینی بیایند
for (let i = 0; i < 10; i++) {
  const u = await user(`SCT${String(nc).padStart(7, '0')}`, 'قدیمی', `OLD-${i}`, 'MALE');
  await q(`INSERT INTO students ("userId","studentCode","majorId","degreeLevelId","regulationId","entryYear","status") VALUES ($1,$2,$3,$4,$5,1395,'ACTIVE') RETURNING id`,
    [u, `SCT-${String(nc).padStart(7, '0')}`, majorIds['SCT-PSY'], degree.id, regulation.id]);
  nc++;
}

// ── چارت‌ها (syllabus) ──
async function syllabusOf(majorId, startYear, coursesArr) {
  const [sy] = await q(`INSERT INTO syllabuses ("majorId","entryYearStart","entryYearEnd") VALUES ($1,$2,1406) RETURNING id`, [majorId, startYear]);
  for (const cid of coursesArr) {
    await c.query(`INSERT INTO syllabus_courses ("syllabusId","courseId","semesterNo") VALUES ($1,$2,1)`, [sy.id, cid]);
  }
}
await syllabusOf(majorIds['SCT-PSY'], 1400, [andishe.id, varzesh.id, psyc.id]);       // روانشناسی: اندیشه + تربیت بدنی + تخصصی
await syllabusOf(majorIds['SCT-ACC'], 1400, [andishe.id, varzesh.id, acc.id]);        // حسابداری: اندیشه + تربیت بدنی + تخصصی
await syllabusOf(majorIds['SCT-CS'], 1400, [math1.id, math2.id, varzesh.id]);         // کامپیوتر: ریاضی (هر دو کد هم‌ارز) + تربیت بدنی

// ── نمرات پاس‌شده (ترم گذشته) برای آزمون پیش‌بینی ──
const legacyPassed = [
  [byMajor['SCT-STU-PSY'].slice(0, 10), andishe.id],  // ۱۰ روانشناسی پاس کرده‌اند
  [byMajor['SCT-STU-PSY'].slice(10, 15), varzesh.id], // ۵ روانشناسی تربیت بدنی پاس کرده‌اند
  [byMajor['SCT-STU-CS'].slice(0, 5), math2.id],      // ۵ کامپیوتر «ریاضیات پایه» (هم‌ارز) پاس کرده‌اند
];
for (const [stIds, courseId] of legacyPassed) {
  const [off] = await q(`INSERT INTO course_offerings ("termId","courseId","groupNumber","capacity") VALUES ($1,$2,1,50) RETURNING id`, [legacy.id, courseId]);
  for (const sid of stIds) {
    await c.query(`INSERT INTO enrollments ("studentId","offeringId","status","gradeValue","gradeStatus") VALUES ($1,$2,'REGISTERED',14,'FINALIZED')`, [sid.id ?? sid, off.id]);
  }
}

// ── کلاس‌های فیزیکی (زونینگ: متعلق به دانشکده) ──
async function room(name, cap, facId) {
  const [r] = await q(`INSERT INTO classrooms (name,capacity,"buildingName","facultyId") VALUES ($1,$2,'SCT-بلوک',$3) RETURNING id`, [name, cap, facId]);
  return r.id;
}
const rooms = {
  hum101: await room('SCT-کلاس 101', 60, fHum.id), // علوم انسانی
  hum102: await room('SCT-کلاس 102', 40, fHum.id),
  hum201: await room('SCT-کلاس 201', 40, fHum.id),
  engA: await room('SCT-آمفی A', 80, fEng.id),    // فنی
  engB: await room('SCT-کلاس B', 40, fEng.id),
};

const t1 = ((Date.now() - t0) / 1000).toFixed(2);
console.log(`✅ SEED برنامه‌ریزی در ${t1}s`);
console.log(`   ترم ${term.id} (${TERM}) · ۲ دانشکده · ۶ گروه · ۳ رشته · ${80} دانشجوی فعال در چارت + ۱۰ خارج از چارت · ۷ استاد · ۵ سالن`);
console.log(`   خوشهٔ هم‌ارز: ریاضی عمومی ۱ (#${math1.id}) + ریاضیات پایه (#${math2.id}) = خوشه ${cluster.id}`);
console.log(`   بارم پیش‌بینی: اندیشه → ${byMajor['SCT-STU-PSY'].length - 10} متقاضی روانشناسی + ${byMajor['SCT-STU-ACC'].length} حسابداری = ${byMajor['SCT-STU-PSY'].length - 10 + byMajor['SCT-STU-ACC'].length}`);
await c.end();
