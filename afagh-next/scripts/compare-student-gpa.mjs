#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════
 *  مقایسهٔ تک‌به‌تک دانشجویان: معدل ترم / معدل کل / گذرانده / مردودی
 *  موتور (کدهای جدید) در برابر سیستم قبلی (کدهای اصیل سما)
 *
 *  هر دانشگاه جدا (universityId) ساکن شده و کارنامه‌ها یکجا مقایسه می‌شوند.
 *  - سمت «قدیمی»: enrollments."originalSamaCode" (کد سمای اصیل)
 *  - سمت «موتور»: enrollments."samaGradeStatusCode"
 *  - هر دو سمت با همان groupTranscript و آیین‌نامهٔ خود دانشجو (regulationId)
 *
 *  خروجی‌ها (در پوشهٔ جاری):
 *   - gpa-compare-<UNI>.csv          خلاصهٔ هر دانشجو
 *   - gpa-compare-term-<UNI>.csv     جزئیات ترم‌به‌ترم هر دانشجو
 *   - gpa-compare-summary.json       آمار تجمیعی همهٔ دانشگاه‌ها
 *
 *  استفاده:
 *   node scripts/compare-student-gpa.mjs
 * ═══════════════════════════════════════════════════════════════════════
 */
import pg from 'pg';
import fs from 'fs';
import { groupTranscript } from '../src/app/admin/students/transcript-utils.js';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db',
  max: 10,
});

const UNIS = [
  { id: 1, name: 'AFAGH' },
  { id: 2, name: 'ZARINE' },
  { id: 3, name: 'ALLAME' },
  { id: 4, name: 'SHAMS' },
  { id: 5, name: 'NAZHAND' },
];

const round3 = (n) => (n == null ? null : Math.round(n * 1000) / 1000);
const fmt = (n) => (n == null || !Number.isFinite(n) ? '' : n.toFixed(3));
const close = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 0.0015);
const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

