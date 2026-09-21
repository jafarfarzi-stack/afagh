import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  // 1. NAZHAND courses with defaultAccept 44
  const c44 = await pool.query(`
    SELECT code, title, "courseType", "defaultAcceptMarkState", "defaultRejectMarkState", units
    FROM courses WHERE "universityId" = 5 AND "defaultAcceptMarkState" = '44' LIMIT 10
  `);
  console.log('=== NAZHAND courses defaultAccept=44 ===');
  console.table(c44.rows);

  // 2. Sample enrollment currently 1 but course default 44
  const e = await pool.query(`
    SELECT e.id, s."studentCode", c.code AS course_code, c.title, c."courseType",
           c."defaultAcceptMarkState", e."gradeValue", e."samaGradeStatusCode", t."termCode"
    FROM enrollments e
    JOIN course_offerings co ON co.id = e."offeringId"
    JOIN courses c ON c.id = co."courseId"
    JOIN academic_terms t ON t.id = co."termId"
    JOIN students s ON s.id = e."studentId"
    WHERE s."universityId" = 5 AND e."samaGradeStatusCode" = '1' AND c."defaultAcceptMarkState" = '44'
    LIMIT 5
  `);
  console.log('=== NAZHAND enrollments code=1 but course default=44 ===');
  console.table(e.rows);

  // 3. Courses with defaultReject 46 or defaultAccept 46
  const c46 = await pool.query(`
    SELECT code, title, "courseType", "defaultAcceptMarkState", "defaultRejectMarkState", units
    FROM courses WHERE "universityId" = 5 AND ("defaultAcceptMarkState" = '46' OR "defaultRejectMarkState" = '46') LIMIT 10
  `);
  console.log('=== NAZHAND courses with 46 ===');
  console.table(c46.rows);

  // 4. Check legacy markStat 46
  const lg = await pool.query(`
    SELECT raw::json->>'markStat' AS ms, COUNT(*) FROM legacy_grades WHERE "sourceCode" = 'NAZHAND' GROUP BY raw::json->>'markStat' ORDER BY COUNT(*) DESC LIMIT 20
  `);
  console.log('=== NAZHAND legacy markStat distribution ===');
  console.table(lg.rows);

  await pool.end();
}
main().catch(console.error);
