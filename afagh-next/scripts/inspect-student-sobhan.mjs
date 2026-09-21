import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const stu = await pool.query(`SELECT * FROM students WHERE "studentCode" = '4031253061'`);
  console.log('Student 4031253061:');
  console.log(stu.rows);

  if (stu.rows.length) {
    const sid = stu.rows[0].id;
    const en = await pool.query(`
      SELECT e.id, c.code, c.title, t."termCode", e."gradeValue", e."gradeStatus",
             e."samaGradeStatusCode", e."originalSamaCode"
      FROM enrollments e
      JOIN course_offerings co ON co.id = e."offeringId"
      JOIN courses c ON c.id = co."courseId"
      JOIN academic_terms t ON t.id = co."termId"
      WHERE e."studentId" = $1
      ORDER BY t."termCode", c.code
    `, [sid]);
    console.log('Enrollments:');
    console.table(en.rows);

    const lg = await pool.query(`
      SELECT "courseCode", "courseTitle", "termCode", "gradeValue", "gradeStatus", raw
      FROM legacy_grades WHERE "studentCode" = '4031253061'
    `);
    console.log('Legacy grades:');
    console.table(lg.rows);

    const audits = await pool.query(`
      SELECT * FROM grade_change_audit
      WHERE "studentId" = $1
      ORDER BY id DESC
    `, [sid]);
    console.log('Audit trail:');
    console.table(audits.rows);
  }

  await pool.end();
}

main().catch(console.error);
