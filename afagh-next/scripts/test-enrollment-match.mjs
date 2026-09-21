import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function check() {
  const match = await pool.query(`
    SELECT COUNT(*) 
    FROM enrollments e
    JOIN students s ON s.id = e."studentId"
    JOIN course_offerings o ON o.id = e."offeringId"
    JOIN courses c ON c.id = o."courseId"
    JOIN academic_terms t ON t.id = o."termId"
    JOIN legacy_grades lg ON lg."studentCode" = s."studentCode" AND lg."termCode" = t."termCode" AND lg."courseCode" = c.code
    WHERE (lg.raw::json->>'markStat') IS NOT NULL
  `);
  console.log('Enrollments matching legacy_grades with markStat:', match.rows[0]);
}
check().finally(() => pool.end());
