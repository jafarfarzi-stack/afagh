import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const client = await pool.connect();
  try {
    const studentRes = await client.query(`SELECT id FROM students WHERE "studentCode" = '9921312004'`);
    const studentId = studentRes.rows[0].id;
    console.log('Babak studentId:', studentId);

    const coursesRes = await client.query(`
      SELECT DISTINCT c.id, c.code, c.title
      FROM enrollments e
      JOIN course_offerings co ON co.id = e."offeringId"
      JOIN courses c ON c.id = co."courseId"
      WHERE e."studentId" = $1;
    `, [studentId]);

    console.log(`Found ${coursesRes.rows.length} distinct courses for Babak.`);
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
