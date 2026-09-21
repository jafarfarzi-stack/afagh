import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  console.log('Updating migratory titles in legacy_grades...');
  let total = 0;
  while (true) {
    const res = await pool.query(`
      WITH batch AS (
        SELECT id FROM legacy_grades
        WHERE "sourceCode"='AFAGH' AND "courseTitle" LIKE 'درس مهاجرتی%'
        LIMIT 25000
      )
      UPDATE legacy_grades lg SET "courseTitle"=c.title, units=c.units
      FROM courses c, batch b
      WHERE lg.id=b.id AND lg."courseCode"=c.code AND c."universityId"=1
    `);
    total += Number(res.rowCount);
    console.log('batch:', res.rowCount, 'total:', total);
    if (Number(res.rowCount) === 0) break;
  }
  const rem = await pool.query(`SELECT count(*) FROM legacy_grades WHERE "sourceCode"='AFAGH' AND "courseTitle" LIKE 'درس مهاجرتی%'`);
  console.log('remaining migratory:', rem.rows[0].count);
}
main().catch(console.error).finally(() => pool.end());
