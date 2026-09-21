import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const ts = await pool.query(`
    SELECT sts.* 
    FROM student_term_states sts
    JOIN students s ON s.id = sts."studentId"
    WHERE s."studentCode" = '9511211018' AND sts."termCode" = '13961';
  `);
  console.log('Term State for 9511211018 term 13961:');
  console.table(ts.rows);

  const allGrades = await pool.query(`
    SELECT e.id, c.code, c.title, c.units, e."gradeValue", e."samaGradeStatusCode"
    FROM enrollments e
    JOIN course_offerings o ON o.id = e."offeringId"
    JOIN courses c ON c.id = o."courseId"
    JOIN academic_terms t ON t.id = o."termId"
    WHERE e."studentId" = (SELECT id FROM students WHERE "studentCode"='9511211018')
      AND t."termCode" = '13961';
  `);
  console.table(allGrades.rows);
}

main().finally(() => pool.end());
