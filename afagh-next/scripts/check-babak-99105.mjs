import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT e.id, e."gradeValue", e."samaGradeStatusCode", t."termCode", c.code as "courseCode", c.title as "courseTitle"
      FROM enrollments e
      JOIN students s ON s.id = e."studentId"
      JOIN course_offerings co ON co.id = e."offeringId"
      JOIN courses c ON c.id = co."courseId"
      JOIN academic_terms t ON t.id = co."termId"
      WHERE s."studentCode" = '9921312004' AND c.code IN ('99105', '44022')
      ORDER BY t."termCode" ASC;
    `);
    console.log(res.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
