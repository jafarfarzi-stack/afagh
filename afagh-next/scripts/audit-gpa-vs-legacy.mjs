#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════
 *  ممیزی معدل: محاسبات موتور در برابر معدل‌های رسمی قدیم (سما)
 *
 *  - سمت «موتور»: groupTranscript روی enrollments با کد engine + آیین‌نامه دانشجو
 *  - سمت «قدیم»: student_term_states.termAvg (معدل ترم سما) + students.totalAverage (معدل کل سما)
 *
 *  خروجی‌ها (در OUT_DIR یا پوشهٔ جاری):
 *   - audit-gpa-<UNI>.csv        هر دانشجو: معدل کل موتور/قدیم + باند اختلاف
 *   - audit-gpa-term-<UNI>.csv   هر دانشجو×ترم: معدل ترم موتور/قدیم + باند اختلاف
 *   - audit-gpa-summary.json     آمار تجمیعی
 *
 *  باند اختلاف (|new-old|): match ≤0.005، rounding ≤0.05، mismatch ≤0.5، big در غیر این صورت
 *
 *  استفاده (داخل کانتینر migrator):
 *   OUT_DIR=/out DATABASE_URL=... npx tsx scripts/audit-gpa-vs-legacy.mjs [UNI...]
 * ═══════════════════════════════════════════════════════════════════════
 */
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { groupTranscript } from '../src/app/admin/students/transcript-utils.js';

const { Pool } = pg;
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db',
  max: 10,
});
const OUT = process.env.OUT_DIR || '.';

const UNIS = [
  { id: 1, name: 'AFAGH' },
  { id: 2, name: 'ZARINE' },
  { id: 3, name: 'ALLAME' },
  { id: 4, name: 'SHAMS' },
  { id: 5, name: 'NAZHAND' },
];

const numOrNull = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const bandOf = (a, b) => {
  if (a == null || b == null) return 'na';
  const d = Math.abs(a - b);
  if (d <= 0.005) return 'match';
  if (d <= 0.05) return 'rounding';
  if (d <= 0.5) return 'mismatch';
  return 'big';
};
const fmt = (n) => (n == null || !Number.isFinite(n) ? '' : n.toFixed(3));
const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

