import pg from 'pg';
import fs from 'fs';
import { groupTranscript } from '../src/app/admin/students/transcript-utils.js';
import { termChronologicalValue } from '../src/lib/term-chronology.js';

const { Pool } = pg;
const pool = new Pool({ 
  connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db',
  max: 10,
});

function getRegulationFailExcludeCode(studentRegTitle, regCfg) {
  const regFailedCode = regCfg?.grading_and_gpa?.failed_sama_status_code;
  if (regFailedCode && String(regFailedCode).trim()) {
    return String(regFailedCode).trim();
  }

  const regPolicy = regCfg?.grading_and_gpa?.failed_course_gpa_policy;
  if (regPolicy === 'EXCLUDE_IF_PASSED_1391') return '-91';
  // کد ۹۴۱ مخصوص مقطع ارشد/آیین‌نامه ۱۳۹۴ است — قبل از سیاست عمومی بررسی می‌شود
  if (studentRegTitle?.includes('۹۴') || studentRegTitle?.includes('94')) return '941';
  if (studentRegTitle?.includes('۹۵') || studentRegTitle?.includes('95')) return '951';
  if (regPolicy === 'EXCLUDE_IF_PASSED') return '931';
  return null;
}

// کدهای دانشجویی/اداری خاص که موتور نباید بازنویسی کند (معادل‌سازی، معرفی به استاد،
// پیش‌دانشگاهی، خودخوان، حذف‌ها، غیبت موجه، پزشکی و ...). فقط کدهای عمومی و آیین‌نامه‌ای
// و کدهای نوع درس (جبرانی/پیش‌نیاز) قابل بازمحاسبه‌اند:
// MUTABLE = null,1,2,5,11,12,22,23,24,931,-91,941,951
const PRESERVE_ALWAYS = new Set([
  '3','4','6','7','14','16','17','18','32','40','44','50','51','53',
  '52','300','400','-1','-5','-4','-3','0','8','9','10','13','15','19','20','28','29','36','46',
]);
const ADMIN_STATUS_CODES = PRESERVE_ALWAYS;

