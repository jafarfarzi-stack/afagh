import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const client = await pool.connect();
  try {
    const stu = (await client.query(`SELECT id, "studentCode" FROM students WHERE "studentCode" = '9922344004'`)).rows[0];
    console.log('Student:', stu);
    const lg = await client.query(`SELECT * FROM legacy_grades WHERE "studentCode" = $1 AND "termCode" = '13993'`, [stu.studentCode]);
    console.log('legacy_grades 13993:', lg.rows);
    const en = await client.query(`
      SELECT e.*, t."termCode", co.id as co_id, c.code, c.title
      FROM enrollments e
      JOIN course_offerings co ON co.id = e."offeringId"
      JOIN academic_terms t ON t.id = co."termId"
      JOIN courses c ON c.id = co."courseId"
      WHERE e."studentId" = $1 AND t."termCode" = '13993'
    `, [stu.id]);
    console.log('enrollments 13993:', en.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
