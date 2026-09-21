import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT DISTINCT t.id, t."termCode", t.title, t."isSummer"
      FROM enrollments e
      JOIN students s ON s.id = e."studentId"
      JOIN course_offerings co ON co.id = e."offeringId"
      JOIN academic_terms t ON t.id = co."termId"
      WHERE s."studentCode" = '9922344004'
      ORDER BY t."termCode";
    `);
    console.log(res.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
