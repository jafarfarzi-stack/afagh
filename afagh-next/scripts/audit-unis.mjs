import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const c = await pool.connect();
  try {
    // universities
    const unis = await c.query(`SELECT id, code, title FROM universities ORDER BY id`);
    console.log('UNIVERSITIES:', JSON.stringify(unis.rows));
    // duplicate studentCodes across universities
    const dups = await c.query(`
      SELECT "studentCode", COUNT(*) as n, string_agg(DISTINCT "universityId"::text, ',') as unis
      FROM students GROUP BY "studentCode" HAVING COUNT(*) > 1 ORDER BY n DESC LIMIT 15
    `);
    console.log(`dup codes: ${dups.rows.length} shown of ...`);
    for (const r of dups.rows) console.log('  ', JSON.stringify(r));
    const dupCount = await c.query(`SELECT COUNT(*) as n FROM (SELECT "studentCode" FROM students GROUP BY "studentCode" HAVING COUNT(*) > 1) t`);
    console.log('total dup studentCodes:', dupCount.rows[0].n);
    // students per university
    const per = await c.query(`SELECT "universityId", COUNT(*) as n FROM students GROUP BY "universityId" ORDER BY 1`);
    console.log('students per uni:', JSON.stringify(per.rows));
  } finally { c.release(); await pool.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
