import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db' });

const FAIL_CODE_BY_TITLE = {
  'آیین‌نامه ۱۳۹۳': '931',
  'آیین‌نامه ۱۴۰۲ — کاردانی و کارشناسی': '931',
  'آیین‌نامه ۱۳۹۱': '-91',
  'آیین‌نامه ۱۳۹۴ — کارشناسی ارشد': '941',
  'آیین‌نامه ۱۳۹۴ — دکتری تخصصی': '941',
  'آیین‌نامه ماقبل ۱۳۹۱': '2',
};

async function main() {
  const all = (await pool.query(`SELECT id, title, "rulesConfig" FROM educational_regulations`)).rows;
  let updated = 0;
  for (const row of all) {
    const want = FAIL_CODE_BY_TITLE[row.title];
    if (!want) continue;
    let cfg;
    try { cfg = JSON.parse(row.rulesConfig || '{}'); } catch { continue; }
    cfg.grading_and_gpa = cfg.grading_and_gpa || {};
    if (cfg.grading_and_gpa.failed_sama_status_code === want) continue;
    cfg.grading_and_gpa.failed_sama_status_code = want;
    await pool.query(`UPDATE educational_regulations SET "rulesConfig" = $1 WHERE id = $2`, [JSON.stringify(cfg), row.id]);
    console.log(`reg ${row.id} (${row.title}): failed_sama_status_code = ${want}`);
    updated++;
  }
  console.log(`Regulations updated: ${updated}`);

  const shams = (await pool.query(`SELECT id FROM universities WHERE code = 'SHAMS'`)).rows[0];
  if (shams) {
    const d = await pool.query(`
      SELECT s."saminLocalFieldCode" AS major, r.title AS reg, r.id AS regId, COUNT(*) AS n
      FROM students s LEFT JOIN educational_regulations r ON r.id = s."regulationId"
      WHERE s."universityId" = $1 AND s."saminLocalFieldCode" IN ('1161','1162','1261','1171','1181','1221','1163')
      GROUP BY 1, 2, 3 ORDER BY 1, 4 DESC
    `, [shams.id]);
    console.log('\nReg distribution per affected SHAMS major:');
    console.table(d.rows);
  }
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
