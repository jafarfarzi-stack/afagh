import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const client = await pool.connect();
  try {
    console.log('1) Creating temp table with legacy Sama status codes...');
    console.time('match');
    await client.query(`
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

    console.log('2) Indexing temp table...');
    console.time('index');
    await client.query(`CREATE INDEX idx_tmp_enr ON tmp_enr_codes (enrollment_id);`);
    console.timeEnd('index');

    console.log('3) Updating enrollments...');
    console.time('update');
    const u = await client.query(`
      UPDATE enrollments e
      SET "samaGradeStatusCode" = t.sama_code
      FROM tmp_enr_codes t
      WHERE e.id = t.enrollment_id
        AND (e."samaGradeStatusCode" IS DISTINCT FROM t.sama_code);
    `);
    console.timeEnd('update');
    console.log('Updated enrollments rows:', u.rowCount);

    console.log('4) Aggregating codes in enrollments:');
    const stats = await client.query(`
      SELECT "samaGradeStatusCode", COUNT(*) as cnt
      FROM enrollments
      GROUP BY "samaGradeStatusCode"
      ORDER BY cnt DESC
      LIMIT 25;
    `);
    console.table(stats.rows);
  } finally {
    client.release();
    pool.end();
  }
}

main().catch(console.error);
