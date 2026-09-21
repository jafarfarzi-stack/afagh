import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const r = await pool.query(`
    UPDATE courses
    SET "defaultAcceptMarkState" = '1',
        "defaultRejectMarkState" = '2'
    WHERE "defaultAcceptMarkState" IS NULL
  `);
  console.log('Filled remaining NULL accept/reject codes:', r.rowCount);
  await pool.end();
}

main().catch(console.error);
