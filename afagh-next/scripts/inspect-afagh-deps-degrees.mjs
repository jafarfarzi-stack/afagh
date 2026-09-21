import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const depts = await pool.query(`SELECT id, name, "departmentCode" FROM departments WHERE "universityId" = 1`);
  console.log('Departments for AFAGH:', depts.rows.length);
  console.log(depts.rows.slice(0, 10));

  const degrees = await pool.query(`SELECT id, title, code FROM degree_level_configs WHERE "universityId" = 1`);
  console.log('Degree levels for AFAGH:', degrees.rows.length);
  console.log(degrees.rows);

  await pool.end();
}

main().catch(console.error);
