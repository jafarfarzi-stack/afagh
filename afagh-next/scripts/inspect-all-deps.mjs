import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const depts = await pool.query(`SELECT "universityId", count(*) FROM departments GROUP BY "universityId" ORDER BY 1`);
  console.log('Departments per university:');
  console.table(depts.rows);

  const facs = await pool.query(`SELECT "universityId", count(*) FROM faculties GROUP BY "universityId" ORDER BY 1`);
  console.log('Faculties per university:');
  console.table(facs.rows);

  await pool.end();
}

main().catch(console.error);
