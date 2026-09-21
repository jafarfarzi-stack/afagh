import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://afagh:afagh@localhost:5432/afagh_db',
});

async function main() {
  const studentRes = await pool.query(`
    SELECT s.*, u."firstName", u."lastName"
    FROM students s
    JOIN users u ON u.id = s."userId"
    WHERE s."studentCode" = '9992243001'
  `);
  console.log('Student:', studentRes.rows[0]);

  if (studentRes.rows[0]) {
    const sid = studentRes.rows[0].id;
    const legRes = await pool.query(`
      SELECT * FROM legacy_grades WHERE "studentCode" = '9992243001'
    `);
    console.log(`Legacy grades count: ${legRes.rows.length}`);
    if (legRes.rows.length) {
      console.log('Sample legacy grade:', legRes.rows[0]);
      console.table(legRes.rows.map(r => ({
        termCode: r.termCode,
        courseCode: r.courseCode,
        courseTitle: r.courseTitle,
        units: r.units,
        gradeValue: r.gradeValue,
        gradeStatus: r.gradeStatus,
        statusCode: r.statusCode
      })));
    }

    const enrRes = await pool.query(`
      SELECT e.*, c.code as "courseCode", c.title as "courseTitle", c.units as "courseUnits"
      FROM enrollments e
      JOIN course_offerings co ON co.id = e."offeringId"
      JOIN courses c ON c.id = co."courseId"
      WHERE e."studentId" = $1
    `, [sid]);
    console.log(`Enrollments count: ${enrRes.rows.length}`);
    if (enrRes.rows.length) {
      console.table(enrRes.rows);
    }

    const logRes = await pool.query(`
      SELECT * FROM grade_change_log WHERE "studentId" = $1
    `, [sid]);
    console.log(`Grade change logs count: ${logRes.rows.length}`);
    console.table(logRes.rows);
  }

  // Check how many courses have "مهاجرتی"
  const migrationCourses = await pool.query(`
    SELECT count(*) as count FROM courses WHERE title LIKE '%مهاجرتی%'
  `);
  console.log('Courses with title LIKE %مهاجرتی%:', migrationCourses.rows[0].count);

  // Check course 43124 in courses table
  const c43124 = await pool.query(`
    SELECT * FROM courses WHERE code IN ('43124', '43126', '99013')
  `);
  console.log('Courses matching codes 43124, 43126, 99013:', c43124.rows);

  await pool.end();
}

main().catch(console.error);
