import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const res = await pool.query(`
    SELECT "termCode", count(*)
    FROM legacy_grades
    WHERE "sourceCode" = 'AFAGH' AND length("termCode") = 3
    GROUP BY "termCode"
    ORDER BY "termCode"
  `);
  console.log(res.rows);
}

main().catch(console.error).finally(() => pool.end());
