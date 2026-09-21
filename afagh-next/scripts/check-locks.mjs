import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const locks = await pool.query(`
    SELECT pid, state, query_start, query
    FROM pg_stat_activity
    WHERE datname = 'afagh_db' AND state != 'idle'
  `);
  console.log('Active queries:', locks.rows);
}

main().catch(console.error).finally(() => pool.end());
