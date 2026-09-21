import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  const r = await pool.query(`SELECT id, "studentCode", "universityId" FROM students WHERE "studentCode" IN ('9923156750','4001156750')`);
  console.log('students:', r.rows);
  // how many legacy students exist under their OLDSTNO instead?
  const r2 = await pool.query(`
    SELECT COUNT(*) AS n FROM students s WHERE s."universityId" = 1 AND NOT EXISTS (
      SELECT 1 FROM legacy_grades lg WHERE lg."sourceCode"='AFAGH' AND lg."studentCode" = s."studentCode"
    )
  `);
  console.log('AFAGH students with NO legacy grades (possible OLDSTNO imports):', r2.rows[0].n);
  await pool.end();
}
main().catch(console.error);
