import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
const SRC2UNI = { AFAGH: 1, ZARINE: 2, ALLAME: 3, SHAMS: 4, NAZHAND: 5 };

async function main() {
  const c = await pool.connect();
  try {
    for (const [src, uni] of Object.entries(SRC2UNI)) {
      console.log(`--- ${src} (uni ${uni}) ---`);
      const t0 = Date.now();
      const r = await c.query(`
        SELECT COUNT(*) AS legacy_rows,
          COUNT(DISTINCT lg."studentCode") AS legacy_students,
          COUNT(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM students s
            JOIN enrollments e ON e."studentId" = s.id
            JOIN course_offerings co ON co.id = e."offeringId"
            JOIN academic_terms t ON t.id = co."termId"
            JOIN courses cu ON cu.id = co."courseId"
            WHERE s."studentCode" = lg."studentCode" AND s."universityId" = $2
              AND t."termCode" = lg."termCode" AND cu.code = lg."courseCode"
          )) AS promoted_rows
        FROM legacy_grades lg WHERE lg."sourceCode" = $1
      `, [src, uni]);
      console.log(`  ${JSON.stringify(r.rows[0])} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      const miss = await c.query(`
        SELECT lg."gradeStatus" AS st, COUNT(*) AS n
        FROM legacy_grades lg WHERE lg."sourceCode" = $1
          AND NOT EXISTS (
            SELECT 1 FROM students s
            JOIN enrollments e ON e."studentId" = s.id
            JOIN course_offerings co ON co.id = e."offeringId"
            JOIN academic_terms t ON t.id = co."termId"
            JOIN courses cu ON cu.id = co."courseId"
            WHERE s."studentCode" = lg."studentCode" AND s."universityId" = $2
              AND t."termCode" = lg."termCode" AND cu.code = lg."courseCode"
          )
        GROUP BY lg."gradeStatus" ORDER BY n DESC
      `, [src, uni]);
      console.log(`  missing by status: ${JSON.stringify(miss.rows)}`);
    }
  } finally { c.release(); await pool.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
