import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

const DROP_LIST = ['4','5','6','7','8','9','14','15','20','28','29','200','201','300','931','941','951','-91','-1','-3','-4','-5','-6','55','52'];

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. offerings مفقود (TRANSFER)
    const off = await client.query(`
      INSERT INTO course_offerings ("termId","courseId","groupNumber",capacity,"enrolledCount","offeringType","isActive","universityId")
      SELECT DISTINCT t.id, c.id,
        CASE WHEN (lg.raw::json->>'group') ~ '^\\d+$' THEN (lg.raw::json->>'group')::int ELSE 1 END,
        999, 0, 'TRANSFER', 1, 1
      FROM legacy_grades lg
      JOIN students s ON s."studentCode" = lg."studentCode" AND s."universityId" = 1
      JOIN academic_terms t ON t."termCode" = lg."termCode" AND t."universityId" = 1
      JOIN courses c ON c.code = lg."courseCode" AND c."universityId" = 1
      WHERE lg."sourceCode" = 'AFAGH'
        AND NOT EXISTS (
          SELECT 1 FROM course_offerings co
          WHERE co."termId" = t.id AND co."courseId" = c.id
            AND co."groupNumber" = CASE WHEN (lg.raw::json->>'group') ~ '^\\d+$' THEN (lg.raw::json->>'group')::int ELSE 1 END
        )
        AND NOT EXISTS (
          SELECT 1 FROM course_offerings co2
          JOIN enrollments e2 ON e2."offeringId" = co2.id AND e2."studentId" = s.id
          WHERE co2."termId" = t.id AND co2."courseId" = c.id
        )
      ON CONFLICT DO NOTHING
    `);
    console.log('offerings created:', off.rowCount);

    // 2. enrollments مفقود — منطق دقیق backfill-enrollments.mjs
    const enr = await client.query(`
      INSERT INTO enrollments ("studentId","offeringId",status,"gradeValue","gradeStatus","hasEvaluated","registeredAt","samaGradeStatusCode","originalSamaCode","universityId")
      SELECT s.id, co.id,
        CASE WHEN lg."gradeStatus" = 'DROPPED' OR (lg.raw::json->>'markStat') = ANY($1) THEN 'DROPPED' ELSE 'REGISTERED' END,
        CASE WHEN lg."gradeValue" IS NULL OR lg."gradeValue"::text = '' THEN NULL ELSE (lg."gradeValue"::text)::numeric END,
        lg."gradeStatus",
        CASE WHEN lg."gradeValue" IS NULL OR lg."gradeValue"::text = '' THEN 0 ELSE 1 END,
        COALESCE(t."startDate", now()),
        lg.raw::json->>'markStat',
        lg.raw::json->>'markStat',
        1
      FROM legacy_grades lg
      JOIN students s ON s."studentCode" = lg."studentCode" AND s."universityId" = 1
      JOIN academic_terms t ON t."termCode" = lg."termCode" AND t."universityId" = 1
      JOIN courses c ON c.code = lg."courseCode" AND c."universityId" = 1
      JOIN course_offerings co ON co."termId" = t.id AND co."courseId" = c.id
        AND co."groupNumber" = CASE WHEN (lg.raw::json->>'group') ~ '^\\d+$' THEN (lg.raw::json->>'group')::int ELSE 1 END
      WHERE lg."sourceCode" = 'AFAGH'
        AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e."studentId" = s.id AND e."offeringId" = co.id)
      ON CONFLICT ("studentId","offeringId") DO NOTHING
      RETURNING id
    `, [DROP_LIST]);
    console.log('enrollments created:', enr.rowCount);

    // 3. علامت‌گذاری legacy rows (همان منطق اسکریپت اصلی)
    const lg = await client.query(`
      UPDATE legacy_grades lg SET "compareStatus" = 'SAME', "compareNote" = 'بازسازی خودکار', "appliedAt" = now()
      FROM students s, academic_terms t, courses c, course_offerings co, enrollments e
      WHERE lg."sourceCode" = 'AFAGH'
        AND s."studentCode" = lg."studentCode" AND s."universityId" = 1
        AND t."termCode" = lg."termCode" AND t."universityId" = 1
        AND c.code = lg."courseCode" AND c."universityId" = 1
        AND co."termId" = t.id AND co."courseId" = c.id
        AND co."groupNumber" = CASE WHEN (lg.raw::json->>'group') ~ '^\\d+$' THEN (lg.raw::json->>'group')::int ELSE 1 END
        AND e."studentId" = s.id AND e."offeringId" = co.id
        AND (lg."compareStatus" IS NULL OR lg."compareStatus" <> 'SAME')
    `);
    console.log('legacy rows marked:', lg.rowCount);

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
