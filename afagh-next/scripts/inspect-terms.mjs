import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const terms = await pool.query('SELECT "termCode", title, "universityId" FROM academic_terms WHERE "termCode" NOT LIKE \'14%\' AND "termCode" NOT LIKE \'13%\' LIMIT 20');
  console.log('Non-standard terms in academic_terms:', terms.rows);

  const lgTerms = await pool.query('SELECT "termCode", count(*) FROM legacy_grades WHERE "termCode" NOT LIKE \'14%\' AND "termCode" NOT LIKE \'13%\' GROUP BY 1 ORDER BY 2 DESC LIMIT 20');
  console.log('Non-standard terms in legacy_grades:', lgTerms.rows);
}

main().catch(console.error).finally(() => pool.end());
