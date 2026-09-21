import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const r = await pool.query(`
    SELECT "sourceCode", raw::json->>'markStat' as mark_stat, COUNT(*)
    FROM legacy_grades
    WHERE raw::json->>'markStat' = '3'
    GROUP BY "sourceCode", raw::json->>'markStat'
  `);
  console.log('MarkStat 3 by sourceCode:');
  console.table(r.rows);

  await pool.end();
}

main().catch(console.error);
