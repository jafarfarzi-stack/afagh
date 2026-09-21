import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function check() {
  const plan = await pool.query(`
    EXPLAIN
    UPDATE enrollments e
    SET "samaGradeStatusCode" = (lg.raw::json->>'markStat')
    FROM students s, course_offerings o, courses c, academic_terms t, legacy_grades lg
    WHERE s.id = e."studentId"
      AND o.id = e."offeringId"
      AND c.id = o."courseId"
      AND t.id = o."termId"
      AND lg."studentCode" = s."studentCode"
      AND lg."termCode" = t."termCode"
      AND lg."courseCode" = c.code
      AND e."samaGradeStatusCode" IS NULL
      AND (lg.raw::json->>'markStat') IS NOT NULL
  `);
  console.log(plan.rows.map(r => r['QUERY PLAN']).join('\n'));
}
check().finally(() => pool.end());
