import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function check() {
  const idx = await pool.query(`
    SELECT indexname, tablename 
    FROM pg_indexes 
    WHERE tablename IN ('enrollments', 'legacy_grades', 'course_offerings', 'academic_terms', 'courses')
  `);
  console.table(idx.rows);
}
check().finally(() => pool.end());
