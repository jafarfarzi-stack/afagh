import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  // entryYear x current reg for the mis-mapped majors
  const r = await pool.query(`
    SELECT s."entryYear", r.title AS reg, COUNT(*) AS n
    FROM students s LEFT JOIN educational_regulations r ON r.id = s."regulationId"
    WHERE s."universityId" = 4 AND s."saminLocalFieldCode" IN ('1161','1162','1261','1171','1181','1221','1163')
    GROUP BY 1, 2 ORDER BY 1, 2
  `);
  console.log('Mis-mapped SHAMS students by entryYear/reg:');
  console.table(r.rows);

  // correct pattern: what regs do SAMA-1/5 SHAMS students have by entry year?
  const ok = await pool.query(`
    SELECT s."entryYear", r.title AS reg, COUNT(*) AS n
    FROM students s LEFT JOIN educational_regulations r ON r.id = s."regulationId"
    WHERE s."universityId" = 4 AND s."degreeLevelId" IN (
      SELECT id FROM degree_level_configs WHERE code IN ('SAMA-1','SAMA-5'))
    GROUP BY 1, 2 ORDER BY 1, 2 LIMIT 30
  `);
  console.log('Correctly-mapped SHAMS (SAMA-1/5) regs by entryYear:');
  console.table(ok.rows);

  // 1221 students: any other clue? terms span?
  const g = await pool.query(`
    SELECT s."studentCode", s."entryYear", s."entryTerm", COUNT(e.id) AS enrs
    FROM students s LEFT JOIN enrollments e ON e."studentId" = s.id
    WHERE s."universityId" = 4 AND s."saminLocalFieldCode" = '1221'
    GROUP BY 1, 2, 3 ORDER BY 1 LIMIT 10
  `);
  console.log('1221 sample:');
  console.table(g.rows);
  await pool.end();
}
main().catch(console.error);
