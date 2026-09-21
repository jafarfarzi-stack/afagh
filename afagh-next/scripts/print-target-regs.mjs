import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const regs = await pool.query(`SELECT id, title, "rulesConfig" FROM educational_regulations WHERE id IN (12, 13, 14, 16, 17) ORDER BY id;`);
  for (const r of regs.rows) {
    console.log(`=== Reg ${r.id}: ${r.title} ===`);
    console.log(JSON.stringify(JSON.parse(r.rulesConfig), null, 2));
  }
}

main().finally(() => pool.end());
