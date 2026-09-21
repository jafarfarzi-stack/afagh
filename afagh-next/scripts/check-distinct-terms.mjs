import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://afagh:afagh@localhost:5432/afagh_db',
});

async function main() {
  const allTerms = await pool.query(`
    SELECT "termCode", 'academic_terms' as tbl FROM academic_terms
    UNION
    SELECT "termCode", 'legacy_grades' as tbl FROM legacy_grades
    UNION
    SELECT "termCode", 'student_term_states' as tbl FROM student_term_states
  `);

  const distinct = [...new Set(allTerms.rows.map(r => r.termCode))].sort();
  console.log('Total distinct termCodes:', distinct.length);

  const nonStandard = distinct.filter(c => !/^\d{5}$/.test(c));
  console.log('Non-standard (not 5-digit):', nonStandard);

  const standard = distinct.filter(c => /^\d{5}$/.test(c));
  console.log('Standard 5-digit count:', standard.length);
  console.log('Standard samples min/max:', standard.slice(0, 5), standard.slice(-5));

  await pool.end();
}

main().catch(console.error);
