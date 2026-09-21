import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  // Check if any legacy grade had markStat 931 when grade was 0
  const r = await pool.query(`
    SELECT raw::json->>'markStat' as markStat, COUNT(*) 
    FROM legacy_grades 
    WHERE "gradeValue" = '0.00' OR "gradeValue" = '0'
    GROUP BY raw::json->>'markStat'
    ORDER BY COUNT(*) DESC
  `);
  console.log('Legacy grades with grade=0 by markStat:');
  console.table(r.rows);

  await pool.end();
}

main().catch(console.error);
