import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function check() {
  const res = await pool.query(`
    SELECT pg_get_indexdef(indexrelid) 
    FROM pg_index 
    WHERE indrelid = 'legacy_grades'::regclass
  `);
  console.log(res.rows);
}
check().finally(() => pool.end());
