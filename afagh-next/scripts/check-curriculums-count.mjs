import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const cv = await pool.query(`SELECT count(*) FROM curriculum_versions`);
  console.log('curriculum_versions count:', cv.rows[0].count);
  const c = await pool.query(`SELECT count(*) FROM curriculums`);
  console.log('curriculums count:', c.rows[0].count);
  await pool.end();
}

main().catch(console.error);
