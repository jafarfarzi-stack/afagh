import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  const t1 = await pool.query(`SELECT COUNT(*) AS n FROM enrollments`);
  console.log('total enrollments:', t1.rows[0].n);

  const t2 = await pool.query(`SELECT e."universityId", COUNT(*) AS n FROM enrollments e GROUP BY e."universityId" ORDER BY 1`);
  console.log('enrollments by enrollments.universityId:');
  console.table(t2.rows);

  const t3 = await pool.query(`SELECT s."universityId", COUNT(*) AS n FROM enrollments e JOIN students s ON s.id = e."studentId" GROUP BY s."universityId" ORDER BY 1`);
  console.log('enrollments by students.universityId:');
  console.table(t3.rows);

  const t4 = await pool.query(`SELECT c."universityId", COUNT(*) AS n FROM enrollments e JOIN course_offerings co ON co.id = e."offeringId" JOIN courses c ON c.id = co."courseId" GROUP BY c."universityId" ORDER BY 1`);
  console.log('enrollments by courses.universityId (script filter):');
  console.table(t4.rows);

  const t5 = await pool.query(`SELECT COUNT(*) AS n FROM legacy_grades`);
  console.log('total legacy_grades:', t5.rows[0].n);

  const t6 = await pool.query(`SELECT "sourceCode", COUNT(*) AS n FROM legacy_grades GROUP BY "sourceCode" ORDER BY 1`);
  console.log('legacy_grades by sourceCode:');
  console.table(t6.rows);

  const t7 = await pool.query(`SELECT COUNT(*) AS n FROM students`);
  console.log('total students:', t7.rows[0].n);

  await pool.end();
}
main().catch(console.error);
