import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sama2 = (await client.query(`SELECT id FROM degree_level_configs WHERE code = 'SAMA-2'`)).rows[0].id;
    const sama1 = (await client.query(`SELECT id FROM degree_level_configs WHERE code = 'SAMA-1'`)).rows[0].id;

    // 1. majors SHAMS: 1161/1162/1261/1221 (SAMA-4) + 1171/1181 (SAMA-3) -> SAMA-2 ; 1163 -> SAMA-1
    const m1 = await client.query(`
      UPDATE majors SET "degreeLevelId" = $1
      WHERE "universityId" = 4 AND "majorCode" IN ('1161','1162','1261','1221','1171','1181')
      RETURNING "majorCode"
    `, [sama2]);
    console.log('majors -> SAMA-2:', m1.rows.map(r => r.majorCode).join(','));

    const m2 = await client.query(`
      UPDATE majors SET "degreeLevelId" = $1
      WHERE "universityId" = 4 AND "majorCode" = '1163'
      RETURNING "majorCode"
    `, [sama1]);
    console.log('majors -> SAMA-1:', m2.rows.map(r => r.majorCode).join(','));

    // 2. students in those majors -> same degree
    const s1 = await client.query(`
      UPDATE students s SET "degreeLevelId" = $1
      FROM majors m
      WHERE s."majorId" = m.id AND m."universityId" = 4
        AND m."majorCode" IN ('1161','1162','1261','1221','1171','1181')
        AND s."degreeLevelId" IS DISTINCT FROM $1
    `, [sama2]);
    console.log('students -> SAMA-2:', s1.rowCount);

    const s2 = await client.query(`
      UPDATE students s SET "degreeLevelId" = $1
      FROM majors m
      WHERE s."majorId" = m.id AND m."universityId" = 4 AND m."majorCode" = '1163'
        AND s."degreeLevelId" IS DISTINCT FROM $1
    `, [sama1]);
    console.log('students -> SAMA-1:', s2.rowCount);

    // 3. verify no SAMA-3/4 left in SHAMS
    const chk = await client.query(`
      SELECT d.code, COUNT(*) AS n FROM students s
      LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"
      WHERE s."universityId" = 4 GROUP BY 1 ORDER BY 2 DESC
    `);
    console.log('SHAMS degrees after fix:');
    console.table(chk.rows);

    await client.query('COMMIT');
    console.log('COMMITTED');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('ROLLED BACK:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}
main();
