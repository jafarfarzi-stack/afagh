import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  console.log('--- Last Grade Change Log ---');
  const logs = await pool.query(`
    SELECT l.id, l."enrollmentId", l."studentId", l."offeringId", l.action, l."oldGradeValue", l."newGradeValue", l."oldSamaStatusCode", l."newSamaStatusCode", l.reason, l."createdAt"
    FROM grade_change_log l
    ORDER BY l.id DESC
    LIMIT 5;
  `);
  console.table(logs.rows);

  if (logs.rows.length > 0) {
    const row = logs.rows[0];
    const off = await pool.query(`
      SELECT o.id, o."courseId", o."termId", c.code, c.title, c."defaultAcceptMarkState", c."defaultRejectMarkState"
      FROM course_offerings o
      JOIN courses c ON c.id = o."courseId"
      WHERE o.id = $1
    `, [row.offeringId]);
    console.log('Offering for that log:');
    console.table(off.rows);

    const enr = await pool.query(`
      SELECT e.id, e."studentId", e."offeringId", e."gradeValue", e."samaGradeStatusCode"
      FROM enrollments e
      WHERE e.id = $1
    `, [row.enrollmentId]);
    console.log('Enrollment:');
    console.table(enr.rows);
  }
}

main().finally(() => pool.end());
