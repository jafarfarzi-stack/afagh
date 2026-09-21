import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  console.log('=== AFAGH missing students in OTHER universities? ===');
  const a = await pool.query(`
    SELECT DISTINCT s."studentCode", s."universityId", lg."sourceCode"
    FROM legacy_grades lg
    JOIN students s ON s."studentCode" = lg."studentCode"
    WHERE lg."sourceCode" = 'AFAGH'
      AND lg."studentCode" IN ('961','9993264009','4002239606')
    ORDER BY 1, 2
  `);
  console.table(a.rows);

  console.log('=== Is 4002239606 a NAZHAND/SHAMS/etc code? ===');
  const b = await pool.query(`SELECT "studentCode", "universityId", "userId" FROM students WHERE "studentCode" = '4002239606'`);
  console.table(b.rows);

  console.log('=== legacy_grades for 4002239606 -> today source ==');
  const c = await pool.query(`SELECT "sourceCode", "studentCode", COUNT(*) n FROM legacy_grades WHERE "studentCode" = '4002239606' GROUP BY 1, 2`);
  console.table(c.rows);

  await pool.end();
}
main().catch(console.error);