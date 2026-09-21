import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  const r = await pool.query(`
    SELECT lg."studentCode", lg."termCode", lg."courseCode", lg."gradeValue", lg.raw
    FROM legacy_grades lg
    WHERE lg."sourceCode" = 'NAZHAND' AND lg.raw::json->>'markStat' = '36'
    LIMIT 5
  `);
  console.log('=== legacy raw for markStat 36 ===');
  console.table(r.rows);
  const r2 = await pool.query(`
    SELECT lg."studentCode", lg."termCode", lg."courseCode", lg."gradeValue", lg.raw
    FROM legacy_grades lg
    WHERE lg."sourceCode" = 'NAZHAND' AND lg.raw::json->>'markStat' = '46'
    LIMIT 5
  `);
  console.log('=== legacy raw for markStat 46 ===');
  console.table(r2.rows);
  await pool.end();
}
main().catch(console.error);
