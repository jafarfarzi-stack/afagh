import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  // 1. restore explicit fail codes (merge into existing rulesConfig)
  const map = { 12: '931', 15: '931', 14: '-91', 16: '941', 17: '941', 13: '2' };
  for (const [id, code] of Object.entries(map)) {
    const r = await pool.query(`SELECT "rulesConfig" FROM educational_regulations WHERE id = $1`, [id]);
    const cfg = JSON.parse(r.rows[0].rulesConfig);
    cfg.grading_and_gpa = cfg.grading_and_gpa || {};
    cfg.grading_and_gpa.failed_sama_status_code = code;
    await pool.query(`UPDATE educational_regulations SET "rulesConfig" = $1 WHERE id = $2`, [JSON.stringify(cfg), id]);
    console.log(`reg ${id}: explicit fail code = ${code}`);
  }

  // 2. per-major reg distribution for the 7 affected majors
  const d = await pool.query(`
    SELECT s."saminLocalFieldCode" AS major, r.title AS reg, r.id AS regId, COUNT(*) AS n
    FROM students s LEFT JOIN educational_regulations r ON r.id = s."regulationId"
    WHERE s."universityId" = 4 AND s."saminLocalFieldCode" IN ('1161','1162','1261','1171','1181','1221','1163')
    GROUP BY 1, 2, 3 ORDER BY 1, 4 DESC
  `);
  console.log('\nReg distribution per affected major:');
  console.table(d.rows);
  await pool.end();
}
main().catch(console.error);
