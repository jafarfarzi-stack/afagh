import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

async function main() {
  const res = await pool.query(`
    SELECT length("termCode") as len, count(*), min("termCode"), max("termCode")
    FROM legacy_grades
    WHERE "sourceCode" = 'AFAGH'
    GROUP BY length("termCode")
    ORDER BY len
  `);
  console.log(res.rows);
}

main().catch(console.error).finally(() => pool.end());
