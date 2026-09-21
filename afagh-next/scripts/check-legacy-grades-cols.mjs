import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const cols = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'legacy_grades'
  `);
  console.log(cols.rows.map(r => r.column_name));
}

main().catch(console.error).finally(() => pool.end());
