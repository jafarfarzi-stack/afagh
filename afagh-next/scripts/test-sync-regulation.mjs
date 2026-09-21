import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

function termSortOrder(termCode) {
  if (!termCode) return 0;
  const clean = String(termCode).replace(/[^0-9]/g, '');
  if (!clean) return 0;
  if (/^\d{3}$/.test(clean)) {
    const yy = parseInt(clean.slice(0, 2), 10);
    const sem = parseInt(clean.slice(2), 10);
    const fullYear = yy >= 50 ? 1300 + yy : 1400 + yy;
    return fullYear * 10 + sem;
  }
  if (/^\d{5}$/.test(clean)) return parseInt(clean, 10);
  if (/^\d{4}$/.test(clean)) return parseInt(clean, 10) * 10 + 1;
  return parseInt(clean, 10) || 0;
}

async function testBabak() {
  const client = await pool.connect();
  try {
    const stuRes = await client.query(`SELECT id, "studentCode", "regulationId" FROM students WHERE "studentCode" = '9921312004';`);
    const stu = stuRes.rows[0];

    // Check all enrollments for course 31001 and 31017
    for (const code of ['31001', '31017']) {
      const enrs = await client.query(`
        SELECT e.id, e."gradeValue", e."gradeStatus", e."samaGradeStatusCode", t."termCode", c.id as course_id
        FROM enrollments e
        JOIN course_offerings co ON co.id = e."offeringId"
        JOIN courses c ON c.id = co."courseId"
        JOIN academic_terms t ON t.id = co."termId"
        WHERE e."studentId" = $1 AND c.code = $2
        ORDER BY t."termCode" ASC;
      `, [stu.id, code]);

      console.log(`Course ${code} enrollments:`, enrs.rows.map(r => ({
        id: r.id,
        term: r.termCode,
        sortOrder: termSortOrder(r.termCode),
        grade: r.gradeValue,
        status: r.gradeStatus,
        samaCode: r.samaGradeStatusCode,
      })));
    }
  } finally {
    client.release();
    await pool.end();
  }
}

testBabak().catch(console.error);
