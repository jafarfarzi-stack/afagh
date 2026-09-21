import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const client = await pool.connect();
  try {
    // Check students with code 931
    const res = await client.query(`
      SELECT e."studentId", e."gradeValue", e."samaGradeStatusCode", t."termCode", c.code as course_code
      FROM enrollments e
      JOIN course_offerings co ON co.id = e."offeringId"
      JOIN courses c ON c.id = co."courseId"
      JOIN academic_terms t ON t.id = co."termId"
      WHERE e."samaGradeStatusCode" = '931'
      LIMIT 10;
    `);
    console.log('Sample 931 enrollments:');
    for (const row of res.rows) {
      console.log(row);
      // Let's check other enrollments of the same student for the same course
      const others = await client.query(`
        SELECT e."gradeValue", e."samaGradeStatusCode", t."termCode"
        FROM enrollments e
        JOIN course_offerings co ON co.id = e."offeringId"
        JOIN courses c ON c.id = co."courseId"
        JOIN academic_terms t ON t.id = co."termId"
        WHERE e."studentId" = $1 AND c.code = $2
        ORDER BY t."termCode" ASC;
      `, [row.studentId, row.course_code]);
      console.log('  All attempts for course', row.course_code, ':', others.rows);
    }
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
