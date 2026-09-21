import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  console.log('=== Investigating Missing AFAGH Legacy Grades in Enrollments ===\n');

  // Let's see why legacy_grades of AFAGH are not in enrollments
  // 1. How many legacy_grades for AFAGH?
  const totalLegacy = (await pool.query(`SELECT COUNT(*) as n FROM legacy_grades WHERE "sourceCode" = 'AFAGH'`)).rows[0].n;
  console.log('Total AFAGH legacy_grades:', totalLegacy);

  // 2. How many distinct students in AFAGH legacy_grades?
  const legacyStudents = (await pool.query(`SELECT COUNT(DISTINCT "studentCode") as n FROM legacy_grades WHERE "sourceCode" = 'AFAGH'`)).rows[0].n;
  console.log('Distinct studentCodes in AFAGH legacy_grades:', legacyStudents);

  // 3. How many distinct students in students table for AFAGH (universityId = 1)?
  const dbStudents = (await pool.query(`SELECT COUNT(DISTINCT "studentCode") as n FROM students WHERE "universityId" = 1`)).rows[0].n;
  console.log('Distinct studentCodes in students table for AFAGH (uni=1):', dbStudents);

  // 4. Are there studentCodes in AFAGH legacy_grades that are NOT in students table?
  const missingStudents = await pool.query(`
    SELECT COUNT(DISTINCT lg."studentCode") as n
    FROM legacy_grades lg
    LEFT JOIN students s ON s."studentCode" = lg."studentCode" AND s."universityId" = 1
    WHERE lg."sourceCode" = 'AFAGH' AND s.id IS NULL
  `);
  console.log('AFAGH legacy students NOT in students table (uni=1):', missingStudents.rows[0].n);

  // 5. How many legacy_grades belong to these missing students?
  const missingStudentGrades = await pool.query(`
    SELECT COUNT(*) as n
    FROM legacy_grades lg
    LEFT JOIN students s ON s."studentCode" = lg."studentCode" AND s."universityId" = 1
    WHERE lg."sourceCode" = 'AFAGH' AND s.id IS NULL
  `);
  console.log('AFAGH legacy records belonging to students NOT in students table:', missingStudentGrades.rows[0].n);

  // 6. For students who ARE in students table, are there legacy_grades missing from enrollments?
  const missingExistingStudentGrades = await pool.query(`
    SELECT COUNT(*) as n
    FROM legacy_grades lg
    JOIN students s ON s."studentCode" = lg."studentCode" AND s."universityId" = 1
    LEFT JOIN academic_terms t ON t."termCode" = lg."termCode" AND t."universityId" = 1
    LEFT JOIN courses c ON c.code = lg."courseCode" AND c."universityId" = 1
    LEFT JOIN course_offerings co ON co."courseId" = c.id AND co."termId" = t.id
    LEFT JOIN enrollments e ON e."studentId" = s.id AND e."offeringId" = co.id
    WHERE lg."sourceCode" = 'AFAGH' AND e.id IS NULL
  `);
  console.log('AFAGH legacy records for existing students with NO enrollment:', missingExistingStudentGrades.rows[0].n);

  // 7. Check why: missing terms? missing courses? or just never backfilled?
  const missingTerms = await pool.query(`
    SELECT COUNT(*) as n
    FROM legacy_grades lg
    JOIN students s ON s."studentCode" = lg."studentCode" AND s."universityId" = 1
    LEFT JOIN academic_terms t ON t."termCode" = lg."termCode" AND t."universityId" = 1
    WHERE lg."sourceCode" = 'AFAGH' AND t.id IS NULL
  `);
  console.log('AFAGH legacy records where termCode is missing in academic_terms:', missingTerms.rows[0].n);

  const missingCourses = await pool.query(`
    SELECT COUNT(*) as n
    FROM legacy_grades lg
    JOIN students s ON s."studentCode" = lg."studentCode" AND s."universityId" = 1
    LEFT JOIN courses c ON c.code = lg."courseCode" AND c."universityId" = 1
    WHERE lg."sourceCode" = 'AFAGH' AND c.id IS NULL
  `);
  console.log('AFAGH legacy records where courseCode is missing in courses:', missingCourses.rows[0].n);

  await pool.end();
}

main().catch(console.error);
