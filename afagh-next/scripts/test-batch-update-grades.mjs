import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const start = Date.now();
  // Create index on courses(code, universityId) if not exists
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_courses_code_uni ON courses (code, "universityId")`);

  const res = await pool.query(`
    UPDATE legacy_grades lg
    SET "courseTitle" = c.title,
        units = c.units
    FROM courses c
    WHERE lg."courseCode" = c.code
      AND c."universityId" = 1
      AND lg."sourceCode" = 'AFAGH'
      AND lg.id IN (
        SELECT id FROM legacy_grades
        WHERE "sourceCode" = 'AFAGH' AND "courseTitle" IS NULL
        LIMIT 10000
      )
  `);
  console.log(`Updated ${res.rowCount} rows in ${Date.now() - start}ms`);
}

main().catch(console.error).finally(() => pool.end());
