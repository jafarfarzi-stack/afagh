import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT e.id as enr_id, e."gradeValue", e."samaGradeStatusCode",
             c.code as course_code, c.title as course_title,
             t."termCode"
      FROM enrollments e
      JOIN course_offerings co ON co.id = e."offeringId"
      JOIN courses c ON c.id = co."courseId"
      JOIN academic_terms t ON t.id = co."termId"
      WHERE e."studentId" = 31906 AND c.code IN ('31015', '31011')
      ORDER BY c.code, t."termCode";
    `);
    console.log('Babak 31015 and 31011 attempts:');
    for (const r of res.rows) {
      console.log(r);
    }
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
