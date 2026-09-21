#!/usr/bin/env node
/**
 * گزارش جامع انتقال (يک دستور، کل دانشگاه‌ها)
 *   — موجودی هر دانشگاه، تطبیق legacy↔enrollments، مغایرت معدل ترم، سلامت JOIN
 *
 * استفاده روی سرور (prod):
 *   docker exec -i afagh_pg psql -U afagh -d afagh_db -f /dev/stdin < scripts/transfer-report.sql
 *   یا با Node (از هاست):
 *   DATABASE_URL=postgres://afagh:PASS@localhost:5432/afagh_db node scripts/transfer-report.mjs
 *   داخل کانتینر اپ:
 *   docker exec afagh_app node scripts/transfer-report.mjs
 *   خروجی JSON:
 *   node scripts/transfer-report.mjs --json report.json
 *   خروجی CSV معدل‌ها:
 *   node scripts/transfer-report.mjs --csv gpa.csv
 */
import pg from 'pg';
import fs from 'fs';

const { Pool } = pg;
const args = {};
for (let i = 0; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--json' && process.argv[i+1]) args.json = process.argv[++i];
  if (a === '--csv' && process.argv[i+1]) args.csv = process.argv[++i];
  if (a === '--db' && process.argv[i+1]) args.db = process.argv[++i];
  if (a === '--threshold' && process.argv[i+1]) args.threshold = parseFloat(process.argv[++i]);
}
const THRESHOLD = Number.isFinite(args.threshold) ? args.threshold : 0.10;
const dbUrl = args.db || process.env.DATABASE_URL || process.env.DATABASE_URL_APP || 'postgres://afagh:afagh@localhost:5432/afagh_db';
const pool = new Pool({ connectionString: dbUrl, max: 5 });
const q = async (text, params) => (await pool.query(text, params)).rows;

const fmt = n => n == null ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
const pad = (s, n) => String(s ?? '').padEnd(n);

