import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const en = (await pool.query(`
    SELECT e.id, s."studentCode", t."termCode", c.code as "courseCode", e."gradeValue", e."samaGradeStatusCode", e."originalSamaCode"
    FROM enrollments e
    JOIN course_offerings co ON co.id = e."offeringId"
    JOIN courses c ON c.id = co."courseId"
    JOIN academic_terms t ON t.id = co."termId"
    JOIN students s ON s.id = e."studentId"
    WHERE e.id = 371239
  `)).rows[0];
  console.log('Enrollment 371239:', en);

  const lg = (await pool.query(`
    SELECT * FROM legacy_grades
    WHERE "studentCode" = $1 AND "courseCode" = $2 AND "termCode" = $3
  `, [en.studentCode, en.courseCode, en.termCode])).rows;
  console.log('Legacy grade:', lg);

  await pool.end();
}

main().catch(console.error);
