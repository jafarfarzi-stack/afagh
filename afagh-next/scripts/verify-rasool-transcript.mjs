import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const stu = await pool.query(`
    SELECT s.id, s."studentCode", u."firstName", u."lastName", m.name as "majorName", f.name as "facultyName", s."militaryStatus", s."acceptanceType", s."studyingMode"
    FROM students s
    JOIN users u ON u.id = s."userId"
    LEFT JOIN majors m ON m.id = s."majorId"
    LEFT JOIN faculties f ON f.id = m."facultyId"
    WHERE s."studentCode" = '9992243001'
  `);
  console.log('Student Info:', stu.rows[0]);

  const grades = await pool.query(`
    SELECT "termCode", "courseCode", "courseTitle", units, "gradeValue", "gradeStatus"
    FROM legacy_grades
    WHERE "studentCode" = '9992243001'
    ORDER BY "termCode" DESC, "courseCode"
    LIMIT 10
  `);
  console.log('Grades sample for Rasool:');
  console.table(grades.rows);
}

main().catch(console.error).finally(() => pool.end());