async function main() {
  console.log('═'.repeat(60));
  console.log(' گزارش جامع انتقال  —  ' + new Date().toLocaleString('fa-IR'));
  console.log(' DB:', dbUrl.replace(/:[^:@]+@/, ':***@'));
  console.log(' آستانه مغایرت معدل:', THRESHOLD);
  console.log('═'.repeat(60));

  // 1. موجودی هر دانشگاه
  console.log('\n[1] موجودی هر دانشگاه (students / enrollments / legacy matched)');
  const perUni = await q(`
    SELECT u.id, u.code, u.title, u.kind,
      (SELECT count(*)::int FROM students s WHERE s."universityId"=u.id) AS students,
      (SELECT count(*)::int FROM enrollments e JOIN students s2 ON s2.id=e."studentId" WHERE s2."universityId"=u.id) AS enrollments,
      (SELECT count(*)::int FROM legacy_grades lg JOIN students s3 ON s3."studentCode"=lg."studentCode" AND s3."universityId"=u.id) AS legacy_rows,
      (SELECT count(DISTINCT lg."studentCode")::int FROM legacy_grades lg JOIN students s4 ON s4."studentCode"=lg."studentCode" AND s4."universityId"=u.id) AS legacy_students
    FROM universities u ORDER BY u.id
  `);
  console.log(pad('code',10) + pad('title',18) + pad('students',10) + pad('enrollments',14) + pad('legacy_rows',12) + 'legacy_students');
  console.log('-'.repeat(80));
  let totalS=0, totalE=0, totalL=0, totalLS=0;
  for (const r of perUni) {
    console.log(pad(r.code,10) + pad(r.title,18) + pad(r.students,10) + pad(r.enrollments,14) + pad(r.legacy_rows,12) + r.legacy_students);
    totalS+=r.students; totalE+=r.enrollments; totalL+=r.legacy_rows; totalLS+=r.legacy_students;
  }
  console.log('-'.repeat(80));
  console.log(pad('جمع',28) + pad(totalS,10) + pad(totalE,14) + pad(totalL,12) + totalLS);

  // 2. جمع کل
  console.log('\n[2] جمع کل');
  const totStudents = (await q(`SELECT count(*)::int AS c FROM students`))[0].c;
  const totEnroll = (await q(`SELECT count(*)::int AS c FROM enrollments`))[0].c;
  const totLegacyRows = (await q(`SELECT count(*)::int AS c FROM legacy_grades`))[0].c;
  const totLegacyStus = (await q(`SELECT count(DISTINCT "studentCode")::int AS c FROM legacy_grades`))[0].c;
  const totEnrolledStus = (await q(`SELECT count(DISTINCT "studentId")::int AS c FROM enrollments`))[0].c;
  const totTerms = (await q(`SELECT count(*)::int AS c FROM academic_terms`))[0].c;
  const totOfferings = (await q(`SELECT count(*)::int AS c FROM course_offerings`))[0].c;
  console.log(` students=${fmt(totStudents)}  enrollments=${fmt(totEnroll)}  legacy_rows=${fmt(totLegacyRows)}  legacy_students=${fmt(totLegacyStus)}  enrolled_students=${fmt(totEnrolledStus)}  terms=${fmt(totTerms)}  offerings=${fmt(totOfferings)}`);

  // 3. دانشجویان با legacy ولی بدون enrollment
  console.log('\n[3] دانشجویان دارای legacy ولی بدون هیچ enrollment (منتقل‌نشده — باید 0 باشد)');
  const notMigrated = await q(`
    SELECT s."studentCode", s."universityId", u.code AS uni_code, s.id
    FROM students s 
    JOIN universities u ON u.id=s."universityId"
    WHERE EXISTS (SELECT 1 FROM legacy_grades lg WHERE lg."sourceCode"=u.code AND lg."studentCode"=s."studentCode")
      AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e."studentId"=s.id)
    LIMIT 20
  `);
  const notMigratedTotal = (await q(`
    SELECT count(*)::int AS c FROM students s
    JOIN universities u ON u.id=s."universityId"
    WHERE EXISTS (SELECT 1 FROM legacy_grades lg WHERE lg."sourceCode"=u.code AND lg."studentCode"=s."studentCode")
      AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e."studentId"=s.id)
  `))[0].c;
  console.log(` تعداد: ${fmt(notMigratedTotal)}`);
  if (notMigrated.length) {
    console.log(pad('studentCode',14) + pad('uni',8) + 'lg_cnt');
    for (const r of notMigrated) console.log(pad(r.studentCode,14) + pad(r.uni_code,8) + r.lg_cnt);
  } else {
    console.log(' ✓ همه منتقل شده‌اند');
  }

  // 4. legacy بی‌صاحب
  console.log('\n[4] ردیف‌های legacy که هیچ students هم‌کد ندارد (کد دانشجویی ناشناس)');
  const orphans = await q(`
    SELECT lg."studentCode", lg."sourceCode", count(*)::int AS cnt
    FROM legacy_grades lg
    JOIN universities u ON u.code = lg."sourceCode"
    LEFT JOIN students s ON s."universityId" = u.id AND s."studentCode" = lg."studentCode"
    WHERE s.id IS NULL GROUP BY lg."studentCode", lg."sourceCode" ORDER BY cnt DESC LIMIT 20
  `);
  const orphanRows = (await q(`
    SELECT count(*)::int AS c
    FROM legacy_grades lg
    JOIN universities u ON u.code = lg."sourceCode"
    LEFT JOIN students s ON s."universityId" = u.id AND s."studentCode" = lg."studentCode"
    WHERE s.id IS NULL
  `))[0].c;
  console.log(` تعداد ردیف بی‌صاحب: ${fmt(orphanRows)} / ${fmt(totLegacyRows)}  —  تعداد کد بی‌صاحب: ${fmt(orphans.length)} (نمونه 20)`);
  if (orphans.length) {
    console.log(pad('studentCode',14) + 'cnt');
    for (const r of orphans) console.log(pad(r.studentCode,14) + r.cnt);
  } else {
    console.log(' ✓ همه legacyها صاحب دارند');
  }

  // 5. مغایرت معدل ترم
  console.log(`\n[5] مغایرت معدل ترم (محاسبه از enrollments vs student_term_states.termAvg) — diff>${THRESHOLD}`);
  let gpaDiffs = [];
  try {
    gpaDiffs = await q(`
      SELECT s."studentCode", u.code AS uni_code, sts."termCode", sts."termAvg"::text AS stored_avg,
        ROUND((SUM(e."gradeValue"::numeric * c.units::numeric) / NULLIF(SUM(c.units::numeric),0))::numeric,2)::text AS computed_avg,
        ROUND(ABS(sts."termAvg"::numeric - SUM(e."gradeValue"::numeric * c.units::numeric)/NULLIF(SUM(c.units::numeric),0))::numeric,2)::text AS diff
      FROM student_term_states sts
      JOIN students s ON s.id=sts."studentId"
      JOIN universities u ON u.id=s."universityId"
      JOIN enrollments e ON e."studentId"=s.id
      JOIN course_offerings co ON co.id=e."offeringId"
      JOIN courses c ON c.id=co."courseId"
      JOIN academic_terms at ON at.id=co."termId" AND at."termCode"=sts."termCode"
      WHERE sts."termAvg" IS NOT NULL
        AND e."gradeValue" IS NOT NULL AND e."gradeStatus"='FINALIZED'
      GROUP BY s."studentCode", u.code, sts."termCode", sts."termAvg"
      HAVING ABS(sts."termAvg"::numeric - SUM(e."gradeValue"::numeric * c.units::numeric)/NULLIF(SUM(c.units::numeric),0)) > $1
      ORDER BY ABS(sts."termAvg"::numeric - SUM(e."gradeValue"::numeric * c.units::numeric)/NULLIF(SUM(c.units::numeric),0)) DESC
      LIMIT 50
    `, [THRESHOLD]);
  } catch (e) {
    console.log('  ⚠ خطا در کوئری معدل (احتمالاً بعضی ستون‌ها null):', e.message);
  }
  console.log(` تعداد ترم مغایر: ${fmt(gpaDiffs.length)} (سقف 50)`);
  if (gpaDiffs.length) {
    console.log(pad('studentCode',14) + pad('uni',8) + pad('term',8) + pad('stored',8) + pad('computed',10) + 'diff');
    console.log('-'.repeat(60));
    for (const r of gpaDiffs) {
      console.log(pad(r.studentCode,14) + pad(r.uni_code,8) + pad(r.termCode,8) + pad(r.stored_avg,8) + pad(r.computed_avg,10) + r.diff);
    }
  } else {
    console.log(' ✓ مغایرتی بالای آستانه یافت نشد');
  }

  // 6. ترم‌های بدون معدل ذخیره
  console.log('\n[6] وضعیت termAvg در student_term_states');
  const avgStats = await q(`SELECT count(*)::int AS total, count(*) FILTER (WHERE "termAvg" IS NULL)::int AS null_cnt, count(*) FILTER (WHERE "termAvg" IS NOT NULL)::int AS has_cnt FROM student_term_states`);
  console.log(` total=${fmt(avgStats[0].total)}  has_avg=${fmt(avgStats[0].has_cnt)}  null_avg=${fmt(avgStats[0].null_cnt)}`);
  const nullByTerm = await q(`SELECT "termCode", count(*)::int AS cnt FROM student_term_states WHERE "termAvg" IS NULL GROUP BY "termCode" ORDER BY "termCode" LIMIT 15`);
  if (nullByTerm.length) {
    console.log(' null by termCode:');
    for (const r of nullByTerm) console.log(`   ${r.termCode}: ${fmt(r.cnt)}`);
  }

  // 7. سلامت JOIN
  console.log('\n[7] سلامت JOIN (باید همه 0 باشند)');
  const brokenOffering = (await q(`SELECT count(*)::int AS c FROM enrollments e LEFT JOIN course_offerings co ON co.id=e."offeringId" WHERE co.id IS NULL`))[0].c;
  const brokenCourse = (await q(`SELECT count(*)::int AS c FROM enrollments e JOIN course_offerings co ON co.id=e."offeringId" LEFT JOIN courses c ON c.id=co."courseId" WHERE c.id IS NULL`))[0].c;
  const brokenTerm = (await q(`SELECT count(*)::int AS c FROM enrollments e JOIN course_offerings co ON co.id=e."offeringId" LEFT JOIN academic_terms t ON t.id=co."termId" WHERE t.id IS NULL`))[0].c;
  const brokenStudent = (await q(`SELECT count(*)::int AS c FROM enrollments e LEFT JOIN students s ON s.id=e."studentId" WHERE s.id IS NULL`))[0].c;
  console.log(` broken_offering=${fmt(brokenOffering)}  broken_course=${fmt(brokenCourse)}  broken_term=${fmt(brokenTerm)}  broken_student=${fmt(brokenStudent)}`);
  if (brokenOffering+brokenCourse+brokenTerm+brokenStudent === 0) console.log(' ✓ JOINها سالم');
  else console.log(' ✗ شکستگی وجود دارد — نیاز به backfill/repair');

  // جمع‌بندی
  console.log('\n' + '═'.repeat(60));
  console.log(' جمع‌بندی:');
  const issues = [];
  if (notMigratedTotal > 0) issues.push(`${notMigratedTotal} دانشجو با legacy بدون enrollment`);
  if (orphanRows > 0) issues.push(`${orphanRows} ردیف legacy بی‌صاحب`);
  if (gpaDiffs.length > 0) issues.push(`${gpaDiffs.length} ترم با مغایرت معدل >${THRESHOLD}`);
  if (brokenOffering+brokenCourse+brokenTerm+brokenStudent > 0) issues.push(`شکستگی JOIN`);
  if (issues.length === 0) console.log(' ✓ انتقال کامل و سالم — کارنامه همهٔ دانشجویان قابل نمایش است.');
  else {
    console.log(' ⚠ موارد نیازمند بررسی:');
    for (const it of issues) console.log('   - ' + it);
  }
  console.log('═'.repeat(60));

  // خروجی فایل‌ها
  if (args.json) {
    const out = { perUni, totals: { totStudents, totEnroll, totLegacyRows, totLegacyStus, totEnrolledStus }, notMigratedTotal, orphanRows, gpaDiffs, avgStats, broken: { brokenOffering, brokenCourse, brokenTerm, brokenStudent } };
    fs.writeFileSync(args.json, JSON.stringify(out, null, 2), 'utf8');
    console.log(`\n JSON → ${args.json}`);
  }
  if (args.csv) {
    const header = 'studentCode,uni,termCode,stored_avg,computed_avg,diff\n';
    const lines = gpaDiffs.map(r => `${r.studentCode},${r.uni_code},${r.termCode},${r.stored_avg},${r.computed_avg},${r.diff}`).join('\n');
    fs.writeFileSync(args.csv, header + lines, 'utf8');
    console.log(` CSV → ${args.csv} (${gpaDiffs.length} سطر)`);
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
