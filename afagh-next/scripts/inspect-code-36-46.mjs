import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  const r = await pool.query(`
    SELECT e."gradeValue", e."gradeStatus", e."samaGradeStatusCode", c.code, c.title, c."courseType", t."termCode", s."studentCode"
    FROM enrollments e
    JOIN course_offerings co ON co.id = e."offeringId"
    JOIN courses c ON c.id = co."courseId"
    JOIN academic_terms t ON t.id = co."termId"
    JOIN students s ON s.id = e."studentId"
    WHERE e."samaGradeStatusCode" IN ('36','46')
    LIMIT 30
  `);
  console.table(r.rows);
  await pool.end();
}
main().catch(console.error);
