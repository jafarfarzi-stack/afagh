import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function check() {
  const stats = await pool.query(`
    SELECT DISTINCT (lg.raw::json->>'markStat') as stat, COUNT(*) as cnt
    FROM legacy_grades lg
    WHERE lg.raw IS NOT NULL
    GROUP BY stat
    ORDER BY cnt DESC
  `);
  const maps = await pool.query(`SELECT "legacyCode", "legacyTitle" FROM legacy_code_maps WHERE domain='GRADE_STATUS'`);
  const titleMap = new Map(maps.rows.map(r => [r.legacyCode, r.legacyTitle]));
  for (const s of stats.rows) {
    console.log(`${s.stat.padEnd(6)} : count=${s.cnt.padEnd(8)} title=${titleMap.get(s.stat) || 'UNKNOWN'}`);
  }
}
check().finally(() => pool.end());
