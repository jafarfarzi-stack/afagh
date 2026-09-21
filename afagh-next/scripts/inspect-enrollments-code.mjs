import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function check() {
  const res = await pool.query(`SELECT COUNT(*) as total, COUNT("samaGradeStatusCode") as with_code FROM enrollments`);
  console.log('enrollments stats:', res.rows[0]);
  const sample = await pool.query(`SELECT "samaGradeStatusCode", COUNT(*) FROM enrollments GROUP BY "samaGradeStatusCode" ORDER BY count DESC LIMIT 20`);
  console.log('enrollments codes:', sample.rows);
}
check().finally(() => pool.end());
