import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const client = await pool.connect();
  try {
    const stuRes = await client.query(`SELECT id, "studentCode", "regulationId" FROM students WHERE "studentCode" = '9921312004';`);
    const stu = stuRes.rows[0];
    console.log('Student:', stu);

    if (stu) {
      const regRes = await client.query(`SELECT id, title, "rulesConfig" FROM educational_regulations WHERE id = $1;`, [stu.regulationId]);
      console.log('Regulation:', regRes.rows[0]);

      const enrRes = await client.query(`
        SELECT e.id as enr_id, e."gradeValue", e."gradeStatus", e."samaGradeStatusCode",
               c.code as "courseCode", c.title as course_title, c."defaultAcceptMarkState", c."defaultRejectMarkState",
               t."termCode", e."offeringId"
        FROM enrollments e
        JOIN course_offerings co ON co.id = e."offeringId"
        JOIN courses c ON c.id = co."courseId"
        JOIN academic_terms t ON t.id = co."termId"
        WHERE e."studentId" = $1
        ORDER BY t."termCode" ASC, c.code ASC;
      `, [stu.id]);

      console.log('Total enrollments:', enrRes.rows.length);
      for (const r of enrRes.rows) {
        if (r.courseCode === '31001' || r.courseCode === '31017' || r.samaGradeStatusCode === '931') {
          console.log(`Term: ${r.termCode} | Course: ${r.courseCode} (${r.course_title}) | Grade: ${r.gradeValue} | SamaCode: ${r.samaGradeStatusCode} | Status: ${r.gradeStatus} | DefAccept: ${r.defaultAcceptMarkState} | DefReject: ${r.defaultRejectMarkState}`);
        }
      }

      const logsRes = await client.query(`
        SELECT * FROM grade_change_log WHERE "studentId" = $1 ORDER BY id DESC;
      `, [stu.id]);
      console.log('\nAudit logs:');
      for (const l of logsRes.rows) {
        console.log(`Log ${l.id} | Action: ${l.action} | Offering: ${l.offeringId} | Grade: ${l.previousGrade} -> ${l.newGrade} | SamaCode: ${l.previousSamaCode} -> ${l.newSamaCode} | Reason: ${l.reason}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
