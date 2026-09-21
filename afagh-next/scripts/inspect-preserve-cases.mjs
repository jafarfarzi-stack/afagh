import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  for (const code of ['40','44','3','12']) {
    const r = await pool.query(`
      SELECT e.id, s."universityId", s."studentCode", c.code AS course_code, c.title AS course_title,
             c."defaultAcceptMarkState", c."defaultRejectMarkState", c."courseType",
             e."gradeValue", e."gradeStatus", e."samaGradeStatusCode", e."originalSamaCode",
             t."termCode", s."regulationId"
      FROM enrollments e
      JOIN course_offerings co ON co.id = e."offeringId"
      JOIN courses c ON c.id = co."courseId"
      JOIN academic_terms t ON t.id = co."termId"
      JOIN students s ON s.id = e."studentId"
      WHERE e."samaGradeStatusCode" = $1
      LIMIT 5
    `, [code]);
    console.log(`\n=== samaCode=${code} samples ===`);
    console.table(r.rows.map(x => ({
      id: x.id, uni: x.universityId, stu: x.studentCode, course: x.course_code,
      defAcc: x.defaultAcceptMarkState, defRej: x.defaultRejectMarkState,
      ctype: x.courseType, grade: x.gradeValue, gstat: x.gradeStatus,
      sama: x.samaGradeStatusCode, orig: x.originalSamaCode, term: x.termCode, reg: x.regulationId
    })));
  }
  await pool.end();
}
main().catch(console.error);
