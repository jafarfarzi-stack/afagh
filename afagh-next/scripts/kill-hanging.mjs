import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  await pool.query(`SELECT pg_terminate_backend(93464)`);
  console.log('Terminated 93464');
}

main().catch(console.error).finally(() => pool.end());
