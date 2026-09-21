import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  const cols = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='educational_regulations' ORDER BY ordinal_position`);
  console.log(cols.rows);
  const rows = await pool.query(`SELECT id, title, code, "isActive" FROM educational_regulations ORDER BY id`);
  console.log('regs:', rows.rows);
  const scols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='students' AND column_name ILIKE '%reg%'`);
  console.log('student reg cols:', scols.rows);
  const sdist = await pool.query(`SELECT "regulationId", count(*) FROM students GROUP BY 1 ORDER BY 2 DESC`);
  console.log('student regulation dist:', sdist.rows);
}
main().catch(console.error).finally(() => pool.end());
