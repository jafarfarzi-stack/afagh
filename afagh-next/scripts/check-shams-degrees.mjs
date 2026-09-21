import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  console.log('=== SHAMS students by degreeLevel ===');
  const d = await pool.query(`
    SELECT d.code, d.title, d."defaultPassingGrade", COUNT(*) AS n
    FROM students s LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"
    WHERE s."universityId" = 4 GROUP BY 1, 2, 3 ORDER BY 4 DESC
  `);
  console.table(d.rows);

  console.log('=== SHAMS students by regulation ===');
  const r = await pool.query(`
    SELECT r.title, COUNT(*) AS n
    FROM students s LEFT JOIN educational_regulations r ON r.id = s."regulationId"
    WHERE s."universityId" = 4 GROUP BY 1 ORDER BY 2 DESC
  `);
  console.table(r.rows);

  console.log('=== SHAMS majors (reshetteh) sample ===');
  const m = await pool.query(`
    SELECT m."majorCode", m.title, COUNT(*) AS n
    FROM students s LEFT JOIN majors m ON m.id = s."majorId"
    WHERE s."universityId" = 4 GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 15
  `);
  console.table(m.rows);

  console.log('=== degree_level_configs full list ===');
  const all = await pool.query(`SELECT id, code, title, "defaultPassingGrade", "universityId" FROM degree_level_configs ORDER BY id`);
  console.table(all.rows);
  await pool.end();
}
main().catch(console.error);
