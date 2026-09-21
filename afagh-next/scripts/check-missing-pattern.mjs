import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  // 1. Students with '-' suffix (duplicate stno handling)
  const dash = await pool.query(`SELECT COUNT(*) AS n FROM students WHERE "studentCode" LIKE '%-%' AND "universityId" = 1`);
  console.log('AFAGH students with dash in code:', dash.rows[0].n);

  // 2. Sample missing codes: check name presence in source files? First check DB variants
  const samples = ['4001156750', '4001156751', '4001156752'];
  for (const sc of samples) {
    const r = await pool.query(`SELECT "studentCode", "universityId" FROM students WHERE "studentCode" LIKE $1`, [`${sc}%`]);
    console.log(sc, '->', JSON.stringify(r.rows));
    const lg = await pool.query(`SELECT "termCode", "courseCode", "gradeValue", "courseTitle" FROM legacy_grades WHERE "sourceCode"='AFAGH' AND "studentCode"=$1 LIMIT 3`, [sc]);
    console.log('  legacy rows:', lg.rows.length, JSON.stringify(lg.rows[0]));
  }

  // 3. Distribution of missing students by entry-year prefix
  const pref = await pool.query(`
    SELECT SUBSTRING(lg."studentCode" FROM 1 FOR 4) AS pref, COUNT(DISTINCT lg."studentCode") AS n, COUNT(*) AS recs
    FROM legacy_grades lg
    LEFT JOIN students s ON s."studentCode" = lg."studentCode" AND s."universityId" = 1
    WHERE lg."sourceCode" = 'AFAGH' AND s.id IS NULL
    GROUP BY 1 ORDER BY 2 DESC
  `);
  console.log('Missing students by code prefix:');
  console.table(pref.rows);

  // 4. Distribution of ALL AFAGH legacy students by prefix (for comparison)
  const all = await pool.query(`
    SELECT SUBSTRING("studentCode" FROM 1 FOR 4) AS pref, COUNT(DISTINCT "studentCode") AS n
    FROM legacy_grades WHERE "sourceCode" = 'AFAGH'
    GROUP BY 1 ORDER BY 2 DESC LIMIT 15
  `);
  console.log('All AFAGH legacy students by prefix:');
  console.table(all.rows);

  await pool.end();
}
main().catch(console.error);