async function processUniversity(u) {
  const t0 = Date.now();
  console.log(`\n=== ${u.name} (uni ${u.id}) ===`);

  const regRows = (await pool.query(`SELECT id, title, "rulesConfig" FROM educational_regulations`)).rows;
  const regMap = new Map();
  for (const r of regRows) {
    let cfg = null;
    try { if (r.rulesConfig) cfg = JSON.parse(r.rulesConfig); } catch {}
    regMap.set(r.id, { title: r.title, cfg });
  }

  const courseRows = (await pool.query(
    `SELECT id, code, units, "courseType", "defaultAcceptMarkState", "defaultRejectMarkState", "minPassedMark", "gradingType"
     FROM courses WHERE "universityId"=$1`, [u.id])).rows;
  const courseMap = new Map(courseRows.map(c => [c.id, c]));
  console.log(`courses=${courseMap.size}`);

  const studentRows = (await pool.query(`
    SELECT DISTINCT s.id, s."studentCode", u."firstName", u."lastName", s."regulationId"
    FROM students s
    JOIN users u ON u.id = s."userId"
    JOIN enrollments e ON e."studentId" = s.id
    WHERE s."universityId" = $1`,[u.id])).rows;
  console.log(`students=${studentRows.length}`);

  const enRows = (await pool.query(`
    SELECT
      e.id AS "enrollmentId", e."studentId", co."courseId",
      t."termCode", t.title AS "termTitle", t."sortOrder" AS "termSortOrder",
      c.code AS "courseCode", c.title AS "courseTitle", c.units::text AS units, c."courseType",
      c."minPassedMark", c."gradingType",
      e."gradeValue"::text AS "gradeValue", e."gradeStatus",
      e."samaGradeStatusCode" AS "engineCode", e."originalSamaCode" AS "legacyCode"
    FROM enrollments e
    JOIN course_offerings co ON co.id = e."offeringId"
    JOIN courses c ON c.id = co."courseId"
    JOIN academic_terms t ON t.id = co."termId"
    WHERE c."universityId" = $1
    ORDER BY e."studentId"
  `,[u.id])).rows;
  console.log(`enrollments=${enRows.length}`);

  const studentEnMap = new Map();
  for (const row of enRows) {
    let list = studentEnMap.get(row.studentId);
    if (!list) { list = []; studentEnMap.set(row.studentId, list); }
    list.push(row);
  }

  const sumRows = [];      // per-student summary CSV
  const termRows = [];     // per student×term CSV
  const stats = {
    university: u.name, universityId: u.id,
    studentsTotal: 0,
    studentsGpaDiff: 0, studentsPassedDiff: 0, studentsFailedDiff: 0, studentsAnyDiff: 0,
    termsTotal: 0, termsGpaDiff: 0,
    byReg: new Map(),  // regTitle -> counters
  };

  for (const stu of studentRows) {
    const ens = studentEnMap.get(stu.id);
    if (!ens || ens.length === 0) continue;
    stats.studentsTotal++;

    const reg = regMap.get(stu.regulationId);
    const cfg = reg?.cfg || null;
    const regTitle = reg?.title || '(بدون آیین‌نامه)';
    const b = stats.byReg.get(regTitle) || { students: 0, gpaDiff: 0, passedDiff: 0, failedDiff: 0, anyDiff: 0 };
    b.students++;
    stats.byReg.set(regTitle, b);

    const rows = ens.map(e => ({
      id: e.enrollmentId,
      courseCode: e.courseCode, courseTitle: e.courseTitle,
      units: e.units, gradeValue: e.gradeValue ?? null, gradeStatus: e.gradeStatus,
      termCode: e.termCode, termTitle: e.termTitle, termSortOrder: e.termSortOrder,
      courseType: e.courseType,
    }));
    const legacyRows = rows.map((r, i) => ({ ...r, gradeStatusCode: ens[i].legacyCode ?? ens[i].engineCode }));
    const engineRows = rows.map((r, i) => ({ ...r, gradeStatusCode: ens[i].engineCode }));

    const sL = groupTranscript(legacyRows, cfg);
    const sE = groupTranscript(engineRows, cfg);

    const finishedCount = rows.filter(r => r.gradeStatus === 'FINALIZED' && r.gradeValue != null).length;

    // cumulative GPA: use last term cumGpa if present else summary.gpa
    const cumL = sL.gpa;
    const cumE = sE.gpa;
    const passedL = sL.totalPassed;
    const passedE = sE.totalPassed;
    const failedL = sL.totalTaken - sL.totalPassed;
    const failedE = sE.totalTaken - sE.totalPassed;

    const gpaDiff = !close(cumL, cumE);
    const passedDiff = passedL !== passedE;
    const failedDiff = failedL !== failedE;
    const anyDiff = gpaDiff || passedDiff || failedDiff;
    if (gpaDiff) { stats.studentsGpaDiff++; b.gpaDiff++; }
    if (passedDiff) { stats.studentsPassedDiff++; b.passedDiff++; }
    if (failedDiff) { stats.studentsFailedDiff++; b.failedDiff++; }
    if (anyDiff) { stats.studentsAnyDiff++; b.anyDiff++; }

    sumRows.push([
      u.id, u.name, stu.studentCode, `${stu.firstName} ${stu.lastName}`, regTitle,
      finishedCount,
      fmt(cumL), fmt(cumE), gpaDiff ? 'X' : '',
      passedL, passedE, passedDiff ? 'X' : '',
      failedL, failedE, failedDiff ? 'X' : '',
    ]);

    // per-term comparison
    const lTerm = new Map(sL.terms.map(t => [t.termCode, t]));
    const termCodes = [...new Set([...sL.terms, ...sE.terms].map(t => t.termCode))];
    for (const tc of termCodes) {
      const l = lTerm.get(tc);
      const e = sE.terms.find(t => t.termCode === tc);
      if (!l && !e) continue;
      stats.termsTotal++;
      const gpaEq = close(l?.gpa ?? null, e?.gpa ?? null);
      if (!gpaEq) stats.termsGpaDiff++;
      termRows.push([
        u.id, u.name, stu.studentCode, `${stu.firstName} ${stu.lastName}`, regTitle, tc,
        fmt(l?.gpa ?? null), fmt(e?.gpa ?? null), gpaEq ? '' : 'X',
        l?.passed ?? 0, e?.passed ?? 0,
        l?.failed ?? 0, e?.failed ?? 0,
        fmt(l?.cumGpa ?? null), fmt(e?.cumGpa ?? null),
        close(l?.cumGpa ?? null, e?.cumGpa ?? null) ? '' : 'X',
      ]);
    }
  }

  const sumHeader = ['universityId', 'university', 'studentCode', 'name', 'regulation', 'gradeCount',
    'cumGpa_legacy', 'cumGpa_engine', 'cumGpa_diff',
    'passed_legacy', 'passed_engine', 'passed_diff',
    'failed_legacy', 'failed_engine', 'failed_diff'];
  const termHeader = ['universityId', 'university', 'studentCode', 'name', 'regulation', 'termCode',
    'termGpa_legacy', 'termGpa_engine', 'termGpa_diff',
    'passed_legacy', 'passed_engine', 'failed_legacy', 'failed_engine',
    'cumGpa_legacy', 'cumGpa_engine', 'cumGpa_diff'];

  const writeCsv = (p, header, rows) => {
    fs.writeFileSync(p, '\ufeff' + [header.join(','), ...rows.map(r => r.map(esc).join(','))].join('\n'));
    console.log(`  ${rows.length} rows -> ${p}`);
  };
  writeCsv(`gpa-compare-${u.name}.csv`, sumHeader, sumRows);
  writeCsv(`gpa-compare-term-${u.name}.csv`, termHeader, termRows);

  console.log(`  students=${stats.studentsTotal} anyDiff=${stats.studentsAnyDiff} gpaDiff=${stats.studentsGpaDiff} passedDiff=${stats.studentsPassedDiff} failedDiff=${stats.studentsFailedDiff} termsGpaDiff=${stats.termsGpaDiff}/${stats.termsTotal} (${((Date.now()-t0)/1000).toFixed(1)}s)`);
  return stats;
}

async function main() {
  const report = {};
  for (const u of UNIS) {
    const st = await processUniversity(u);
    st.byReg = Object.fromEntries(st.byReg);
    report[u.name] = st;
  }
  fs.writeFileSync('gpa-compare-summary.json', JSON.stringify(report, null, 2));
  console.log('\n=== gpa-compare-summary.json written ===');
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });