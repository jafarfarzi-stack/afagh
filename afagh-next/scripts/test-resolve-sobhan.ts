import { resolveSamaGradeStatusCode } from '../src/lib/resolve-sama-code';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const en = (await pool.query(`
    SELECT e.id, e."studentId", e."offeringId", e."gradeValue", e."samaGradeStatusCode", e."originalSamaCode", c.code, c."defaultAcceptMarkState"
    FROM enrollments e
    JOIN course_offerings co ON co.id = e."offeringId"
    JOIN courses c ON c.id = co."courseId"
    WHERE e.id = 283158
  `)).rows[0];

  console.log('Enrollment 283158:', en);

  const resolved = await resolveSamaGradeStatusCode(en.studentId, en.offeringId, '20');
  console.log('Resolved Sama Code for 99064 (grade 20):', resolved);

  await pool.end();
}

main().catch(console.error);
