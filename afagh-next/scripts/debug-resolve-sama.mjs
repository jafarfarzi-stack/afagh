import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

// We can test resolveStudentCurriculum or query directly what happens!
async function main() {
  const studentId = 31993;
  const offeringId = 30549;

  // Let's check curriculum_courses for this student's curriculum
  const st = await pool.query(`SELECT id, "curriculumId", "departmentId", "entryTermCode" FROM students WHERE id = $1`, [studentId]);
  console.log('Student:', st.rows[0]);

  const off = await pool.query(`
    SELECT o.id, o."courseId", c.code, c.title, c."defaultAcceptMarkState", c."defaultRejectMarkState"
    FROM course_offerings o
    JOIN courses c ON c.id = o."courseId"
    WHERE o.id = $1
  `, [offeringId]);
  console.log('Offering:', off.rows[0]);

  // Let's check curriculum_courses for courseId = 1672
  const cc = await pool.query(`
    SELECT cc.id, cc."curriculumVersionId", cc."courseId", cc."passGradeStatusCode", cc."failGradeStatusCode", cc."minGrade"
    FROM curriculum_courses cc
    WHERE cc."courseId" = $1
  `, [off.rows[0].courseId]);
  console.log('Curriculum Courses rows for course 1672:');
  console.table(cc.rows);
}

main().finally(() => pool.end());
