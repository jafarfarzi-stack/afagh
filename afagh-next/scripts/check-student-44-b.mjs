import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const allGrades = await pool.query(`
    SELECT e.id, c.code, c.title, c.units, e."gradeValue", e."samaGradeStatusCode"
    FROM enrollments e
    JOIN course_offerings o ON o.id = e."offeringId"
    JOIN courses c ON c.id = o."courseId"
    JOIN academic_terms t ON t.id = o."termId"
    WHERE e."studentId" = 40675
      AND t."termCode" = '13961';
  `);
  console.table(allGrades.rows);
}

main().finally(() => pool.end());
