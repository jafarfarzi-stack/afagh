import pg from 'pg';
import { groupTranscript } from '../src/app/admin/students/transcript-utils.ts';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const client = await pool.connect();
  try {
    const ens = await client.query(`
      SELECT 
        e.id as "enrollmentId",
        e."offeringId",
        t."termCode",
        t.title as "termTitle",
        c.code as "courseCode",
        c.title as "courseTitle",
        c.units,
        c."courseType",
        e."gradeValue",
        e."gradeStatus",
        co."offeringType",
        e."samaGradeStatusCode",
        NULL as "legacyRaw"
      FROM enrollments e
      JOIN course_offerings co ON co.id = e."offeringId"
      JOIN courses c ON c.id = co."courseId"
      JOIN academic_terms t ON t.id = co."termId"
      WHERE e."studentId" = 32018
      ORDER BY t."termCode", c.code
    `);
    const rows = ens.rows.map(r => ({
      enrollmentId: r.enrollmentId,
      offeringId: r.offeringId,
      termCode: r.termCode,
      termTitle: r.termTitle,
      courseCode: r.courseCode,
      courseTitle: r.courseTitle,
      units: r.units ? String(r.units) : null,
      courseType: r.courseType,
      gradeValue: r.gradeValue ? String(r.gradeValue) : null,
      gradeStatus: r.gradeStatus,
      gradeStatusTitle: null,
      gradeStatusCode: r.samaGradeStatusCode,
      offeringType: r.offeringType,
      termStatusTitle: null,
      termProbation: null,
    }));
    const summary = groupTranscript(rows, { passGrade: 12, probThreshold: 12 });
    for (const t of summary.terms) {
      console.log(`Term: ${t.termCode}, GPA: ${t.gpa}, Probation: ${t.probation}`);
    }
    const probCount = summary.terms.filter(t => t.probation).length;
    console.log('Total probation terms:', probCount);
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
