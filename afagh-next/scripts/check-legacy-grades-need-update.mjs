import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const r = await pool.query(`
    SELECT count(*)
    FROM legacy_grades
    WHERE "sourceCode" = 'AFAGH' AND ("courseTitle" IS NULL OR units IS NULL)
  `);
  console.log('AFAGH grades with NULL title or units:', r.rows[0].count);

  const sample = await pool.query(`
    SELECT "courseCode", "courseTitle", units
    FROM legacy_grades
    WHERE "sourceCode" = 'AFAGH'
    LIMIT 10
  `);
  console.log('AFAGH grades sample:', sample.rows);
}

main().catch(console.error).finally(() => pool.end());
