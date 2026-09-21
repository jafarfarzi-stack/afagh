import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  // Same majorCodes in AFAGH vs SHAMS: what degree does AFAGH assign?
  const r = await pool.query(`
    SELECT m."majorCode", m.name, d.code AS degree, m."universityId", COUNT(*) OVER (PARTITION BY m."majorCode", m."universityId") AS x,
      (SELECT COUNT(*) FROM students s WHERE s."majorId" = m.id) AS students
    FROM majors m LEFT JOIN degree_level_configs d ON d.id = m."degreeLevelId"
    WHERE m."majorCode" IN ('1162','1261','1161','1171','1181','1221')
    ORDER BY m."majorCode", m."universityId"
  `);
  console.table(r.rows);

  // Full SHAMS major list with degrees + student counts
  const s = await pool.query(`
    SELECT m."majorCode", m.name, d.code AS degree, d.title AS degTitle,
      (SELECT COUNT(*) FROM students s2 WHERE s2."majorId" = m.id) AS students
    FROM majors m LEFT JOIN degree_level_configs d ON d.id = m."degreeLevelId"
    WHERE m."universityId" = 4 ORDER BY m."majorCode"
  `);
  console.log('ALL SHAMS majors:');
  console.table(s.rows);
  await pool.end();
}
main().catch(console.error);
