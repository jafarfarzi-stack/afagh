import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function test() {
  const studentId = 31993;
  const offeringId = 30549;
  const numGrade = 18.5;

  // 1) student
  const sRes = await pool.query(`SELECT * FROM students WHERE id = $1`, [studentId]);
  console.log('Student row:', sRes.rows[0]);

  // 2) offering + course
  const offRes = await pool.query(`
    SELECT o.id, o."courseId", c.code, c.title, c."defaultAcceptMarkState", c."defaultRejectMarkState", c."minPassedMark"
    FROM course_offerings o
    INNER JOIN courses c ON c.id = o."courseId"
    WHERE o.id = $1
  `, [offeringId]);
  console.log('Offering + course row:', offRes.rows[0]);

  const offering = offRes.rows[0];
  const courseDefaultPass = offering.defaultAcceptMarkState?.trim() || null;
  const courseDefaultFail = offering.defaultRejectMarkState?.trim() || null;
  console.log({ courseDefaultPass, courseDefaultFail });

  // 3) Let's check what resolveStudentCurriculum would find
  // Let's check curriculum_versions for the student's field/department/entry
  const cvRes = await pool.query(`
    SELECT * FROM curriculum_versions cv
    LIMIT 5;
  `);
  console.log('Curriculum versions sample:', cvRes.rows.length);
}

test().finally(() => pool.end());
