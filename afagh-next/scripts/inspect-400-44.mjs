import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const sample400 = await pool.query(`
    SELECT lg."studentCode", lg."termCode", lg."courseCode", lg."courseTitle", lg."gradeValue", lg."gradeStatus", lg.raw
    FROM legacy_grades lg
    WHERE (lg.raw::json->>'markStat') = '400'
    LIMIT 3;
  `);
  console.log('Sample 400:');
  console.table(sample400.rows);

  const sample44 = await pool.query(`
    SELECT lg."studentCode", lg."termCode", lg."courseCode", lg."courseTitle", lg."gradeValue", lg."gradeStatus", lg.raw
    FROM legacy_grades lg
    WHERE (lg.raw::json->>'markStat') = '44'
    LIMIT 3;
  `);
  console.log('Sample 44:');
  console.table(sample44.rows);
}

main().finally(() => pool.end());
