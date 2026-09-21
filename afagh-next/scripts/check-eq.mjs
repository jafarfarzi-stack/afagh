import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const client = await pool.connect();
  try {
    const eqCount = await client.query(`SELECT COUNT(*) FROM curriculum_course_equivalencies;`);
    console.log('curriculum_course_equivalencies count:', eqCount.rows[0]);
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
