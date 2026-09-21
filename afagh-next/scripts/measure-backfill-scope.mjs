import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  // legacy rows for students who have ZERO enrollments at all
  const r = await pool.query(`
    SELECT COUNT(*) AS rows, COUNT(DISTINCT s.id) AS students
    FROM legacy_grades lg
    JOIN students s ON s."studentCode" = lg."studentCode" AND s."universityId" = 1
    WHERE lg."sourceCode" = 'AFAGH' AND NOT EXISTS (
      SELECT 1 FROM enrollments e WHERE e."studentId" = s.id
    )
  `);
  console.log('rows for zero-enrollment students:', r.rows[0]);

  // dup groups: same student+term+course (group ignored, mirrors groupOf->1 mostly)
  const d = await pool.query(`
    SELECT COUNT(*) AS dup_groups, SUM(cnt - 1) AS extra_rows FROM (
      SELECT s.id AS sid, lg."termCode", lg."courseCode", COUNT(*) AS cnt
      FROM legacy_grades lg
      JOIN students s ON s."studentCode" = lg."studentCode" AND s."universityId" = 1
      WHERE lg."sourceCode" = 'AFAGH' AND NOT EXISTS (
        SELECT 1 FROM enrollments e WHERE e."studentId" = s.id
      )
      GROUP BY 1, 2, 3 HAVING COUNT(*) > 1
    ) t
  `);
  console.log('dup groups / extra rows:', d.rows[0]);

  // distinct (term,course,group) combos lacking offerings
  const o = await pool.query(`
    SELECT COUNT(*) AS n FROM (
      SELECT DISTINCT t.id AS tid, c.id AS cid,
        CASE WHEN (lg.raw::json->>'group') ~ '^\\d+$' THEN (lg.raw::json->>'group')::int ELSE 1 END AS grp
      FROM legacy_grades lg
      JOIN students s ON s."studentCode" = lg."studentCode" AND s."universityId" = 1
      JOIN academic_terms t ON t."termCode" = lg."termCode" AND t."universityId" = 1
      JOIN courses c ON c.code = lg."courseCode" AND c."universityId" = 1
      WHERE lg."sourceCode" = 'AFAGH' AND NOT EXISTS (
        SELECT 1 FROM enrollments e WHERE e."studentId" = s.id
      )
    ) combos
    WHERE NOT EXISTS (
      SELECT 1 FROM course_offerings co
      WHERE co."termId" = combos.tid AND co."courseId" = combos.cid AND co."groupNumber" = combos.grp
    )
  `);
  console.log('combos lacking offering:', o.rows[0]);

  // any rows with unresolvable term/course?
  const m = await pool.query(`
    SELECT COUNT(*) FILTER (WHERE t.id IS NULL) AS no_term,
           COUNT(*) FILTER (WHERE c.id IS NULL) AS no_course,
           COUNT(*) AS total
    FROM legacy_grades lg
    JOIN students s ON s."studentCode" = lg."studentCode" AND s."universityId" = 1
    LEFT JOIN academic_terms t ON t."termCode" = lg."termCode" AND t."universityId" = 1
    LEFT JOIN courses c ON c.code = lg."courseCode" AND c."universityId" = 1
    WHERE lg."sourceCode" = 'AFAGH' AND NOT EXISTS (
      SELECT 1 FROM enrollments e WHERE e."studentId" = s.id
    )
  `);
  console.log('resolvability:', m.rows[0]);
  await pool.end();
}
main().catch(console.error);
