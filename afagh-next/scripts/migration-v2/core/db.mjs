import pg from 'pg';

const { Pool } = pg;

let pool = null;

export function getDbUrl(cliUrl) {
  return (
    cliUrl ||
    process.env.DATABASE_URL ||
    'postgres://afagh:afagh@localhost:5432/afagh_db'
  );
}

export function getPool(customDbUrl) {
  if (!pool) {
    const connectionString = getDbUrl(customDbUrl);
    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}

export async function query(text, params = [], customDbUrl) {
  const p = getPool(customDbUrl);
  return p.query(text, params);
}

export async function withTransaction(callback, customDbUrl) {
  const p = getPool(customDbUrl);
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function testConnection(customDbUrl) {
  const p = getPool(customDbUrl);
  const res = await p.query('SELECT 1 as alive');
  return res.rows?.[0]?.alive === 1;
}
