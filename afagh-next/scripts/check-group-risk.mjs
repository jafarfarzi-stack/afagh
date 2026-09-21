import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  // legacy rows whose MY-group offering lacks enrollment, but ANOTHER group offering has one
  const r = await pool.query(`
    SELECT COUNT(*) AS risky_rows, COUNT(DISTINCT s.id) AS students
    FROM legacy_grades lg
    JOIN students s ON s."studentCode" = lg."studentCode" AND s."universityId" = 1
    JOIN academic_terms t ON t."termCode" = lg."termCode" AND t."universityId" = 1
    JOIN courses c ON c.code = lg."courseCode" AND c."universityId" = 1
    JOIN course_offerings co_mine ON co_mine."termId" = t.id AND co_mine."courseId" = c.id
      AND co_mine."groupNumber" = CASE WHEN (lg.raw::json->>'group') ~ '^\\d+$' THEN (lg.raw::json->>'group')::int ELSE 1 END
    WHERE lg."sourceCode" = 'AFAGH'
      AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e."studentId" = s.id AND e."offeringId" = co_mine.id)
      AND EXISTS (
        SELECT 1 FROM course_offerings co2
        JOIN enrollments e2 ON e2."offeringId" = co2.id AND e2."studentId" = s.id
        WHERE co2."termId" = t.id AND co2."courseId" = c.id AND co2.id <> co_mine.id
      )
  `);
  console.log('rows at risk of duplicate enrollment:', r.rows[0]);

  // group values actually present in raw for AFAGH
  const g = await pool.query(`
    SELECT lg.raw::json->>'group' AS grp, COUNT(*) AS n
    FROM legacy_grades lg WHERE lg."sourceCode" = 'AFAGH'
    GROUP BY 1 ORDER BY 2 DESC LIMIT 10
  `);
  console.log('raw group distribution:');
  console.table(g.rows);
  await pool.end();
}
main().catch(console.error);
