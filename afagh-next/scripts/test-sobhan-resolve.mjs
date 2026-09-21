import pg from 'pg';
import { resolveSamaGradeStatusCode } from '../src/lib/resolve-sama-code.js';

const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const en = (await pool.query(`
    SELECT e.id, e."studentId", e."offeringId", e."gradeValue", e."samaGradeStatusCode", e."originalSamaCode", c.code
    FROM enrollments e
    JOIN course_offerings co ON co.id = e."offeringId"
    JOIN courses c ON c.id = co."courseId"
    WHERE e.id = 283158
  `)).rows[0];

  console.log('Enrollment before test:', en);

  // Let's test what resolveSamaGradeStatusCode returns
  // Note: resolveSamaGradeStatusCode uses drizzle db, let's see if we can import it
  await pool.end();
}

main().catch(console.error);
