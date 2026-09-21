import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  const m = await pool.query(`
    SELECT m."majorCode", m.name AS majorName, d2.code AS majorDegree, s."saminLocalFieldCode", COUNT(*) AS n
    FROM students s
    LEFT JOIN majors m ON m.id = s."majorId"
    LEFT JOIN degree_level_configs d2 ON d2.id = m."degreeLevelId"
    WHERE s."universityId" = 4 AND s."degreeLevelId" = (SELECT id FROM degree_level_configs WHERE code = 'SAMA-4')
    GROUP BY 1, 2, 3, 4 ORDER BY 5 DESC LIMIT 20
  `);
  console.log('SHAMS SAMA-4 (دکتری حرفه‌ای?!) students — actual majors:');
  console.table(m.rows);

  const m3 = await pool.query(`
    SELECT m."majorCode", m.name AS majorName, d2.code AS majorDegree, s."saminLocalFieldCode", COUNT(*) AS n
    FROM students s
    LEFT JOIN majors m ON m.id = s."majorId"
    LEFT JOIN degree_level_configs d2 ON d2.id = m."degreeLevelId"
    WHERE s."universityId" = 4 AND s."degreeLevelId" = (SELECT id FROM degree_level_configs WHERE code = 'SAMA-3')
    GROUP BY 1, 2, 3, 4 ORDER BY 5 DESC LIMIT 20
  `);
  console.log('SHAMS SAMA-3 (ارشد?!) students — actual majors:');
  console.table(m3.rows);

  // and what degrees do the MAJORS themselves carry for SHAMS?
  const md = await pool.query(`
    SELECT d.code, COUNT(*) AS majors, (SELECT COUNT(*) FROM students s WHERE s."majorId" = m.id) AS x
    FROM majors m LEFT JOIN degree_level_configs d ON d.id = m."degreeLevelId"
    WHERE m."universityId" = 4 GROUP BY d.code ORDER BY 2 DESC
  `);
  console.log('SHAMS majors by their own degreeLevel:');
  console.table(md.rows);
  await pool.end();
}
main().catch(console.error);
