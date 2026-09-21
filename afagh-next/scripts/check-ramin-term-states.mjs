import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT sts.*
      FROM student_term_states sts
      JOIN students s ON s.id = sts."studentId"
      WHERE s."studentCode" = '9922344004';
    `);
    console.log('student_term_states for Ramin:', res.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
