import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  // first enrollment term vs reg for correctly-mapped SHAMS students
  const r = await pool.query(`
    WITH first_t AS (
      SELECT e."studentId", MIN(t."termCode") AS ft
      FROM enrollments e
      JOIN course_offerings co ON co.id = e."offeringId"
      JOIN academic_terms t ON t.id = co."termId"
      JOIN students s ON s.id = e."studentId"
      WHERE s."universityId" = 4
      GROUP BY e."studentId"
    )
    SELECT SUBSTRING(f.ft FROM 1 FOR 4) AS entry4, r.title AS reg, COUNT(*) AS n
    FROM students s
    JOIN first_t f ON f."studentId" = s.id
    LEFT JOIN educational_regulations r ON r.id = s."regulationId"
    WHERE s."universityId" = 4
      AND s."degreeLevelId" IN (SELECT id FROM degree_level_configs WHERE code IN ('SAMA-1','SAMA-2','SAMA-5'))
    GROUP BY 1, 2 ORDER BY 1, 2
  `);
  console.log('Correct students: first-term-year vs reg:');
  console.table(r.rows);

  // same for mis-mapped (degree SAMA-3/4)
  const r2 = await pool.query(`
    WITH first_t AS (
      SELECT e."studentId", MIN(t."termCode") AS ft
      FROM enrollments e
      JOIN course_offerings co ON co.id = e."offeringId"
      JOIN academic_terms t ON t.id = co."termId"
      JOIN students s ON s.id = e."studentId"
      WHERE s."universityId" = 4
      GROUP BY e."studentId"
    )
    SELECT SUBSTRING(f.ft FROM 1 FOR 4) AS entry4, r.title AS reg, COUNT(*) AS n
    FROM students s
    JOIN first_t f ON f."studentId" = s.id
    LEFT JOIN educational_regulations r ON r.id = s."regulationId"
    WHERE s."universityId" = 4
      AND s."degreeLevelId" IN (SELECT id FROM degree_level_configs WHERE code IN ('SAMA-3','SAMA-4'))
    GROUP BY 1, 2 ORDER BY 1, 2
  `);
  console.log('Mis-mapped students: first-term-year vs reg:');
  console.table(r2.rows);
  await pool.end();
}
main().catch(console.error);
