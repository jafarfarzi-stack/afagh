import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const r = await pool.query(`
    SELECT id, title, "universityId", "rulesConfig"
    FROM educational_regulations
    ORDER BY "universityId", id
  `);
  console.log('Educational Regulations:');
  for (const row of r.rows) {
    console.log(`Uni: ${row.universityId}, ID: ${row.id}, Title: "${row.title}"`);
    try {
      const cfg = JSON.parse(row.rulesConfig);
      console.log(`   Policy: ${cfg?.grading_and_gpa?.failed_course_gpa_policy}, FailedCode: ${cfg?.grading_and_gpa?.failed_sama_status_code}`);
    } catch {
      console.log(`   RulesConfig: [invalid/null]`);
    }
  }

  // Also check a few students who had 931 in Afagh:
  const s931 = await pool.query(`
    SELECT e.id, e."studentId", s."studentCode", r.title as reg_title, c.code as course_code, c.title as course_title, e."gradeValue", e."samaGradeStatusCode", t."termCode"
    FROM enrollments e
    JOIN course_offerings co ON co.id = e."offeringId"
    JOIN courses c ON c.id = co."courseId"
    JOIN academic_terms t ON t.id = co."termId"
    JOIN students s ON s.id = e."studentId"
    LEFT JOIN educational_regulations r ON r.id = s."regulationId"
    WHERE s."universityId" = 1 AND e."samaGradeStatusCode" = '931'
    LIMIT 5
  `);
  console.log('\nSample enrollments with 931 in Afagh:');
  console.table(s931.rows);

  // Check all takes for one of these students:
  if (s931.rows.length > 0) {
    const testStuId = s931.rows[0].studentId;
    const testCourseCode = s931.rows[0].course_code;
    const allTakes = await pool.query(`
      SELECT e.id, c.code, c.title, e."gradeValue", e."gradeStatus", e."samaGradeStatusCode", t."termCode", t."sortOrder"
      FROM enrollments e
      JOIN course_offerings co ON co.id = e."offeringId"
      JOIN courses c ON c.id = co."courseId"
      JOIN academic_terms t ON t.id = co."termId"
      WHERE e."studentId" = $1
      ORDER BY t."sortOrder", t."termCode"
    `, [testStuId]);
    console.log(`\nAll enrollments for student ${testStuId} (course ${testCourseCode}):`);
    console.table(allTakes.rows);
  }

  await pool.end();
}

main().catch(console.error);
