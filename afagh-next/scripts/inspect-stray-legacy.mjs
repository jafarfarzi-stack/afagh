import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  console.log('=== AFAGH: 3 legacy students NOT in students table ===');
  const a = await pool.query(`
    SELECT lg."studentCode", lg."termCode", lg."courseCode", lg."courseTitle", lg.raw
    FROM legacy_grades lg
    LEFT JOIN students s ON s."studentCode" = lg."studentCode" AND s."universityId" = 1
    WHERE lg."sourceCode" = 'AFAGH' AND s.id IS NULL
  `);
  console.table(a.rows.map(r => ({ code: r.studentCode, term: r.termCode, course: r.courseCode, title: r.courseTitle })));

  console.log('\n=== NAZHAND: 29 legacy students NOT in students table ===');
  const n = await pool.query(`
    SELECT lg."studentCode", COUNT(*) AS rows, MIN(lg."termCode") AS firstTerm, MAX(lg."termCode") AS lastTerm
    FROM legacy_grades lg
    LEFT JOIN students s ON s."studentCode" = lg."studentCode" AND s."universityId" = 5
    WHERE lg."sourceCode" = 'NAZHAND' AND s.id IS NULL
    GROUP BY lg."studentCode"
  `);
  console.table(n.rows);

  console.log('\nAre NAZHAND missing students present under other universities?');
  const cross = await pool.query(`
    SELECT s."universityId", COUNT(DISTINCT lg."studentCode") AS n
    FROM legacy_grades lg
    JOIN students s ON s."studentCode" = lg."studentCode"
    WHERE lg."sourceCode" = 'NAZHAND' AND s."universityId" != 5
    GROUP BY 1
  `);
  console.table(cross.rows);

  await pool.end();
}
main().catch(console.error);