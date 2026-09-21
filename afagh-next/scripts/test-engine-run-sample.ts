import pg from 'pg';
import { groupTranscript, type TranscriptRow } from '../src/app/admin/students/transcript-utils';
import { resolveSamaGradeStatusCode, syncStudentCourseRegulations } from '../src/lib/resolve-sama-code';
import { termChronologicalValue } from '../src/lib/term-chronology';

const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function getStudentTranscriptRows(studentId: number): Promise<TranscriptRow[]> {
  const ens = await pool.query(`
    SELECT 
      e.id as "enrollmentId",
      e."offeringId",
      t."termCode",
      t.title as "termTitle",
      c.code as "courseCode",
      c.title as "courseTitle",
      c.units::text as units,
      c."courseType",
      e."gradeValue"::text as "gradeValue",
      e."gradeStatus",
      e."samaGradeStatusCode" as "gradeStatusCode",
      co."offeringType"
    FROM enrollments e
    JOIN course_offerings co ON co.id = e."offeringId"
    JOIN courses c ON c.id = co."courseId"
    JOIN academic_terms t ON t.id = co."termId"
    WHERE e."studentId" = $1
    ORDER BY t."termCode" DESC, c.code
  `, [studentId]);

  return ens.rows;
}

async function main() {
  console.log('=== Testing Grade Engine On Sample Students ===\n');

  // Let's test on student 7333 (Sobhan Alamjou, 4031253061)
  const studentIds = [7333];

  // Also find 3 students who have retaken failed courses in Afagh
  const retakeStudents = (await pool.query(`
    SELECT e."studentId"
    FROM enrollments e
    JOIN course_offerings co ON co.id = e."offeringId"
    JOIN students s ON s.id = e."studentId"
    WHERE s."universityId" = 1 AND e."gradeStatus" = 'FINALIZED'
    GROUP BY e."studentId", co."courseId"
    HAVING COUNT(*) > 1 AND MIN(e."gradeValue") < 10 AND MAX(e."gradeValue") >= 10
    LIMIT 3
  `)).rows.map(r => r.studentId);

  studentIds.push(...retakeStudents);

  for (const stuId of studentIds) {
    const stuInfo = (await pool.query(`
      SELECT s.id, s."studentCode", u."firstName", u."lastName", s."regulationId", r.title as "regTitle", r."rulesConfig"
      FROM students s
      JOIN users u ON u.id = s."userId"
      LEFT JOIN educational_regulations r ON r.id = s."regulationId"
      WHERE s.id = $1
    `, [stuId])).rows[0];

    let regConfig = null;
    try {
      if (stuInfo.rulesConfig) regConfig = JSON.parse(stuInfo.rulesConfig);
    } catch {}

    const rowsBefore = await getStudentTranscriptRows(stuId);
    const summaryBefore = groupTranscript(rowsBefore, regConfig);

    console.log(`\n========================================`);
    console.log(`Student: ${stuInfo.firstName} ${stuInfo.lastName} (${stuInfo.studentCode}) - Reg: ${stuInfo.regTitle}`);
    console.log(`BEFORE -> Total Passed: ${summaryBefore.totalPassed}, Cum GPA: ${summaryBefore.gpa?.toFixed(2)}`);
    for (const t of summaryBefore.terms) {
      console.log(`  Term ${t.termCode}: GPA=${t.gpa?.toFixed(2) ?? '—'}, Passed=${t.passed}, Prob=${t.probation}`);
    }

    // Now let's evaluate all enrollments of this student using resolveSamaGradeStatusCode
    const studentCourses = (await pool.query(`
      SELECT DISTINCT co."courseId"
      FROM enrollments e
      JOIN course_offerings co ON co.id = e."offeringId"
      WHERE e."studentId" = $1
    `, [stuId])).rows.map(r => r.courseId);

    // 1. Resolve each enrollment
    for (const r of rowsBefore) {
      if (r.gradeStatus === 'FINALIZED' && r.gradeValue != null) {
        const targetCode = await resolveSamaGradeStatusCode(stuId, r.offeringId, r.gradeValue);
        if (targetCode && targetCode !== r.gradeStatusCode) {
          console.log(`  * Enrollment ${r.enrollmentId} (${r.courseCode} ${r.courseTitle}, grade=${r.gradeValue}): Code ${r.gradeStatusCode} -> ${targetCode}`);
          await pool.query(`UPDATE enrollments SET "samaGradeStatusCode" = $1 WHERE id = $2`, [targetCode, r.enrollmentId]);
        }
      }
    }

    // 2. Run syncStudentCourseRegulations for each course
    for (const cid of studentCourses) {
      await syncStudentCourseRegulations(stuId, cid);
    }

    const rowsAfter = await getStudentTranscriptRows(stuId);
    const summaryAfter = groupTranscript(rowsAfter, regConfig);

    console.log(`AFTER  -> Total Passed: ${summaryAfter.totalPassed}, Cum GPA: ${summaryAfter.gpa?.toFixed(2)}`);
    for (const t of summaryAfter.terms) {
      console.log(`  Term ${t.termCode}: GPA=${t.gpa?.toFixed(2) ?? '—'}, Passed=${t.passed}, Prob=${t.probation}`);
    }

    // Check difference
    const gpaDiff = (summaryAfter.gpa || 0) - (summaryBefore.gpa || 0);
    const passedDiff = summaryAfter.totalPassed - summaryBefore.totalPassed;
    console.log(`Diff: GPA ${gpaDiff.toFixed(4)}, Passed Units ${passedDiff}`);
  }

  await pool.end();
}

main().catch(console.error);
