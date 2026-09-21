import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  const r = await pool.query(`
    SELECT s."entryYear", s.status, COUNT(*) AS n
    FROM students s
    WHERE s."universityId" = 1 AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e."studentId" = s.id)
    GROUP BY 1, 2 ORDER BY 1 DESC, 3 DESC LIMIT 20
  `);
  console.log('AFAGH zero-enrollment students by entryYear/status:');
  console.table(r.rows);
  await pool.end();
}
main().catch(console.error);
