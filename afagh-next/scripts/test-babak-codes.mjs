import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const c = await pool.connect();
  try {
    // بابک حداد
    const studentId = 38436;
    const enrs = await c.query(`
      SELECT e.id, e."samaGradeStatusCode" as current_code, e."gradeValue",
        t."termCode", c.code as "courseCode", c.title as "courseTitle",
        co.id as "offeringId"
      FROM enrollments e
      JOIN course_offerings co ON co.id = e."offeringId"
      JOIN academic_terms t ON t.id = co."termId"
      JOIN courses c ON c.id = co."courseId"
      WHERE e."studentId" = $1
      ORDER BY t."termCode", c.code
    `, [studentId]);

    console.log('=== بابک حداد — بررسی کدها ===');
    console.log('کد دانشجویی: 9921312004');
    console.log('');

    for (const r of enrs.rows) {
      const g = parseFloat(r.gradeValue);
      const expected = g >= 10 ? '1' : '2';
      const ok = r.current_code === expected;
      console.log(`${ok ? '✓' : '✗'} ترم ${r.termCode} | ${r.courseCode} (${r.courseTitle}) | نمره: ${r.gradeValue} | کد فعلی: ${r.current_code} | کد صحیح: ${expected}`);
    }
  } finally { c.release(); await pool.end(); }
}
main().catch(console.error);
