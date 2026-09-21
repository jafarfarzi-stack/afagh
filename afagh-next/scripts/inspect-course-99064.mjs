import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const c = await pool.query(`SELECT * FROM courses WHERE code = '99064'`);
  console.log('--- COURSES ---');
  console.log(JSON.stringify(c.rows, null, 2));

  const cc = await pool.query(`
    SELECT cc.*, cv.title as version_title
    FROM curriculum_courses cc
    JOIN curriculum_versions cv ON cv.id = cc."curriculumVersionId"
    WHERE cc."courseId" IN (SELECT id FROM courses WHERE code = '99064')
  `);
  console.log('--- CURRICULUM_COURSES ---');
  console.log(JSON.stringify(cc.rows, null, 2));

  const lg = await pool.query(`
    SELECT "studentCode", "termCode", "courseCode", "courseTitle", "gradeValue", "gradeStatus", "sourceCode", raw
    FROM legacy_grades WHERE "courseCode" = '99064'
    LIMIT 10
  `);
  console.log('--- LEGACY_GRADES (sample 10) ---');
  console.log(JSON.stringify(lg.rows, null, 2));

  const en = await pool.query(`
    SELECT e.id, s."studentCode", t."termCode", c.code as course_code, e."gradeValue", e."gradeStatus", e."samaGradeStatusCode", e."originalSamaCode"
    FROM enrollments e
    JOIN course_offerings co ON co.id = e."offeringId"
    JOIN courses c ON c.id = co."courseId"
    JOIN academic_terms t ON t.id = co."termId"
    JOIN students s ON s.id = e."studentId"
    WHERE c.code = '99064'
    LIMIT 10
  `);
  console.log('--- ENROLLMENTS (sample 10) ---');
  console.log(JSON.stringify(en.rows, null, 2));

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
