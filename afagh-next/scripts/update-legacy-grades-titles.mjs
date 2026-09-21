import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  console.log('Starting batch update of legacy_grades courseTitle & units...');
  let totalUpdated = 0;
  let hasMore = true;

  while (hasMore) {
    const res = await pool.query(`
      WITH batch AS (
        SELECT id
        FROM legacy_grades
        WHERE "sourceCode" = 'AFAGH' AND "courseTitle" IS NULL
        LIMIT 25000
      )
      UPDATE legacy_grades lg
      SET "courseTitle" = c.title,
          units = c.units
      FROM courses c, batch b
      WHERE lg.id = b.id
        AND lg."courseCode" = c.code
        AND c."universityId" = 1
    `);

    totalUpdated += res.rowCount;
    console.log(`Batch updated ${res.rowCount} rows. Total so far: ${totalUpdated}`);

    // If fewer than batch limit or 0 updated, check if any nulls remain that might not match courses
    if (res.rowCount === 0) {
      hasMore = false;
    }
  }

  // Check how many remain with null
  const rem = await pool.query(`
    SELECT count(*)
    FROM legacy_grades
    WHERE "sourceCode" = 'AFAGH' AND "courseTitle" IS NULL
  `);
  console.log(`Remaining legacy_grades with null courseTitle: ${rem.rows[0].count}`);

  // For any courses that still don't have a title in legacy_grades, give a sensible default if any
  if (parseInt(rem.rows[0].count) > 0) {
    const fallbackRes = await pool.query(`
      UPDATE legacy_grades
      SET "courseTitle" = 'درس ' || "courseCode",
          units = 0
      WHERE "sourceCode" = 'AFAGH' AND "courseTitle" IS NULL
    `);
    console.log(`Updated ${fallbackRes.rowCount} orphan course codes with fallback title.`);
  }

  console.log('Finished updating legacy_grades.');
}

main().catch(console.error).finally(() => pool.end());
