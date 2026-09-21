import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  const r = await pool.query(`
    SELECT e.id, s."studentCode", s."regulationId", r.title AS reg, r."rulesConfig",
           c.code AS course, c."defaultRejectMarkState", t."termCode", e."gradeValue",
           e."samaGradeStatusCode", e."gradeStatus"
    FROM enrollments e
    JOIN course_offerings co ON co.id = e."offeringId"
    JOIN courses c ON c.id = co."courseId"
    JOIN academic_terms t ON t.id = co."termId"
    JOIN students s ON s.id = e."studentId"
    LEFT JOIN educational_regulations r ON r.id = s."regulationId"
    WHERE s."universityId" = 4 AND e."samaGradeStatusCode" = '941' AND e."gradeStatus" = 'FINALIZED'
    LIMIT 8
  `);
  for (const row of r.rows) {
    let cfg = null;
    try { if (row.rulesConfig) cfg = JSON.parse(row.rulesConfig); } catch {}
    console.log(JSON.stringify({
      stu: row.studentCode, reg: row.reg, course: row.course, term: row.termCode,
      grade: row.gradeValue, defRej: row.defaultRejectMarkState,
      failCode: cfg?.grading_and_gpa?.failed_sama_status_code,
      policy: cfg?.grading_and_gpa?.failed_course_gpa_policy,
    }));
  }
  await pool.end();
}
main().catch(console.error);
