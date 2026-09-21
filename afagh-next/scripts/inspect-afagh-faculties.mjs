import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const facs = await pool.query(`SELECT id, name, "facultyCode", "universityId" FROM faculties WHERE "universityId" = 1`);
  console.log('Faculties for AFAGH:');
  console.table(facs.rows);
  await pool.end();
}

main().catch(console.error);
