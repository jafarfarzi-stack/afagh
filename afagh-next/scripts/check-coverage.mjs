import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  const r = await pool.query(`SELECT count(DISTINCT "courseCode") as d FROM legacy_grades WHERE "sourceCode"='AFAGH'`);
  console.log('distinct legacy codes:', r.rows);
  const r2 = await pool.query(`SELECT count(*) FROM courses WHERE "universityId"=1`);
  console.log('courses count uni1:', r2.rows);
  const r3 = await pool.query(`SELECT "courseTitle" LIKE 'درس مهاجرتی%' as is_mig, count(*) FROM legacy_grades WHERE "sourceCode"='AFAGH' GROUP BY 1`);
  console.log('migratory vs real:', r3.rows);
  const r4 = await pool.query(`SELECT code, title, units FROM courses WHERE "universityId"=1 AND (title LIKE 'درس مهاجرتی%') LIMIT 5`);
  console.log('sample migratory courses:', r4.rows);
  const r5 = await pool.query(`SELECT "courseCode", "courseTitle", units FROM legacy_grades WHERE "sourceCode"='AFAGH' AND "courseTitle" NOT LIKE 'درس مهاجرتی%' LIMIT 5`);
  console.log('sample real titles:', r5.rows);
}
main().catch(console.error).finally(() => pool.end());
