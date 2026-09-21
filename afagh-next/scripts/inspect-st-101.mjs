import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://afagh:afagh@localhost:5432/afagh_db',
});

async function main() {
  const r = await pool.query(`
    SELECT * FROM legacy_grades WHERE "studentCode" = '9021151015' AND "termCode" = '101'
  `);
  console.table(r.rows);

  const r2 = await pool.query(`
    SELECT * FROM legacy_grades WHERE "studentCode" = '9021151015'
  `);
  console.table(r2.rows.map(x => ({ term: x.termCode, course: x.courseCode, mark: x.gradeValue, raw: x.raw })));

  await pool.end();
}

main().catch(console.error);