async function processUniversity(u) {
  const t0 = Date.now();
  console.log(`\n=== ${u.name} (uni ${u.id}) ===`);

  const regRows = (
    await pool.query(`SELECT id, title, "rulesConfig" FROM educational_regulations`)
  ).rows;
  const regMap = new Map();
  for (const r of regRows) {
    let cfg = null;
    try {
      if (r.rulesConfig) cfg = JSON.parse(r.rulesConfig);
    } catch {}
    regMap.set(r.id, { title: r.title, cfg });
  }

  const studentRows = (
    await pool.query(
      `SELECT DISTINCT s.id, s."studentCode", us."firstName", us."lastName",
              s."regulationId", s."totalAverage"
       FROM students s
       JOIN users us ON us.id = s."userId"
       JOIN enrollments e ON e."studentId" = s.id
       WHERE s."universityId" = $1`,
      [u.id],
    )
  ).rows;
  console.log(`students=${studentRows.length}`);

  const enRows = (
    await pool.query(
      `SELECT e.id AS "enrollmentId", e."studentId", co."courseId", co."termId",
         t."termCode", t.title AS "termTitle",
         c.code AS "courseCode", c.title AS "courseTitle", c.units::text AS units, c."courseType",
         e."gradeValue"::text AS "gradeValue", e."gradeStatus",
         e."samaGradeStatusCode" AS "engineCode"
       FROM enrollments e
       JOIN course_offerings co ON co.id = e."offeringId"
       JOIN courses c ON c.id = co."courseId"
       JOIN academic_terms t ON t.id = co."termId"
       WHERE c."universityId" = $1
       ORDER BY e."studentId"`,
      [u.id],
    )
  ).rows;
  console.log(`enrollments=${enRows.length}`);

  const stateRows = (
    await pool.query(
      `SELECT "studentId", "termId", "termCode", "termAvg"::text AS "termAvg"
       FROM student_term_states WHERE "universityId" = $1`,
      [u.id],
    )
  ).rows;
  console.log(`term_states=${stateRows.length}`);
  // معدل قدیم هر ترم: اول با termId، وگرنه با termCode
  const legacyByStudentTerm = new Map(); // studentId -> Map(termId -> avg)
  const legacyByStudentCode = new Map(); // studentId -> Map(termCode -> avg)
  for (const s of stateRows) {
    const a = numOrNull(s.termAvg);
    if (a == null) continue;
    if (s.termId != null) {
      let m = legacyByStudentTerm.get(s.studentId);
      if (!m) { m = new Map(); legacyByStudentTerm.set(s.studentId, m); }
      if (!m.has(s.termId)) m.set(s.termId, a);
    }
    if (s.termCode) {
      let m = legacyByStudentCode.get(s.studentId);
      if (!m) { m = new Map(); legacyByStudentCode.set(s.studentId, m); }
      if (!m.has(s.termCode)) m.set(s.termCode, a);
    }
  }

  const studentEnMap = new Map();
  for (const row of enRows) {
    let list = studentEnMap.get(row.studentId);
    if (!list) { list = []; studentEnMap.set(row.studentId, list); }
    list.push(row);
  }

  const sumRows = [];
  const termRows = [];
  const stats = {
    university: u.name, universityId: u.id,
    studentsTotal: 0, studentsNoLegacyTotal: 0,
    totalBands: { match: 0, rounding: 0, mismatch: 0, big: 0, na: 0 },
    totalBiasSum: 0, totalBiasN: 0,
    termsTotal: 0, termsNoLegacy: 0,
    termBands: { match: 0, rounding: 0, mismatch: 0, big: 0, na: 0 },
    termBiasSum: 0, termBiasN: 0,
    worstTerms: [],
  };

  for (const stu of studentRows) {
    const ens = studentEnMap.get(stu.id);
    if (!ens || ens.length === 0) continue;
    stats.studentsTotal++;

    const reg = regMap.get(stu.regulationId);
    const cfg = reg?.cfg || null;
    const regTitle = reg?.title || '(بدون آیین‌نامه)';

    const rows = ens.map((e) => ({
      termCode: e.termCode, termTitle: e.termTitle,
      courseCode: e.courseCode, courseTitle: e.courseTitle,
      units: e.units, courseType: e.courseType,
      gradeValue: e.gradeValue ?? null, gradeStatus: e.gradeStatus,
      gradeStatusCode: e.engineCode,
    }));
    const sum = groupTranscript(rows, cfg);
    const newTotal = sum.gpa;
    const oldTotal = numOrNull(stu.totalAverage);
    const tb = oldTotal == null ? 'na' : bandOf(newTotal, oldTotal);
    if (oldTotal == null) stats.studentsNoLegacyTotal++;
    else {
      stats.totalBands[tb]++;
      stats.totalBiasSum += newTotal - oldTotal;
      stats.totalBiasN++;
    }
    sumRows.push([
      u.id, u.name, stu.studentCode, `${stu.firstName} ${stu.lastName}`, regTitle,
      ens.length, fmt(newTotal), fmt(oldTotal), tb,
      newTotal != null && oldTotal != null ? (newTotal - oldTotal).toFixed(3) : '',
    ]);

    const legT = legacyByStudentTerm.get(stu.id);
    const legC = legacyByStudentCode.get(stu.id);
    for (const t of sum.terms) {
      const termId = ens.find((e) => e.termCode === t.termCode)?.termId;
      const oldT = (termId != null && legT?.get(termId) != null)
        ? legT.get(termId)
        : legC?.get(t.termCode) ?? null;
      stats.termsTotal++;
      if (oldT == null) { stats.termsNoLegacy++; }
      const b = oldT == null ? 'na' : bandOf(t.gpa, oldT);
      if (oldT != null) {
        stats.termBands[b]++;
        stats.termBiasSum += t.gpa - oldT;
        stats.termBiasN++;
        if (b === 'big' && stats.worstTerms.length < 300) {
          stats.worstTerms.push({
            studentCode: stu.studentCode, termCode: t.termCode,
            newGpa: t.gpa, oldGpa: oldT, diff: +(t.gpa - oldT).toFixed(3),
          });
        }
      }
      termRows.push([
        u.id, u.name, stu.studentCode, t.termCode, regTitle,
        t.taken, t.passed, t.failed, fmt(t.gpa), fmt(oldT), b,
        oldT != null && t.gpa != null ? (t.gpa - oldT).toFixed(3) : '',
      ]);
    }
  }

  const sumHeader = ['universityId', 'university', 'studentCode', 'name', 'regulation',
    'enrollCount', 'total_new', 'total_old', 'band', 'diff'];
  const termHeader = ['universityId', 'university', 'studentCode', 'termCode', 'regulation',
    'taken', 'passed', 'failed', 'term_new', 'term_old', 'band', 'diff'];
  const writeCsv = (p, header, rows) => {
    fs.writeFileSync(path.join(OUT, p), '﻿' + [header.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n'));
    console.log(`  ${rows.length} rows -> ${p}`);
  };
  writeCsv(`audit-gpa-${u.name}.csv`, sumHeader, sumRows);
  writeCsv(`audit-gpa-term-${u.name}.csv`, termHeader, termRows);

  const done = {
    ...stats,
    totalBias: stats.totalBiasN ? +(stats.totalBiasSum / stats.totalBiasN).toFixed(4) : null,
    termBias: stats.termBiasN ? +(stats.termBiasSum / stats.termBiasN).toFixed(4) : null,
    secs: +((Date.now() - t0) / 1000).toFixed(1),
  };
  delete done.totalBiasSum; delete done.totalBiasN;
  delete done.termBiasSum; delete done.termBiasN;
  console.log(`  students=${stats.studentsTotal} noLegacyTotal=${stats.studentsNoLegacyTotal} bands=${JSON.stringify(stats.totalBands)}`);
  console.log(`  terms=${stats.termsTotal} noLegacy=${stats.termsNoLegacy} bands=${JSON.stringify(stats.termBands)}`);
  return done;
}

async function main() {
  const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()));
  const report = {};
  for (const u of UNIS) {
    if (only.size && !only.has(u.name)) continue;
    report[u.name] = await processUniversity(u);
  }
  fs.writeFileSync(path.join(OUT, 'audit-gpa-summary.json'), JSON.stringify(report, null, 2));
  console.log('\n=== audit-gpa-summary.json written ===');
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
