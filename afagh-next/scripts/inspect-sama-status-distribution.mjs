import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const r = await pool.query(`
    SELECT s."universityId", e."samaGradeStatusCode", COUNT(*) as count
    FROM enrollments e
    JOIN students s ON s.id = e."studentId"
    WHERE e."gradeStatus" = 'FINALIZED'
    GROUP BY s."universityId", e."samaGradeStatusCode"
    ORDER BY s."universityId", count DESC
  `);
  console.log('Finalized enrollments by university and samaGradeStatusCode:');
  console.table(r.rows);
  await pool.end();
}

main().catch(console.error);
