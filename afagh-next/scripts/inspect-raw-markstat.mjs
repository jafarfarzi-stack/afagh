import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function check() {
  const res = await pool.query(`SELECT "studentCode", "termCode", "courseCode", raw FROM legacy_grades WHERE raw IS NOT NULL LIMIT 5`);
  console.log(res.rows);
  const markStats = await pool.query(`SELECT DISTINCT (raw::json->>'markStat') as stat FROM legacy_grades WHERE raw IS NOT NULL LIMIT 20`);
  console.log('markStats:', markStats.rows);
}
check().finally(() => pool.end());
