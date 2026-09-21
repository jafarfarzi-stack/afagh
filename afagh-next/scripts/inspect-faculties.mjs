import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const facs = await pool.query('SELECT * FROM faculties ORDER BY id');
  console.log('Faculties:', facs.rows);
}

main().catch(console.error).finally(() => pool.end());
