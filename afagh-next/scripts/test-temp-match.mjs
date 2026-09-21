import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });
async function test() {
  console.time('match');
  const client = await pool.connect();
  try {
    const res = await client.query(`
      CREATE TEMP TABLE tmp_enr_codes AS
      SELECT e.id as enrollment_id, (lg.raw::json->>'markStat') as sama_code
      FROM enrollments e
      JOIN students s ON s.id = e."studentId"
      JOIN course_offerings o ON o.id = e."offeringId"
      JOIN courses c ON c.id = o."courseId"
      JOIN academic_terms t ON t.id = o."termId"
      JOIN legacy_grades lg ON lg."studentCode" = s."studentCode" AND lg."termCode" = t."termCode" AND lg."courseCode" = c.code
      WHERE (lg.raw::json->>'markStat') IS NOT NULL;
    `);
    console.timeEnd('match');
    const cnt = await client.query(`SELECT count(*), count(distinct enrollment_id) FROM tmp_enr_codes`);
    console.log('matched rows:', cnt.rows[0]);
  } finally {
    client.release();
    pool.end();
  }
}
test();
