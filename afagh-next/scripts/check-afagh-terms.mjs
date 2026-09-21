import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const r = await pool.query('SELECT "termCode", title FROM academic_terms WHERE "universityId" = 1 ORDER BY "termCode"');
  console.log('Terms for AFAGH in academic_terms:', r.rows);
}

main().catch(console.error).finally(() => pool.end());
