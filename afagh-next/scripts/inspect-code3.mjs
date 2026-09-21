import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const r = await pool.query(`
    SELECT e.id, e."studentId", e."gradeValue", e."gradeStatus", e."samaGradeStatusCode", c.title
    FROM enrollments e
    JOIN course_offerings co ON co.id = e."offeringId"
    JOIN courses c ON c.id = co."courseId"
    WHERE e."samaGradeStatusCode" = '3'
    LIMIT 10
  `);
  console.log('Sample enrollments with samaGradeStatusCode = 3:');
  console.table(r.rows);
  await pool.end();
}

main().catch(console.error);
