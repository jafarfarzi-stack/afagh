import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  const l = await pool.query(`
    SELECT COUNT(DISTINCT s.id) AS students, COUNT(lg.id) AS legacyRows
    FROM students s LEFT JOIN legacy_grades lg ON lg."studentCode" = s."studentCode" AND lg."sourceCode" = 'SHAMS'
    WHERE s."universityId" = 4 AND s."saminLocalFieldCode" = '1221'
  `);
  console.log('1221 students / legacy rows:', l.rows[0]);

  // how do SHAMS regs correlate with studentCode prefix?
  const p = await pool.query(`
    SELECT SUBSTRING(s."studentCode" FROM 1 FOR 2) AS pref, r.title AS reg, COUNT(*) AS n
    FROM students s LEFT JOIN educational_regulations r ON r.id = s."regulationId"
    WHERE s."universityId" = 4
    GROUP BY 1, 2 ORDER BY 1, 2
  `);
  console.table(p.rows);
  await pool.end();
}
main().catch(console.error);
