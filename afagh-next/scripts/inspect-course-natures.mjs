import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const r = await pool.query(`SELECT DISTINCT "courseNature", "courseType" FROM courses WHERE "universityId" IN (2, 3, 5) LIMIT 20`);
  console.table(r.rows);
  await pool.end();
}

main().catch(console.error);
