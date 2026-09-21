import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  // enrollments currently 931 that were 941 before the last engine run (from both CSVs)
  const r = await pool.query(`
    SELECT s."universityId", d.code AS degree, d.title AS degTitle, r.title AS reg, COUNT(*) AS n
    FROM enrollments e
    JOIN students s ON s.id = e."studentId"
    LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"
    LEFT JOIN educational_regulations r ON r.id = s."regulationId"
    WHERE e."samaGradeStatusCode" = '931'
      AND e."originalSamaCode" = '941'
    GROUP BY 1, 2, 3, 4 ORDER BY 1, 5 DESC
  `);
  console.log('Current 931s that were originally 941 (by uni/degree/reg):');
  console.table(r.rows);

  // what did the refreshed regConfig set for 1394MS / 1394PHD?
  const regs = await pool.query(`SELECT id, title, "rulesConfig" FROM educational_regulations WHERE title LIKE '%۱۳۹۴%'`);
  for (const row of regs.rows) {
    console.log(row.id, row.title, '=>', row.rulesConfig);
  }
  await pool.end();
}
main().catch(console.error);
