import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function check() {
  const stu = await pool.query(`SELECT id, "studentCode" FROM students WHERE "studentCode"='9992243001'`);
  console.log('student:', stu.rows[0]);
  if (!stu.rows[0]) return;
  const sId = stu.rows[0].id;
  const ens = await pool.query(`
    SELECT e.id, c.code, c.title, e."gradeValue", e."samaGradeStatusCode", (lg.raw::json->>'markStat') as legacy_markstat
    FROM enrollments e
    JOIN course_offerings o ON o.id=e."offeringId"
    JOIN courses c ON c.id=o."courseId"
    JOIN academic_terms t ON t.id=o."termId"
    LEFT JOIN legacy_grades lg ON lg."studentCode"= '9992243001' AND lg."termCode"=t."termCode" AND lg."courseCode"=c.code
    WHERE e."studentId" = $1
    ORDER BY t."termCode", c.code
  `, [sId]);
  console.table(ens.rows);
}
check().finally(() => pool.end());
