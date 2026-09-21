import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

const UNIS = [
  { id: 1, code: 'AFAGH' },
  { id: 2, code: 'ZARINE' },
  { id: 3, code: 'ALLAME' },
  { id: 4, code: 'SHAMS' },
  { id: 5, code: 'NAZHAND' },
];

async function main() {
  for (const u of UNIS) {
    console.log(`\n=========== ${u.code} (id=${u.id}) ===========`);
    const lg = (await pool.query(`SELECT COUNT(*) n, COUNT(DISTINCT "studentCode") s FROM legacy_grades WHERE "sourceCode" = $1`, [u.code])).rows[0];
    console.log(`legacy_grades: rows=${lg.n} distinctStudents=${lg.s}`);
    const en = (await pool.query(`SELECT COUNT(*) n FROM enrollments WHERE "universityId" = $1`, [u.id])).rows[0];
    console.log(`enrollments: ${en.n}`);
    const st = (await pool.query(`SELECT COUNT(*) n FROM students WHERE "universityId" = $1`, [u.id])).rows[0];
    console.log(`students: ${st.n}`);

    const miss = await pool.query(`
      SELECT COUNT(DISTINCT lg."studentCode") AS students, COUNT(*) AS rows
      FROM legacy_grades lg
      LEFT JOIN students s ON s."studentCode" = lg."studentCode" AND s."universityId" = $1
      WHERE lg."sourceCode" = $2 AND s.id IS NULL
    `, [u.id, u.code]);
    console.log('legacy students NOT in students table:', miss.rows[0]);

    const zero = await pool.query(`
      SELECT COUNT(*) AS n FROM students s
      WHERE s."universityId" = $1 AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e."studentId" = s.id)
    `, [u.id]);
    console.log('students with ZERO enrollments:', zero.rows[0].n);

    const noEnr = await pool.query(`
      SELECT COUNT(*) AS n
      FROM legacy_grades lg
      JOIN students s ON s."studentCode" = lg."studentCode" AND s."universityId" = $1
      LEFT JOIN academic_terms t ON t."termCode" = lg."termCode" AND t."universityId" = $1
      LEFT JOIN courses c ON c.code = lg."courseCode" AND c."universityId" = $1
      LEFT JOIN course_offerings co ON co."termId" = t.id AND co."courseId" = c.id
        AND co."groupNumber" = CASE WHEN (lg.raw::json->>'group') ~ '^\\d+$' THEN (lg.raw::json->>'group')::int ELSE 1 END
      LEFT JOIN enrollments e ON e."studentId" = s.id AND e."offeringId" = co.id
      WHERE lg."sourceCode" = $2 AND e.id IS NULL
    `, [u.id, u.code]);
    console.log('legacy rows with NO matching enrollment:', noEnr.rows[0].n);
  }
  await pool.end();
}
main().catch(console.error);
