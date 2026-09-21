import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const m = await pool.query('SELECT count(*), count("facultyId") FROM majors WHERE "universityId" = 1');
  console.log('Majors for university 1:', m.rows[0]);

  const sample = await pool.query('SELECT id, name, "majorCode", "facultyId" FROM majors WHERE "universityId" = 1 LIMIT 10');
  console.log('Sample majors:', sample.rows);
}

main().catch(console.error).finally(() => pool.end());
