import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  const rows = await pool.query(`SELECT id, title, "degreeLevelId", "effectiveFromYear", "effectiveToYear", "universityId", left("rulesConfig",200) as rc FROM educational_regulations ORDER BY id`);
  console.log('regs:', JSON.stringify(rows.rows, null, 2));
  const sdist = await pool.query(`SELECT "regulationId", count(*) FROM students GROUP BY 1 ORDER BY 2 DESC`);
  console.log('student regulation dist:', sdist.rows);
  const sdist2 = await pool.query(`SELECT "regulationId", count(*) FROM students WHERE "universityId"=1 GROUP BY 1 ORDER BY 2 DESC`);
  console.log('afagh student regulation dist:', sdist2.rows);
}
main().catch(console.error).finally(() => pool.end());
