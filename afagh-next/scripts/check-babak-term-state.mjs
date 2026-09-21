import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT * FROM student_term_states WHERE "studentId" = 31906 AND "termCode" = '13993';
    `);
    console.log('student_term_states for 13993:', res.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
