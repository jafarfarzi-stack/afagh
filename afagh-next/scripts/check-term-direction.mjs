import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT e1."studentId", c.code as course_code,
             t1."termCode" as fail_term, e1."gradeValue" as fail_grade, e1."samaGradeStatusCode" as fail_code,
             t2."termCode" as pass_term, e2."gradeValue" as pass_grade, e2."samaGradeStatusCode" as pass_code
      FROM enrollments e1
      JOIN course_offerings co1 ON co1.id = e1."offeringId"
      JOIN courses c ON c.id = co1."courseId"
      JOIN academic_terms t1 ON t1.id = co1."termId"
      JOIN enrollments e2 ON e2."studentId" = e1."studentId" AND e2.id != e1.id
      JOIN course_offerings co2 ON co2.id = e2."offeringId" AND co2."courseId" = co1."courseId"
      JOIN academic_terms t2 ON t2.id = co2."termId"
      WHERE e1."samaGradeStatusCode" = '931'
        AND CAST(e2."gradeValue" AS NUMERIC) >= 10
      LIMIT 30;
    `);

    let afterCount = 0;
    let beforeCount = 0;
    for (const r of res.rows) {
      if (r.pass_term > r.fail_term) afterCount++;
      else if (r.pass_term < r.fail_term) beforeCount++;
    }
    console.log(`Sample 30 rows: pass_term > fail_term: ${afterCount}, pass_term < fail_term: ${beforeCount}`);
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
