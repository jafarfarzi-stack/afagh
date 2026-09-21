import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  const r = await pool.query(`
    SELECT DISTINCT lg."studentCode", s."universityId"
    FROM legacy_grades lg
    JOIN students s ON s."studentCode" = lg."studentCode"
    WHERE lg."sourceCode" = 'NAZHAND'
      AND NOT EXISTS (SELECT 1 FROM students s5 WHERE s5."studentCode" = lg."studentCode" AND s5."universityId" = 5)
    ORDER BY 1, 2
  `);
  console.log(`NAZHAND-stray codes found in other universities: ${r.rows.length}`);
  console.table(r.rows.slice(0, 40));
  await pool.end();
}
main().catch(console.error);
