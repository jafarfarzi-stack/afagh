import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  const s1 = await pool.query(`SELECT count(*) as total, count("majorId") as with_major, count("militaryStatus") as with_mil, count("studyingMode") as with_mode FROM students WHERE "universityId"=1`);
  console.log('students coverage:', s1.rows[0]);
  const s2 = await pool.query(`SELECT "studyingMode", count(*) FROM students WHERE "universityId"=1 GROUP BY 1 ORDER BY 2 DESC`);
  console.log('studyingMode dist:', s2.rows);
  const s3 = await pool.query(`SELECT "militaryStatus", count(*) FROM students WHERE "universityId"=1 GROUP BY 1 ORDER BY 2 DESC LIMIT 10`);
  console.log('military dist:', s3.rows);
  const s4 = await pool.query(`SELECT f.name, count(m.id) as majors FROM faculties f LEFT JOIN majors m ON m."facultyId"=f.id WHERE f."universityId"=1 GROUP BY f.name`);
  console.log('faculties-majors:', s4.rows);
  const s5 = await pool.query(`SELECT count(*) FROM courses WHERE "universityId"=1 AND title NOT LIKE 'درس مهاجرتی%'`);
  console.log('courses with real titles:', s5.rows[0]);
  const s6 = await pool.query(`SELECT count(*) FROM legacy_grades WHERE "sourceCode"='AFAGH' AND "courseTitle" NOT LIKE 'درس مهاجرتی%'`);
  console.log('legacy with real titles:', s6.rows[0]);
}
main().catch(console.error).finally(() => pool.end());