async function processUniversity(universityId, uniName, isDryRun) {
  console.log(`\n======================================================`);
  console.log(`Processing University ${universityId}: ${uniName} (DRY: ${isDryRun})`);
  console.log(`======================================================`);

  // 1. Load regulations — آیین‌نامه‌ها بین دانشگاه‌ها مشترک‌اند (students.regulationId
  // به regs دانشگاه دیگر اشاره می‌کند)، پس همه را لود می‌کنیم نه فقط همین دانشگاه.
  const regRows = (await pool.query(`SELECT id, title, "rulesConfig" FROM educational_regulations`)).rows;
  const regMap = new Map();
  for (const r of regRows) {
    let cfg = null;
    try { if (r.rulesConfig) cfg = JSON.parse(r.rulesConfig); } catch {}
    regMap.set(r.id, { title: r.title, cfg });
  }

  // 2. Load courses
  const courseRows = (await pool.query(`
    SELECT id, code, units, "courseType", "defaultAcceptMarkState", "defaultRejectMarkState", "minPassedMark", "gradingType"
    FROM courses
    WHERE "universityId" = $1
  `, [universityId])).rows;
  const courseMap = new Map();
  for (const c of courseRows) {
    courseMap.set(c.id, c);
  }

  // 3. Load students who have enrollments
  const studentRows = (await pool.query(`
    SELECT DISTINCT s.id, s."studentCode", u."firstName", u."lastName", s."regulationId"
    FROM students s
    JOIN users u ON u.id = s."userId"
    JOIN enrollments e ON e."studentId" = s.id
    WHERE s."universityId" = $1
  `, [universityId])).rows;

  console.log(`Found ${studentRows.length} students with enrollments.`);

  // 4. Load all enrollments with offering and term info
  console.log(`Loading enrollments...`);
  const enRows = (await pool.query(`
    SELECT 
      e.id as "enrollmentId",
      e."studentId",
      e."offeringId",
      co."courseId",
      t."termCode",
      t.title as "termTitle",
      t."sortOrder" as "termSortOrder",
      c.code as "courseCode",
      c.title as "courseTitle",
      c.units::text as units,
      c."courseType",
      c."defaultAcceptMarkState",
      c."defaultRejectMarkState",
      c."minPassedMark",
      c."gradingType",
      e."gradeValue"::text as "gradeValue",
      e."gradeStatus",
      e."samaGradeStatusCode" as "gradeStatusCode",
      co."offeringType"
    FROM enrollments e
    JOIN course_offerings co ON co.id = e."offeringId"
    JOIN courses c ON c.id = co."courseId"
    JOIN academic_terms t ON t.id = co."termId"
    WHERE c."universityId" = $1
    ORDER BY e."studentId", t."sortOrder", t."termCode", c.code
  `, [universityId])).rows;

  console.log(`Loaded ${enRows.length} enrollments.`);

  // Group by student
  const studentEnMap = new Map();
  for (const row of enRows) {
    let list = studentEnMap.get(row.studentId);
    if (!list) {
      list = [];
      studentEnMap.set(row.studentId, list);
    }
    list.push(row);
  }

  // Statistics trackers
  const stats = {
    totalStudents: studentRows.length,
    totalEnrollments: enRows.length,
    enrollmentCodeChanges: new Map(), // "old -> new" => count
    termGpaChangedCount: 0,
    probationBecameTrueCount: 0,
    probationBecameFalseCount: 0,
    cumGpaChangedCount: 0,
    passedUnitsChangedCount: 0,
    affectedStudents: 0,
    changeSamples: [],
  };

  const updatesToApply = []; // { id, newCode }

  for (const stu of studentRows) {
    const ens = studentEnMap.get(stu.id);
    if (!ens || ens.length === 0) continue;

    const reg = regMap.get(stu.regulationId);
    const regCfg = reg?.cfg || null;
    const regTitle = reg?.title || null;
    const targetExcludeCode = getRegulationFailExcludeCode(regTitle, regCfg);

    // Compute BEFORE summary
    const summaryBefore = groupTranscript(ens, regCfg);

    // Run Engine on enrollments
    // Step A: Determine pass/fail for each course taking
    // Group enrollments of this student by courseId
    const courseTakeMap = new Map();
    for (const e of ens) {
      let list = courseTakeMap.get(e.courseId);
      if (!list) {
        list = [];
        courseTakeMap.set(e.courseId, list);
      }
      list.push(e);
    }

    let studentHasChange = false;
    const updatedEns = [];

    for (const [courseId, takes] of courseTakeMap.entries()) {
      // Sort takes chronologically
      takes.sort((a, b) => {
        const ca = termChronologicalValue(a.termCode, a.termSortOrder);
        const cb = termChronologicalValue(b.termCode, b.termSortOrder);
        return ca - cb;
      });

      const course = courseMap.get(courseId);
      const courseMin = course?.minPassedMark ? Number(course.minPassedMark) : NaN;
      const regPass = regCfg?.grading_and_gpa?.default_passing_grade ? Number(regCfg.grading_and_gpa.default_passing_grade) : NaN;
      const passMark = Number.isFinite(courseMin) && courseMin > 0 ? courseMin : (Number.isFinite(regPass) && regPass > 0 ? regPass : 10);

      // Check which takes are passes
      const isPassList = takes.map(t => {
        if (t.gradeStatus === 'EXEMPT' || t.gradeStatus === 'PASSED_NO_GRADE') return true;
        if (t.gradeStatus !== 'FINALIZED' || t.gradeValue == null) return false;
        const g = Number(t.gradeValue);
        if (!Number.isFinite(g)) return false;
        return course?.gradingType === 'DESCRIPTIVE' ? g === 1 : g >= passMark;
      });

      for (let i = 0; i < takes.length; i++) {
        const cur = takes[i];
        const oldCode = cur.gradeStatusCode?.trim() || null;
        let newCode = oldCode;

        // حفظ کدهای خاص دانشجویی/اداری — حتی اگر FINALIZED باشند (معادل‌سازی EXEMPT/FINALIZED،
        // معرفی به استاد ۴۰، پیش‌دانشگاهی ۴۴ و ...)
        if (oldCode && PRESERVE_ALWAYS.has(oldCode)) {
          updatedEns.push({ ...cur, gradeStatusCode: newCode });
          continue;
        }

        if (cur.gradeStatus === 'FINALIZED' && cur.gradeValue != null) {
          const numGrade = Number(cur.gradeValue);
          if (Number.isFinite(numGrade)) {
            const isPassed = isPassList[i];

            if (isPassed) {
              // Passing grade
              if (cur.defaultAcceptMarkState && cur.defaultAcceptMarkState !== '1') {
                newCode = cur.defaultAcceptMarkState;
              } else {
                newCode = cur.defaultAcceptMarkState || '1';
              }
            } else {
              // Failing grade
              if (oldCode && ADMIN_STATUS_CODES.has(oldCode)) {
                newCode = oldCode; // Do not touch administrative codes
              } else if (cur.defaultRejectMarkState && cur.defaultRejectMarkState !== '2' && cur.defaultRejectMarkState !== '931' && cur.defaultRejectMarkState !== '-91' && cur.defaultRejectMarkState !== '941') {
                newCode = cur.defaultRejectMarkState;
              } else {
                // Check if later pass exists
                let hasLaterPass = false;
                for (let j = i + 1; j < takes.length; j++) {
                  if (isPassList[j]) {
                    hasLaterPass = true;
                    break;
                  }
                }

                const defaultFail = oldCode === '5' ? '5' : (cur.defaultRejectMarkState || '2');
                newCode = hasLaterPass ? (targetExcludeCode || defaultFail) : defaultFail;
              }
            }
          }
        }

        if (newCode !== oldCode) {
          studentHasChange = true;
          updatesToApply.push({
            id: cur.enrollmentId, newCode, oldCode,
            studentId: cur.studentId, studentCode: stu.studentCode,
            courseCode: cur.courseCode, courseTitle: cur.courseTitle,
            termCode: cur.termCode, gradeValue: cur.gradeValue,
            university: uniName,
          });
          const pairKey = `${oldCode || 'null'} -> ${newCode}`;
          stats.enrollmentCodeChanges.set(pairKey, (stats.enrollmentCodeChanges.get(pairKey) || 0) + 1);
        }

        updatedEns.push({
          ...cur,
          gradeStatusCode: newCode,
        });
      }
    }

    if (studentHasChange) {
      stats.affectedStudents++;

      // Compute AFTER summary
      const summaryAfter = groupTranscript(updatedEns, regCfg);

      // Compare terms
      const beforeTermMap = new Map(summaryBefore.terms.map(t => [t.termCode, t]));
      for (const tAfter of summaryAfter.terms) {
        const tBefore = beforeTermMap.get(tAfter.termCode);
        if (!tBefore) continue;

        const gpaDiff = Math.abs((tAfter.gpa || 0) - (tBefore.gpa || 0));
        if (gpaDiff > 0.001) {
          stats.termGpaChangedCount++;
        }

        if (tBefore.probation !== tAfter.probation) {
          if (tAfter.probation) stats.probationBecameTrueCount++;
          else stats.probationBecameFalseCount++;
        }
      }

      const cumGpaDiff = Math.abs((summaryAfter.gpa || 0) - (summaryBefore.gpa || 0));
      if (cumGpaDiff > 0.001) {
        stats.cumGpaChangedCount++;
      }

      if (summaryBefore.totalPassed !== summaryAfter.totalPassed) {
        stats.passedUnitsChangedCount++;
      }

      if (stats.changeSamples.length < 10) {
        stats.changeSamples.push({
          studentCode: stu.studentCode,
          name: `${stu.firstName} ${stu.lastName}`,
          regTitle,
          beforePassed: summaryBefore.totalPassed,
          afterPassed: summaryAfter.totalPassed,
          beforeGpa: summaryBefore.gpa ? Number(summaryBefore.gpa.toFixed(2)) : null,
          afterGpa: summaryAfter.gpa ? Number(summaryAfter.gpa.toFixed(2)) : null,
          terms: summaryAfter.terms.map(t => {
            const b = beforeTermMap.get(t.termCode);
            return {
              term: t.termCode,
              beforeGpa: b?.gpa ? Number(b.gpa.toFixed(2)) : null,
              afterGpa: t?.gpa ? Number(t.gpa.toFixed(2)) : null,
              beforeProb: b?.probation,
              afterProb: t?.probation,
            };
          }),
        });
      }
    }
  }

  console.log(`\nUniversity ${uniName} Engine Results:`);
  console.log(`- Total Students: ${stats.totalStudents}`);
  console.log(`- Affected Students: ${stats.affectedStudents}`);
  console.log(`- Total Enrollment Status Code Updates: ${updatesToApply.length}`);
  console.log(`- Term GPA Changed: ${stats.termGpaChangedCount} terms`);
  console.log(`- Probation Cleared (true -> false): ${stats.probationBecameFalseCount}`);
  console.log(`- Probation Incurred (false -> true): ${stats.probationBecameTrueCount}`);
  console.log(`- Cumulative GPA Changed: ${stats.cumGpaChangedCount} students`);
  console.log(`- Total Passed Units Changed: ${stats.passedUnitsChangedCount} students`);

  console.log('\nEnrollment Code Transitions:');
  for (const [k, v] of stats.enrollmentCodeChanges.entries()) {
    console.log(`  ${k}: ${v}`);
  }

  // Apply updates to database if not DRY
  if (!isDryRun && updatesToApply.length > 0) {
    console.log(`\nApplying ${updatesToApply.length} updates in batches...`);
    const BATCH_SIZE = 2000;
    for (let i = 0; i < updatesToApply.length; i += BATCH_SIZE) {
      const chunk = updatesToApply.slice(i, i + BATCH_SIZE);
      const ids = chunk.map(c => c.id);
      const codes = chunk.map(c => c.newCode);
      await pool.query(`
        UPDATE enrollments e
        SET "samaGradeStatusCode" = u.new_code
        FROM (SELECT UNNEST($1::int[]) as id, UNNEST($2::text[]) as new_code) u
        WHERE e.id = u.id
      `, [ids, codes]);
      process.stdout.write(`  Updated ${Math.min(i + BATCH_SIZE, updatesToApply.length)} / ${updatesToApply.length}...\r`);
    }
    console.log(`\nBatch update completed successfully.`);

    // Detailed audit log: every changed enrollment (for traceability / rollback)
    const detailLines = ['enrollmentId,university,studentCode,courseCode,termCode,gradeValue,oldCode,newCode'];
    for (const c of updatesToApply) {
      const safe = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      detailLines.push([c.id, c.university, c.studentCode, c.courseCode, c.termCode, c.gradeValue, c.oldCode, c.newCode].map(safe).join(','));
    }
    fs.writeFileSync(`grade-engine-changes-${uniName}.csv`, detailLines.join('\n'));
    console.log(`Detailed change log written to grade-engine-changes-${uniName}.csv (${updatesToApply.length} rows)`);
  }

  return { stats, updatesToApply };
}

async function main() {
  const isDryRun = process.argv.includes('--dry');
  console.log(`=== RUNNING GRADE ENGINE LIVE FOR ALL UNIVERSITIES (DRY: ${isDryRun}) ===\n`);

  const unis = [
    { id: 1, name: 'AFAGH' },
    { id: 2, name: 'ZARINE' },
    { id: 3, name: 'ALLAME' },
    { id: 4, name: 'SHAMS' },
    { id: 5, name: 'NAZHAND' },
  ];

  const fullReport = {};

  for (const u of unis) {
    const { stats: res } = await processUniversity(u.id, u.name, isDryRun);
    fullReport[u.name] = {
      ...res,
      enrollmentCodeChanges: Object.fromEntries(res.enrollmentCodeChanges),
    };
  }

  fs.writeFileSync('grade-engine-run-audit-report.json', JSON.stringify(fullReport, null, 2));
  console.log(`\n=== Full Audit Report Written to grade-engine-run-audit-report.json ===`);

  await pool.end();
}

main().catch(console.error);
