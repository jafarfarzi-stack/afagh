import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://afagh:afagh@localhost:5432/afagh_db',
});

async function main() {
  const f = await pool.query(`SELECT * FROM faculties ORDER BY id`);
  console.log('Faculties in DB:');
  console.table(f.rows);

  const m = await pool.query(`SELECT id, name, "majorCode", "facultyId", "departmentId" FROM majors ORDER BY id LIMIT 30`);
  console.log('Majors sample in DB:');
  console.table(m.rows);

  const mTotal = await pool.query(`SELECT count(*) FROM majors`);
  console.log('Total majors in DB:', mTotal.rows[0].count);

  await pool.end();
}

main().catch(console.error);
