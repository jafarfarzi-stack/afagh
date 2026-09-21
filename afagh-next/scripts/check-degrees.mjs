import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  const d = await pool.query(`SELECT id, code, title, level FROM degree_level_configs ORDER BY id`);
  console.log(d.rows);
  const m = await pool.query(`SELECT m."majorCode", m.name, m."degreeLevelId", dl.title as dl_title, count(s.id) as scount FROM students s JOIN majors m ON m.id=s."majorId" LEFT JOIN degree_level_configs dl ON dl.id=m."degreeLevelId" WHERE s."universityId"=1 GROUP BY 1,2,3,4 ORDER BY 5 DESC LIMIT 20`);
  console.log(m.rows);
}
main().catch(console.error).finally(() => pool.end());
