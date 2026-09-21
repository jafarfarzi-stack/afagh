import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  const r = await pool.query(`SELECT id, title, "rulesConfig" FROM educational_regulations WHERE id IN (12,13,14)`);
  for (const row of r.rows) {
    console.log('===', row.id, row.title, '===');
    console.log(row.rulesConfig.slice(0, 2000));
    console.log();
  }
}
main().catch(console.error).finally(() => pool.end());
