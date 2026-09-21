import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const client = await pool.connect();
  try {
    const stuRes = await client.query(`SELECT id, "studentCode", "regulationId" FROM students WHERE "studentCode" = '9922344004';`);
    const stu = stuRes.rows[0];
    console.log('Student:', stu);

    if (stu) {
      const regRes = await client.query(`SELECT id, title, "rulesConfig" FROM educational_regulations WHERE id = $1;`, [stu.regulationId]);
      console.log('Regulation:', regRes.rows[0]);

      const enrRes = await client.query(`
        SELECT e.id as enr_id, e."gradeValue", e."gradeStatus", e."samaGradeStatusCode",
               c.code as course_code, c.title as course_title, c.units,
               t."termCode"
        FROM enrollments e
        JOIN course_offerings co ON co.id = e."offeringId"
        JOIN courses c ON c.id = co."courseId"
        JOIN academic_terms t ON t.id = co."termId"
        WHERE e."studentId" = $1
        ORDER BY t."termCode" ASC, c.code ASC;
      `, [stu.id]);

      console.log('Total enrollments:', enrRes.rows.length);
      for (const r of enrRes.rows) {
        console.log(`Term: ${r.termCode} | Course: ${r.course_code} (${r.course_title}) | Units: ${r.units} | Grade: ${r.gradeValue} | SamaCode: ${r.samaGradeStatusCode}`);
      }

      const statesRes = await client.query(`SELECT * FROM student_term_states WHERE "studentId" = $1;`, [stu.id]);
      console.log('Term states:', statesRes.rows);
    }
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
