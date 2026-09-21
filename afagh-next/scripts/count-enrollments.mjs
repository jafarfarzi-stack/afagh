import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const r = await pool.query(`
    SELECT s."universityId", 
           COUNT(e.id) as total_enrollments, 
           COUNT(CASE WHEN e."gradeStatus" = 'FINALIZED' THEN 1 END) as finalized,
           COUNT(DISTINCT e."studentId") as students_with_enrollments
    FROM enrollments e 
    JOIN students s ON s.id = e."studentId" 
    GROUP BY s."universityId" 
    ORDER BY s."universityId"
  `);
  console.log('Enrollments per university:');
  console.table(r.rows);
  await pool.end();
}

main().catch(console.error);
